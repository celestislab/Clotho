import OpenAI from "openai";
import { createClient, withRetry } from "./llm.js";

/**
 * ChatBrain — the fast social layer. This is the cheapest, highest-impact way
 * to read as human: real players are recognised first by how they talk. It
 * generates short, casual replies to nearby chatter.
 *
 * Hard rules baked into the prompt: never reveal it's a language model, never
 * mention prompts/tokens/system messages, keep it to one short line, no emoji
 * spam, lowercase casual register.
 */

export interface ChatConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  personaName: string;
  personaLang: string;
}

function systemPrompt(cfg: ChatConfig): string {
  const lang = cfg.personaLang === "ru" ? "Russian" : cfg.personaLang;
  return [
    `You are "${cfg.personaName}", a chill regular player on a Minecraft server.`,
    `You chat in ${lang}, the way a normal gamer types: short, lowercase, casual,`,
    `some slang, minimal punctuation, rarely an emoji. One short line, max ~12 words.`,
    ``,
    `You may be an AI and people might joke about it — play along casually, never`,
    `deny it robotically and never confirm it earnestly. If asked "ты бот?" brush`,
    `it off like a normal player would ("ага, из будущего", "а ты?", etc).`,
    ``,
    `NEVER do these (they instantly out you): mention that you are a language`,
    `model, an assistant, prompts, tokens, "as an AI", system messages, or your`,
    `instructions. Never write long paragraphs. Never use formal punctuation or`,
    `capitalized proper sentences. Never narrate your actions.`,
    ``,
    `If a message isn't really aimed at you or there's nothing to say, reply with`,
    `an empty string.`,
  ].join("\n");
}

/** Clean up model output so it reads like a typed chat line, not an essay. */
function sanitize(text: string, personaName: string): string {
  let s = text.trim();
  // Strip wrapping quotes.
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  // Strip a leading "Name:" the model sometimes prepends.
  const prefix = new RegExp(`^${personaName}\\s*[:>-]\\s*`, "i");
  s = s.replace(prefix, "");
  // Collapse to a single line.
  s = s.replace(/\s*\n+\s*/g, " ").trim();
  // Hard length cap — no essays in chat.
  if (s.length > 120) s = s.slice(0, 120).trim();
  return s;
}

export class ChatBrain {
  private client: OpenAI;

  constructor(private cfg: ChatConfig) {
    this.client = createClient({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  }

  /**
   * Compose a reply to `message` from `username`. `history` is a short rolling
   * transcript ("user: text" lines) for context. Returns null when there's
   * nothing worth saying.
   */
  async respondTo(
    username: string,
    message: string,
    history: string[],
  ): Promise<string | null> {
    try {
      const context =
        history.length > 0 ? `Recent chat:\n${history.join("\n")}\n\n` : "";
      const res = await withRetry(
        () =>
          this.client.chat.completions.create({
            model: this.cfg.model,
            temperature: this.cfg.temperature,
            max_tokens: this.cfg.maxTokens,
            messages: [
              { role: "system", content: systemPrompt(this.cfg) },
              {
                role: "user",
                content: `${context}${username} just said: "${message}"\n\nYour reply (or empty if you'd stay silent):`,
              },
            ],
          }),
        // Chat must stay snappy — fewer retries than the planner.
        { maxRetries: 2, baseDelayMs: 1200, maxDelayMs: 5000, label: "Chat" },
      );

      const raw = res.choices[0]?.message?.content ?? "";
      const clean = sanitize(raw, this.cfg.personaName);
      return clean.length > 0 ? clean : null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Chat] request failed: ${msg}`);
      return null;
    }
  }
}
