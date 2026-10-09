// Predictive layer. Reads the rolling signals and predicts which
// failure is about to happen, so the healer can act *before* the
// call fails instead of after.
import { signals } from './signals';
import type { EndpointId, FailureModeId, Prediction } from './types';

// Per-session turn counter — the DeepSeek router rotates at 5 turns,
// but the guard tracks it independently so it can force-rotate a turn
// early if a session is being used across multiple endpoints.
const sessionTurns = new Map<string, number>();
const MAX_TURNS_SAFE = 4;

export function noteSessionTurn(sessionId: string): void {
  sessionTurns.set(sessionId, (sessionTurns.get(sessionId) ?? 0) + 1);
}

export function sessionTurnCount(sessionId: string): number {
  return sessionTurns.get(sessionId) ?? 0;
}

export function clearSession(sessionId: string): void {
  sessionTurns.delete(sessionId);
}

export function predict(endpoint: EndpointId, sessionId?: string): Prediction {
  // ─── 1. Session ceiling ────────────────────────────────────────
  if (sessionId && sessionTurnCount(sessionId) >= MAX_TURNS_SAFE) {
    return {
      risk: 0.9,
      mode: 'session_ceiling',
      reason: `session ${sessionId.slice(0, 8)} at ${sessionTurnCount(sessionId)} turns (safe cap ${MAX_TURNS_SAFE})`,
      mitigation: 'rotate_session',
    };
  }

  // ─── 2. Burst rate ─────────────────────────────────────────────
  const callsLast10s = signals.recentCalls(10_000).length;
  if (callsLast10s >= 8) {
    return {
      risk: 0.85,
      mode: 'burst_rate_limit',
      reason: `${callsLast10s} calls in last 10s — entering rate-limit headroom`,
      mitigation: 'backoff',
    };
  }

  // ─── 3. Recent empty-200 cluster ───────────────────────────────
  const empty200 = signals.modeHitsInWindow('empty_200', 120_000);
  if (empty200 >= 2) {
    return {
      risk: 0.8,
      mode: 'empty_200',
      reason: `${empty200} empty-200s in last 2m — upstream likely throttling`,
      mitigation: 'fallback_engine',
    };
  }

  // ─── 4. Endpoint-specific failure trend ────────────────────────
  const hist = signals.forEndpoint(endpoint).slice(-8);
  if (hist.length >= 5) {
    const fails = hist.filter((o) => !o.ok).length;
    if (fails >= 3) {
      const lastMode = hist[hist.length - 1]?.failureMode ?? 'unknown_5xx';
      return {
        risk: 0.7,
        mode: lastMode as FailureModeId,
        reason: `${fails}/${hist.length} recent failures on ${endpoint}`,
        mitigation: null,
      };
    }
  }

  // ─── 5. Latency creep (predicts timeouts before they happen) ───
  const latencies = signals
    .forEndpoint(endpoint)
    .slice(-10)
    .map((o) => o.elapsedMs)
    .sort((a, b) => a - b);
  if (latencies.length >= 8) {
    const p50 = latencies[Math.floor(latencies.length / 2)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    if (p95 > p50 * 4 && p95 > 8_000) {
      return {
        risk: 0.5,
        mode: 'unknown_5xx',
        reason: `p95 latency ${p95}ms is 4x p50 ${p50}ms — upstream degrading`,
        mitigation: 'backoff',
      };
    }
  }

  return { risk: 0, mode: null, reason: 'nominal', mitigation: null };
}
