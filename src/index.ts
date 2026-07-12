import { MinecraftBody } from "./body/minecraft-body.js";
import { Planner } from "./brain/planner.js";
import { ChatBrain } from "./brain/chat.js";
import { AgentLoop } from "./agent/agent-loop.js";
import { envInt, envStr, loadDefaultEnv } from "./env.js";
import { DEFAULT_HUMANIZER, type HumanizerConfig } from "./util/humanize.js";

loadDefaultEnv();

function envBool(key: string, def: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return def;
  return v === "true" || v === "1" || v === "yes";
}

/** Temperatures are stored as integers (0..200) in .env; OpenAI wants 0..2. */
function envTemp(key: string, def: number): number {
  return envInt(key, Math.round(def * 100)) / 100;
}

async function main(): Promise<void> {
  const personaName = envStr("PERSONA_NAME", "Oneiro");
  const personaLang = envStr("PERSONA_LANG", "ru");

  console.log("============================================");
  console.log(`  ${personaName} — Embodied Minecraft Agent`);
  console.log("  Body + Reflex + Planner + Chat");
  console.log("============================================\n");

  const bodyConfig = {
    host: envStr("MC_HOST", "127.0.0.1"),
    port: envInt("MC_PORT", 25565),
    username: envStr("MC_USERNAME", personaName),
    version: envStr("MC_VERSION", "1.21.11") || undefined,
    auth: envStr("MC_AUTH", "offline") as "offline" | "microsoft",
  };

  const humanizer: HumanizerConfig = {
    enabled: envBool("HUMANIZE", DEFAULT_HUMANIZER.enabled),
    reactMinMs: envInt("REACT_DELAY_MIN_MS", DEFAULT_HUMANIZER.reactMinMs),
    reactMaxMs: envInt("REACT_DELAY_MAX_MS", DEFAULT_HUMANIZER.reactMaxMs),
    typingCps: envInt("TYPING_CPS", DEFAULT_HUMANIZER.typingCps),
  };

  const plannerBaseURL = envStr(
    "PLANNER_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta/openai/",
  );
  const plannerApiKey = envStr("PLANNER_API_KEY", "");
  if (!plannerApiKey) {
    console.error("[Config] PLANNER_API_KEY is missing — set it in .env");
    process.exit(1);
  }

  const planner = new Planner({
    baseURL: plannerBaseURL,
    apiKey: plannerApiKey,
    model: envStr("PLANNER_MODEL", "gemini-3.5-flash"),
    temperature: envTemp("PLANNER_TEMPERATURE", 0.8),
    maxTokens: envInt("PLANNER_MAX_TOKENS", 800),
    personaName,
    personaLang,
  });

  const chat = new ChatBrain({
    baseURL: plannerBaseURL,
    apiKey: plannerApiKey,
    model: envStr("CHAT_MODEL", "gemini-3.5-flash"),
    temperature: envTemp("CHAT_TEMPERATURE", 0.95),
    maxTokens: envInt("CHAT_MAX_TOKENS", 120),
    personaName,
    personaLang,
  });

  console.log("[Config]");
  console.log(`  Minecraft: ${bodyConfig.host}:${bodyConfig.port} as ${bodyConfig.username}`);
  console.log(`  Planner:   ${envStr("PLANNER_MODEL", "gemini-3.5-flash")} every ${envInt("PLAN_INTERVAL_MS", 30000)}ms`);
  console.log(`  Chat:      ${envStr("CHAT_MODEL", "gemini-3.5-flash")}`);
  console.log(`  Humanizer: ${humanizer.enabled ? "on" : "off"} (${humanizer.reactMinMs}-${humanizer.reactMaxMs}ms, ${humanizer.typingCps}cps)\n`);

  let agent: AgentLoop | null = null;

  const body = new MinecraftBody(bodyConfig, {
    onSpawn: (obs) => {
      console.log(`[Body] Spawned at ${JSON.stringify(obs.position)} biome=${obs.biome} hp=${obs.health} food=${obs.food}`);
    },
    onKicked: (reason) => console.error(`[Body] Kicked: ${reason}`),
    onError: (err) => console.error(`[Body] Error: ${err.message}`),
    onChat: (username, message) => {
      console.log(`[Chat] ${username}: ${message}`);
      agent?.handleChat(username, message);
    },
  });

  console.log("[Connect] Connecting to Minecraft...");
  await body.connect();
  console.log("[Connect] Connected.\n");

  agent = new AgentLoop(body, planner, chat, {
    planIntervalMs: envInt("PLAN_INTERVAL_MS", 30000),
    humanizer,
    personaName,
    ambientReplyChance: 0.25,
    chatCooldownMs: 2500,
  });
  agent.start();
  console.log("[Agent] Loop started. Living as a player now.\n");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[Shutdown] ${signal} received, stopping...`);
    agent?.stop();
    await body.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
