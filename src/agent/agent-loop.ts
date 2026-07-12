import type { MinecraftBody } from "../body/minecraft-body.js";
import type { Planner } from "../brain/planner.js";
import type { ChatBrain } from "../brain/chat.js";
import type { Goal } from "../schemas/intents.js";
import {
  type HumanizerConfig,
  sleep,
  pauseHuman,
  typingDelayMs,
  chance,
} from "../util/humanize.js";

/**
 * AgentLoop — the orchestrator that ties body, planner and chat brain into one
 * believable player.
 *
 *   observe → plan (slow, ~30s) → act
 *        ↳ SURVIVE preempts planning when in danger
 *        ↳ chat is handled reactively, out of band, with human typing delays
 *
 * The whole design goal is "reads as a human": jittered reaction delays before
 * acting, a cooldown so it doesn't machine-gun chat replies, and a bias toward
 * small, unhurried goals.
 */

export interface AgentLoopConfig {
  planIntervalMs: number;
  humanizer: HumanizerConfig;
  personaName: string;
  /** Probability of replying to nearby chatter not addressed to us. */
  ambientReplyChance: number;
  /** Minimum gap between two chat replies (anti-spam / anti-robot). */
  chatCooldownMs: number;
}

interface LastGoal {
  intent: string;
  success: boolean;
  message: string;
}

export class AgentLoop {
  private running = false;
  private planTimer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private lastGoal: LastGoal | null = null;
  private recentChat: string[] = [];
  private lastChatReplyAt = 0;
  private replying = false;

  constructor(
    private body: MinecraftBody,
    private planner: Planner,
    private chat: ChatBrain,
    private cfg: AgentLoopConfig,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    // Kick a first tick shortly after spawn (not instantly — a human orients
    // themselves for a beat before doing anything).
    void sleep(1500 + Math.floor(this.cfg.planIntervalMs * 0.1)).then(() =>
      this.tick(),
    );

    this.planTimer = setInterval(() => void this.tick(), this.cfg.planIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.planTimer) {
      clearInterval(this.planTimer);
      this.planTimer = null;
    }
  }

  /** One observe → plan → act cycle. */
  private async tick(): Promise<void> {
    if (!this.running || this.busy || !this.body.isRunning) return;
    this.busy = true;
    try {
      const obs = this.body.observe();

      // Reset the per-goal step budget so maxSteps applies per tick.
      this.body.safetyGuard.resetSteps();

      let goal: Goal;
      let thought: string;

      // Reflex-level preemption: danger short-circuits the slow planner.
      if (obs.is_in_danger) {
        goal = { intent: "SURVIVE", priority: "critical", reason: "danger nearby" };
        thought = "опасно, надо валить";
      } else {
        const plan = await this.planner.plan({
          observation: obs,
          lastGoal: this.lastGoal,
          recentChat: this.recentChat.slice(-4),
        });
        goal = plan.goal;
        thought = plan.thought;
      }

      console.log(`[Plan] ${goal.intent}${goal.target ? ` ${goal.target}` : ""} — ${thought}`);

      // Human reaction beat before acting.
      await pauseHuman(this.cfg.humanizer);
      if (!this.running || !this.body.isRunning) return;

      const result = await this.body.act(goal);
      this.lastGoal = {
        intent: goal.intent,
        success: result.success,
        message: result.message,
      };
      console.log(`[Act] ${goal.intent} → ${result.success ? "ok" : "fail"}: ${result.message}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[AgentLoop] tick error: ${msg}`);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Handle an incoming chat line. Decides whether to reply, and if so, does it
   * with a human-plausible "reading + typing" delay. Fire-and-forget from the
   * body's chat event.
   */
  handleChat(username: string, message: string): void {
    if (username === this.cfg.personaName) return;
    this.recentChat.push(`${username}: ${message}`);
    if (this.recentChat.length > 12) this.recentChat.shift();

    if (!this.shouldReply(username, message)) return;
    void this.composeAndSend(username, message);
  }

  private shouldReply(_username: string, message: string): boolean {
    if (this.replying) return false;
    const now = Date.now();
    if (now - this.lastChatReplyAt < this.cfg.chatCooldownMs) return false;

    const lower = message.toLowerCase();
    const name = this.cfg.personaName.toLowerCase();
    const addressed =
      lower.includes(name) ||
      /\b(бот|bot|ты кто|ты живой|привет|прив|хай|hello|hi|здаров|здарова)\b/.test(lower);

    if (addressed) return true;
    // Otherwise only occasionally chime in on ambient chatter.
    return chance(this.cfg.ambientReplyChance);
  }

  private async composeAndSend(username: string, message: string): Promise<void> {
    this.replying = true;
    try {
      const reply = await this.chat.respondTo(
        username,
        message,
        this.recentChat.slice(-6),
      );
      if (!reply) return;

      // Read + type like a person: short pause, then time proportional to length.
      await pauseHuman(this.cfg.humanizer);
      await sleep(typingDelayMs(reply, this.cfg.humanizer));
      if (!this.body.isRunning) return;

      this.body.say(reply);
      this.recentChat.push(`${this.cfg.personaName}: ${reply}`);
      if (this.recentChat.length > 12) this.recentChat.shift();
      this.lastChatReplyAt = Date.now();
      console.log(`[Chat] ${this.cfg.personaName}: ${reply}`);
    } finally {
      this.replying = false;
    }
  }
}
