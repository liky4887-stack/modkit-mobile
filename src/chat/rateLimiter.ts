// Concurrency-capped rate limiter with exponential backoff + jitter.
// No DB. Pure. Callers persist their own state.

export interface RateLimiterConfig {
  maxConcurrent: number;
  maxPerMinute: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimiterConfig = {
  maxConcurrent: 3,
  maxPerMinute: 60,
  baseBackoffMs: 2000,
  maxBackoffMs: 60000,
};

interface Slot {
  id: string;
  startedAt: number;
}

export class RateLimiter {
  private cfg: RateLimiterConfig;
  private active: Map<string, Slot> = new Map();
  private minuteWindow: number[] = [];
  private backoffUntil = 0;
  private consecutiveFailures = 0;

  constructor(cfg: Partial<RateLimiterConfig> = {}) {
    this.cfg = { ...DEFAULT_RATE_LIMIT, ...cfg };
  }

  private pruneMinute(): void {
    const cutoff = Date.now() - 60000;
    while (this.minuteWindow.length > 0 && this.minuteWindow[0] < cutoff) {
      this.minuteWindow.shift();
    }
  }

  canAcquire(): { ok: true } | { ok: false; waitMs: number; reason: string } {
    const now = Date.now();
    if (now < this.backoffUntil) {
      return { ok: false, waitMs: this.backoffUntil - now, reason: 'backoff' };
    }
    if (this.active.size >= this.cfg.maxConcurrent) {
      // wait for oldest slot to free — caller polls
      const oldest = Math.min(...Array.from(this.active.values()).map(s => s.startedAt));
      return { ok: false, waitMs: Math.max(200, 500 - (now - oldest)), reason: 'concurrency' };
    }
    this.pruneMinute();
    if (this.minuteWindow.length >= this.cfg.maxPerMinute) {
      return { ok: false, waitMs: 60000 - (now - this.minuteWindow[0]), reason: 'rate' };
    }
    return { ok: true };
  }

  acquire(id: string): void {
    const now = Date.now();
    this.active.set(id, { id, startedAt: now });
    this.minuteWindow.push(now);
  }

  release(id: string, error?: { status?: number } | null): void {
    this.active.delete(id);
    if (error && error.status === 429) {
      this.consecutiveFailures += 1;
      const delay = Math.min(
        this.cfg.maxBackoffMs,
        this.cfg.baseBackoffMs * Math.pow(2, this.consecutiveFailures - 1)
      );
      const jitter = Math.floor(Math.random() * Math.min(1000, delay * 0.2));
      this.backoffUntil = Date.now() + delay + jitter;
    } else if (!error) {
      this.consecutiveFailures = 0;
      this.backoffUntil = 0;
    }
  }

  async acquireWithWait(id: string, maxWaitMs = 120000): Promise<void> {
    const start = Date.now();
    while (true) {
      const r = this.canAcquire();
      if (r.ok) {
        this.acquire(id);
        return;
      }
      if (Date.now() - start > maxWaitMs) {
        throw new Error('rate limiter: max wait exceeded (' + r.reason + ')');
      }
      await new Promise(res => setTimeout(res, Math.min(r.waitMs, 1000)));
    }
  }

  stats() {
    this.pruneMinute();
    return {
      active: this.active.size,
      maxConcurrent: this.cfg.maxConcurrent,
      lastMinuteCount: this.minuteWindow.length,
      maxPerMinute: this.cfg.maxPerMinute,
      backoffUntil: this.backoffUntil,
      backoffRemainingMs: Math.max(0, this.backoffUntil - Date.now()),
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  reconfigure(partial: Partial<RateLimiterConfig>): void {
    this.cfg = { ...this.cfg, ...partial };
  }
}

// Single global instance — the whole app shares one concurrency budget.
export const globalRateLimiter = new RateLimiter();
