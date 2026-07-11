import mineflayer from "mineflayer";
import { pathfinder } from "mineflayer-pathfinder";
import type { Bot } from "mineflayer";
import type { Observation } from "../schemas/observation.js";
import type { Goal, GoalResult } from "../schemas/intents.js";
import { SafetyGuard } from "../reflex/safety-guard.js";
import { extractObservation } from "./state-extractor.js";
import { executeGoal } from "./action-executor.js";

export interface BodyConfig {
  host: string;
  port: number;
  username: string;
  version?: string;
  auth?: "offline" | "microsoft";
}

export interface BodyEvents {
  onSpawn: (obs: Observation) => void;
  onObservation: (obs: Observation) => void;
  onChat: (username: string, message: string) => void;
  onError: (err: Error) => void;
  onKicked: (reason: string) => void;
}

export class MinecraftBody {
  private bot: Bot | null = null;
  private guard: SafetyGuard;
  private events: Partial<BodyEvents>;
  private eventLog: string[] = [];
  private running = false;

  constructor(
    private config: BodyConfig,
    events: Partial<BodyEvents> = {},
  ) {
    this.events = events;
    this.guard = new SafetyGuard();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const bot = mineflayer.createBot({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        version: this.config.version,
        auth: this.config.auth ?? "offline",
      });

      bot.loadPlugin(pathfinder);

      bot.once("spawn", () => {
        this.bot = bot;
        this.running = true;
        this.setupHandlers(bot);
        const obs = extractObservation(bot, this.eventLog);
        this.events.onSpawn?.(obs);
        resolve();
      });

      bot.once("kicked", (reason: string) => {
        this.events.onKicked?.(reason);
        if (!this.bot) reject(new Error(`Kicked before spawn: ${reason}`));
      });

      bot.once("error", (err: Error) => {
        this.events.onError?.(err);
        if (!this.bot) reject(err);
      });
    });
  }

  private setupHandlers(bot: Bot): void {
    bot.on("health", () => {
      if (this.guard.shouldStop(bot.health, bot.food)) {
        this.guard.triggerEmergency(bot, "Low health/food");
        this.pushEvent(`Emergency: health=${bot.health.toFixed(0)} food=${bot.food.toFixed(0)}`);
      } else if (this.guard.isEmergency && this.guard.emergencyReasonText === "Low health/food") {
        this.guard.clearEmergency();
        this.pushEvent(`Emergency cleared: health=${bot.health.toFixed(0)} food=${bot.food.toFixed(0)}`);
      }
    });

    let lastHostileCheck = 0;
    bot.on("physicsTick", () => {
      const now = Date.now();
      if (now - lastHostileCheck < 500) return;
      lastHostileCheck = now;

      if (!this.running || !this.bot) return;

      const pos = bot.entity.position;
      const hostileMobNames = [
        "zombie", "creeper", "skeleton", "spider", "witch", "enderman", 
        "phantom", "husk", "drowned", "slime", "magma_cube", "cave_spider", 
        "hoglin", "piglin", "pillager", "ravager", "evoker", "vindicator"
      ];
      
      let closestMob: any = null;
      let closestDist = Infinity;
      for (const id in bot.entities) {
        const entity = bot.entities[id];
        if (entity && entity.type === "mob" && entity.name && hostileMobNames.includes(entity.name)) {
          const dist = pos.distanceTo(entity.position);
          if (dist < closestDist) {
            closestDist = dist;
            closestMob = entity;
          }
        }
      }

      if (closestMob && closestDist < 10 && Math.abs(pos.y - closestMob.position.y) < 5) {
        if (!this.guard.isEmergency) {
          this.guard.triggerEmergency(bot, `Hostile mob ${closestMob.name} nearby (${closestDist.toFixed(1)}m)`);
          this.pushEvent(`Emergency: hostile ${closestMob.name} detected at ${closestDist.toFixed(1)}m`);
          this.say(`/say Alert: Interrupting task! Hostile ${closestMob.name} nearby (${closestDist.toFixed(1)}m)!`);
        }
      } else if (this.guard.isEmergency && this.guard.emergencyReasonText.startsWith("Hostile mob")) {
        if (!closestMob || closestDist > 14) {
          this.guard.clearEmergency();
          this.pushEvent("Emergency cleared: hostile mob no longer nearby");
          this.say("/say Threat cleared. Resuming standard planning.");
        }
      }
    });

    bot.on("entityHurt", (entity: { username?: string }) => {
      if (entity.username === this.config.username) {
        this.pushEvent("Took damage");
      }
    });

    bot.on("playerCollect", () => {
      this.pushEvent("Picked up item");
    });

    bot.on("chat", (username: string, message: string) => {
      if (username === this.config.username) return;
      this.pushEvent(`[Chat] ${username}: ${message}`);
      this.events.onChat?.(username, message);
    });

    bot.on("kicked", (reason: string) => {
      this.events.onKicked?.(reason);
      this.running = false;
    });

    bot.on("error", (err: Error) => {
      this.events.onError?.(err);
    });

    bot.on("end", () => {
      this.running = false;
    });
  }

  private pushEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 20) this.eventLog.shift();
  }

  observe(): Observation {
    if (!this.bot) throw new Error("Body not connected");
    return extractObservation(this.bot, this.eventLog);
  }

  async act(goal: Goal): Promise<GoalResult> {
    if (!this.bot) throw new Error("Body not connected");
    const goalId = `goal_${Date.now()}`;
    const start = Date.now();
    const startSteps = this.guard.stepCount;

    try {
      const result = await executeGoal(this.bot, goal, this.guard);
      const steps = this.guard.stepCount - startSteps;
      const elapsed = Date.now() - start;
      const goalResult: GoalResult = {
        goal_id: goalId,
        success: result.success,
        message: result.message,
        steps_taken: steps,
        elapsed_ms: elapsed,
      };
      if (result.message) this.pushEvent(`${goal.intent}: ${result.message}`);
      this.events.onObservation?.(this.observe());
      return goalResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.pushEvent(`${goal.intent} FAILED: ${message}`);
      return {
        goal_id: goalId,
        success: false,
        message,
        steps_taken: this.guard.stepCount - startSteps,
        elapsed_ms: Date.now() - start,
      };
    }
  }

  emergencyStop(reason: string): void {
    if (this.bot) {
      this.guard.triggerEmergency(this.bot, reason);
    }
  }

  say(message: string): void {
    this.bot?.chat(message);
  }

  get isRunning(): boolean {
    return this.running && this.bot !== null;
  }

  get safetyGuard(): SafetyGuard {
    return this.guard;
  }

  async disconnect(): Promise<void> {
    this.running = false;
    this.bot?.quit("Oneiro shutting down");
    this.bot = null;
  }
}
