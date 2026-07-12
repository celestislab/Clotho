/**
 * Humanizer — pure timing utilities that make the agent's actions read as
 * human rather than robotic. Game-agnostic: no mineflayer, no game state.
 *
 * Real players don't act on 0ms reflexes or perfectly even intervals. These
 * helpers inject jittered delays so movement, chat, and reactions land in a
 * human-plausible timing envelope.
 */

export interface HumanizerConfig {
  enabled: boolean;
  reactMinMs: number;
  reactMaxMs: number;
  /** Characters "typed" per second when composing a chat message. */
  typingCps: number;
}

export const DEFAULT_HUMANIZER: HumanizerConfig = {
  enabled: true,
  reactMinMs: 180,
  reactMaxMs: 520,
  typingCps: 7,
};

/** Sleep for a fixed number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

/** Uniform random integer in [min, max]. */
function randInt(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * A single human reaction delay (e.g. before starting a new action). Skews
 * slightly toward the lower end so the agent doesn't feel sluggish, while
 * still varying enough to never be metronomic.
 */
export function reactionDelay(cfg: HumanizerConfig): number {
  if (!cfg.enabled) return 0;
  const a = randInt(cfg.reactMinMs, cfg.reactMaxMs);
  const b = randInt(cfg.reactMinMs, cfg.reactMaxMs);
  return Math.min(a, b); // min of two uniforms — biases toward faster reactions
}

/** Await a human reaction delay. */
export function pauseHuman(cfg: HumanizerConfig): Promise<void> {
  return sleep(reactionDelay(cfg));
}

/**
 * How long it would take a human to type `text`, with a small random tail so
 * two identical messages don't take identical time. Clamped so very long
 * planner-authored lines don't stall the bot for many seconds.
 */
export function typingDelayMs(text: string, cfg: HumanizerConfig): number {
  if (!cfg.enabled) return 0;
  const cps = Math.max(2, cfg.typingCps);
  const base = (text.length / cps) * 1000;
  const jitter = randInt(120, 480);
  return Math.min(6000, Math.round(base) + jitter);
}

/** Occasionally true — for injecting rare idle "human" beats. */
export function chance(p: number): boolean {
  return Math.random() < p;
}
