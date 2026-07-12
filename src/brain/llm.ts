import OpenAI from "openai";

/**
 * Shared LLM plumbing for the planner and chat brains. Both talk to an
 * OpenAI-compatible endpoint (Gemini's, OpenRouter's, a local vLLM, …), so the
 * client construction and — critically — the retry/backoff policy live here.
 *
 * Free-tier Gemini rate limits are aggressive; a single 429 must not knock the
 * agent straight into IDLE. We retry transient failures (429, 5xx) with
 * exponential backoff, honouring the server's requested retry delay when given.
 */

export interface LlmClientConfig {
  baseURL: string;
  apiKey: string;
}

export function createClient(cfg: LlmClientConfig): OpenAI {
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

interface ApiErrorish {
  status?: number;
  headers?: Record<string, string> | undefined;
  message?: string;
}

function statusOf(err: unknown): number | undefined {
  const e = err as ApiErrorish;
  return typeof e?.status === "number" ? e.status : undefined;
}

/** Parse a retry delay (ms) from a Retry-After header or Google's message text. */
function retryDelayMs(err: unknown): number | null {
  const e = err as ApiErrorish;
  const header = e?.headers?.["retry-after"];
  if (header) {
    const secs = Number(header);
    if (!Number.isNaN(secs)) return Math.round(secs * 1000);
  }
  // Google embeds "Please retry in 1.29s" / a retryDelay field in the message.
  const msg = e?.message ?? "";
  const m = msg.match(/retry in (\d+(?:\.\d+)?)s/i) ?? msg.match(/"?retryDelay"?:\s*"?(\d+(?:\.\d+)?)s/i);
  if (m?.[1]) return Math.round(parseFloat(m[1]) * 1000);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

export interface RetryOptions {
  maxRetries: number;
  /** Base backoff in ms; doubled each attempt, jittered. */
  baseDelayMs: number;
  /** Never wait longer than this between attempts. */
  maxDelayMs: number;
  /** Label for logs. */
  label: string;
}

export const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1500,
  maxDelayMs: 8000,
  label: "llm",
};

/**
 * Run an LLM call with retry/backoff on transient errors. Non-retryable errors
 * (auth, bad request) throw immediately so the caller's fallback kicks in.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = DEFAULT_RETRY,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = statusOf(err);
      const retryable = status === undefined || RETRYABLE_STATUS.has(status);
      if (!retryable || attempt === opts.maxRetries) break;

      const server = retryDelayMs(err);
      const backoff = Math.min(
        opts.maxDelayMs,
        opts.baseDelayMs * 2 ** attempt,
      );
      const jitter = Math.floor(Math.random() * 400);
      const wait = (server ?? backoff) + jitter;
      console.warn(
        `[${opts.label}] ${status ?? "network"} — retry ${attempt + 1}/${opts.maxRetries} in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw lastErr;
}
