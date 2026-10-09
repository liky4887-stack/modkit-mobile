// Rolling signal store. Keeps the last N outcomes per endpoint so the
// predictor can reason about trends (increasing latencies, clustered
// failures, rate patterns) instead of just the most recent call.
import type { CallOutcome, EndpointId, FailureModeId } from './types';

const WINDOW_SIZE = 50;

class SignalStore {
  private readonly byEndpoint = new Map<EndpointId, CallOutcome[]>();
  private readonly byMode = new Map<FailureModeId, number[]>();

  record(o: CallOutcome): void {
    const arr = this.byEndpoint.get(o.endpoint) ?? [];
    arr.push(o);
    if (arr.length > WINDOW_SIZE) arr.splice(0, arr.length - WINDOW_SIZE);
    this.byEndpoint.set(o.endpoint, arr);

    if (o.failureMode) {
      const m = this.byMode.get(o.failureMode) ?? [];
      m.push(o.ts);
      // keep only last 10 minutes of mode hits
      const cutoff = Date.now() - 10 * 60_000;
      while (m.length && m[0] < cutoff) m.shift();
      this.byMode.set(o.failureMode, m);
    }
  }

  forEndpoint(id: EndpointId): CallOutcome[] {
    return this.byEndpoint.get(id) ?? [];
  }

  modeHitsInWindow(id: FailureModeId, windowMs: number): number {
    const arr = this.byMode.get(id) ?? [];
    const cutoff = Date.now() - windowMs;
    return arr.filter((t) => t >= cutoff).length;
  }

  recentFailures(windowMs: number): CallOutcome[] {
    const cutoff = Date.now() - windowMs;
    const out: CallOutcome[] = [];
    for (const arr of this.byEndpoint.values()) {
      for (const o of arr) if (!o.ok && o.ts >= cutoff) out.push(o);
    }
    return out;
  }

  recentCalls(windowMs: number): CallOutcome[] {
    const cutoff = Date.now() - windowMs;
    const out: CallOutcome[] = [];
    for (const arr of this.byEndpoint.values()) {
      for (const o of arr) if (o.ts >= cutoff) out.push(o);
    }
    return out;
  }

  allEndpoints(): EndpointId[] {
    return Array.from(this.byEndpoint.keys());
  }

  reset(): void {
    this.byEndpoint.clear();
    this.byMode.clear();
  }
}

export const signals = new SignalStore();
