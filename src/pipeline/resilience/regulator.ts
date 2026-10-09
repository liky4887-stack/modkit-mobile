// Auto-regulator. Adapts inter-call pacing and retry budget from the
// rolling success rate. Success → speed up. Failures → slow down.
// This is the "auto-regulating" part of the loop.
class Regulator {
  private baseDelayMs = 300;
  private minDelayMs = 150;
  private maxDelayMs = 5_000;
  private currentDelayMs = this.baseDelayMs;
  private retryBudget = 3;
  private lastAdjust = 0;

  get delayMs(): number { return this.currentDelayMs; }
  get retries(): number { return this.retryBudget; }

  /** Called after every call. Uses the last 30s success rate to tune. */
  adjust(successRate30s: number, failureCount30s: number): void {
    const now = Date.now();
    if (now - this.lastAdjust < 2_000) return; // rate limit our own tuning
    this.lastAdjust = now;

    if (successRate30s >= 0.95 && failureCount30s === 0) {
      // Healthy: speed up gradually
      this.currentDelayMs = Math.max(this.minDelayMs, this.currentDelayMs * 0.85);
      this.retryBudget = Math.min(3, this.retryBudget + 1);
    } else if (successRate30s >= 0.8) {
      // Mostly fine: hold
    } else if (successRate30s >= 0.5) {
      // Degrading: slow down
      this.currentDelayMs = Math.min(this.maxDelayMs, this.currentDelayMs * 1.5);
      this.retryBudget = Math.max(1, this.retryBudget - 1);
    } else {
      // Broken: back off hard
      this.currentDelayMs = this.maxDelayMs;
      this.retryBudget = 1;
    }
  }

  /** Explicit backoff for a specific window (e.g. after a burst). */
  forceBackoff(ms: number): void {
    this.currentDelayMs = Math.min(this.maxDelayMs, Math.max(this.currentDelayMs, ms));
  }

  snapshot(): { delayMs: number; retryBudget: number } {
    return { delayMs: this.currentDelayMs, retryBudget: this.retryBudget };
  }

  reset(): void {
    this.currentDelayMs = this.baseDelayMs;
    this.retryBudget = 3;
  }
}

export const regulator = new Regulator();
