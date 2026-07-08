export interface EmergencyStoppable {
  clearControlStates(): void;
  pathfinder?: { setGoal(goal: unknown): void };
}

export class SafetyGuard {
  stepCount = 0;
  maxSteps: number;
  watchdogTimeoutMs: number;
  private emergencyStop = false;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private emergencyReason = "";

  constructor(
    maxSteps = 50,
    watchdogTimeoutMs = 60000,
  ) {
    this.maxSteps = maxSteps;
    this.watchdogTimeoutMs = watchdogTimeoutMs;
  }

  shouldStop(health: number, food: number): boolean {
    return health < 6 || food < 2;
  }

  shouldContinue(): boolean {
    if (this.emergencyStop) return false;
    if (this.stepCount >= this.maxSteps) return false;
    return true;
  }

  incrementSteps(): void {
    this.stepCount++;
  }

  resetWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  triggerEmergency(body: EmergencyStoppable, reason: string): void {
    if (this.emergencyStop) return;
    this.emergencyStop = true;
    this.emergencyReason = reason;
    body.clearControlStates();
    body.pathfinder?.setGoal(null);
    console.error(`[SAFETY] Emergency stop: ${reason}`);
  }

  clearEmergency(): void {
    this.emergencyStop = false;
    this.emergencyReason = "";
  }

  get isEmergency(): boolean {
    return this.emergencyStop;
  }

  get emergencyReasonText(): string {
    return this.emergencyReason;
  }

  reset(): void {
    this.stepCount = 0;
    this.clearEmergency();
    this.resetWatchdog();
  }
}
