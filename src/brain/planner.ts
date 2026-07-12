import OpenAI from "openai";
import {
  PlannerResponseSchema,
  type PlannerResponse,
  INTENT_DESCRIPTIONS,
} from "../schemas/intents.js";
import type { Observation } from "../schemas/observation.js";
import { createClient, withRetry } from "./llm.js";

/**
 * Planner — the slow strategic brain. Runs every ~30s, looks at the world
 * state, and picks ONE small high-level goal (a UMAS Intent). It never emits
 * raw movement — that's the body's job.
 *
 * Personality contract: this is not a min-maxing bot. It plays like a curious,
 * slightly aimless human — wanders, pokes at interesting blocks, greets people,
 * takes breaks. "What would a chill player do right now", not "optimal path to
 * diamonds".
 */

export interface PlannerConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  /** 0..2 (OpenAI scale). */
  temperature: number;
  maxTokens: number;
  personaName: string;
  personaLang: string;
}

export interface PlannerContext {
  observation: Observation;
  lastGoal?: { intent: string; success: boolean; message: string } | null;
  recentChat?: string[];
}

function systemPrompt(cfg: PlannerConfig): string {
  return [
    `You are the mind of "${cfg.personaName}", a regular player on a Minecraft server.`,
    `You are an AI, and people on the server may know that — but you behave like an ordinary, relaxed human player, not an optimizer.`,
    ``,
    `Every ~30 seconds you look at the world and choose exactly ONE small next goal.`,
    `Think like a casual human: wander a bit, mine something that caught your eye,`,
    `follow or greet a nearby player, take in the scenery, sometimes just idle.`,
    `Do NOT grind efficiently, do NOT announce your plans, do NOT act like a machine.`,
    `Small, believable goals beat ambitious ones.`,
    ``,
    `Available intents:`,
    ...Object.entries(INTENT_DESCRIPTIONS).map(([k, v]) => `  - ${k}: ${v}`),
    ``,
    `Safety: if health or food is low, or a hostile mob is close, choose SURVIVE.`,
    ``,
    `Respond with ONLY a JSON object — no markdown, no comments, no placeholders.`,
    `Here is an example of the EXACT shape (copy the structure, not the values):`,
    `{`,
    `  "goal": {`,
    `    "intent": "MINE_TASK",`,
    `    "target": "oak_log",`,
    `    "count": 4,`,
    `    "priority": "normal",`,
    `    "reason": "нужно немного дерева на старте"`,
    `  },`,
    `  "thought": "оо, деревья рядом, пойду нарублю",`,
    `  "confidence": 0.8`,
    `}`,
    ``,
    `Field rules:`,
    `  - intent: exactly one of the intents listed above.`,
    `  - target: a block name (oak_log, stone) or a player name. Leave the key out if not needed.`,
    `  - count: integer 1..64, only for MINE_TASK / CRAFT_TASK.`,
    `  - position: an object {"x":N,"y":N,"z":N} ONLY for GOTO or PLACE_TASK; otherwise leave the key out entirely.`,
    `  - priority: one of "low", "normal", "high", "critical".`,
    `  - reason: a short in-character phrase.`,
    `  - thought: one short casual line of inner monologue, in ${cfg.personaLang}.`,
    `  - confidence: a number between 0 and 1.`,
  ].join("\n");
}

/** Trim the observation down to what the planner actually needs (token budget). */
function compactObservation(obs: Observation): Record<string, unknown> {
  return {
    health: obs.health,
    food: obs.food,
    position: obs.position,
    biome: obs.biome,
    time_of_day: obs.time_of_day,
    in_danger: obs.is_in_danger,
    holding: obs.equipped_item,
    inventory: obs.inventory_summary.map((i) => `${i.count}x ${i.name}`),
    nearby_blocks: obs.nearby_blocks.map(
      (b) => `${b.name} (${b.closest_distance}m ${b.direction})`,
    ),
    nearby_entities: obs.nearby_entities.map(
      (e) => `${e.name} [${e.type}${e.is_hostile ? " HOSTILE" : ""}] ${e.distance}m`,
    ),
    recent_events: obs.recent_events,
  };
}

function userPrompt(ctx: PlannerContext): string {
  const parts: string[] = [
    `World state:`,
    JSON.stringify(compactObservation(ctx.observation), null, 0),
  ];
  if (ctx.lastGoal) {
    parts.push(
      ``,
      `Your last goal: ${ctx.lastGoal.intent} — ${ctx.lastGoal.success ? "ok" : "failed"} (${ctx.lastGoal.message})`,
    );
  }
  if (ctx.recentChat && ctx.recentChat.length > 0) {
    parts.push(``, `Recent chat:`, ...ctx.recentChat.map((c) => `  ${c}`));
  }
  parts.push(``, `Pick your next single goal now. JSON only.`);
  return parts.join("\n");
}

/** Strip markdown fences / stray prose and pull out the first JSON object. */
function extractJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  // Defensive: Gemini occasionally echoes `// ...` comments from the template
  // and trailing commas, both of which are invalid JSON. Strip them.
  s = s
    .replace(/(?<!:)\/\/[^\n\r]*/g, "") // line comments (not :// in URLs)
    .replace(/,(\s*[}\]])/g, "$1"); // trailing commas before } or ]
  return JSON.parse(s) as unknown;
}

function fallbackResponse(reason: string): PlannerResponse {
  return {
    goal: {
      intent: "IDLE",
      priority: "low",
      reason,
    },
    thought: "чёт задумался, постою пока",
    confidence: 0.2,
  };
}

export class Planner {
  private client: OpenAI;

  constructor(private cfg: PlannerConfig) {
    this.client = createClient({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  }

  async plan(ctx: PlannerContext): Promise<PlannerResponse> {
    try {
      const res = await withRetry(
        () =>
          this.client.chat.completions.create({
            model: this.cfg.model,
            temperature: this.cfg.temperature,
            max_tokens: this.cfg.maxTokens,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt(this.cfg) },
              { role: "user", content: userPrompt(ctx) },
            ],
          }),
        { maxRetries: 3, baseDelayMs: 1500, maxDelayMs: 8000, label: "Planner" },
      );

      const raw = res.choices[0]?.message?.content ?? "";
      if (!raw.trim()) return fallbackResponse("empty planner response");

      const parsed = extractJson(raw);
      const validated = PlannerResponseSchema.safeParse(parsed);
      if (validated.success) return validated.data;

      console.warn(
        `[Planner] schema mismatch: ${validated.error.issues[0]?.message ?? "unknown"}`,
      );
      return fallbackResponse("planner output invalid");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Planner] request failed: ${msg}`);
      return fallbackResponse("planner unavailable");
    }
  }
}
