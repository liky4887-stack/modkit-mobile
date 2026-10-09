// Public API of the resilience layer. pipelineRunner.ts imports
// guardFetch (a drop-in fetch replacement) and guard.run (a wrapper
// for one logical pipeline step). Both run the predict → heal →
// regulate → review loop automatically.
import { signals } from './signals';
import { predict, noteSessionTurn, clearSession } from './predictor';
import { heal, getRecentHeals, activeCooldowns, type HealContext } from './healer';
import { regulator } from './regulator';
import { classifyFromResponse } from './failureModes';
import type {
  CallOutcome,
  EndpointId,
  GuardStatus,
  HealResult,
  Prediction,
} from './types';

// ─── Backend URL → endpoint classification ─────────────────────────
function classifyEndpoint(url: string): EndpointId {
  if (url.includes('/deepseek/chat')) return 'deepseek/chat';
  if (url.includes('/orchestration/sync')) return 'orchestration/sync';
  if (url.includes('/executeCommand')) return 'executeCommand';
  if (url.includes('/tools/load')) return 'tools/load';
  if (url.includes('/tools/find_classes_by_name')) return 'tools/find_classes_by_name';
  if (url.includes('/tools/extract_iocs')) return 'tools/extract_iocs';
  if (url.includes('/file/read')) return 'file/read';
  if (url.includes('/file/write')) return 'file/write';
  if (url.includes('/health')) return 'health';
  return 'unknown';
}

// ─── Global pause state ────────────────────────────────────────────
interface PauseState {
  paused: boolean;
  reason: string | null;
  since: number | null;
}
const pause: PauseState = { paused: false, reason: null, since: null };

export function isPaused(): boolean { return pause.paused; }
export function pauseReason(): string | null { return pause.reason; }
export function resumePipeline(): void {
  pause.paused = false;
  pause.reason = null;
  pause.since = null;
}

// ─── Guard ─────────────────────────────────────────────────────────
class Guard {
  private ctx: HealContext = {};

  configure(ctx: HealContext): void {
    this.ctx = { ...this.ctx, ...ctx };
  }

  /** Current session id, if any, so heals can rotate it. */
  private sessionId: string | undefined;
  setSessionId(id: string | undefined): void { this.sessionId = id; }
  getSessionId(): string | undefined { return this.sessionId; }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input.toString();
    const endpoint = classifyEndpoint(url);

    // ─── Pre-call: predict + heal ─────────────────────────────────
    const p = predict(endpoint, this.sessionId);
    if (p.risk >= 0.7 && p.mitigation) {
      const mode = p.mode ?? 'unknown_5xx';
      const healResult = await heal(mode, this.ctx);
      if (healResult.applied && healResult.mitigation === 'rotate_session') {
        // Healer's rotate hook returns a new session id; pick it up.
        this.sessionId = this.ctx.sessionId;
      }
    }

    // ─── Pre-call: honour pacing ─────────────────────────────────
    if (regulator.delayMs > 0) {
      await new Promise((r) => setTimeout(r, regulator.delayMs));
    }

    // ─── Execute with retry budget ───────────────────────────────
    const maxAttempts = regulator.retries;
    let lastErr: unknown = null;
    let response: Response | null = null;
    let bodyText = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const t0 = Date.now();
      try {
        response = await fetch(input, init);
        bodyText = await response.clone().text();
        const elapsed = Date.now() - t0;

        const failureMode = !response.ok || bodyText.trim().length === 0
          ? classifyFromResponse(response.status, bodyText, null)
          : null;

        const outcome: CallOutcome = {
          endpoint,
          ok: response.ok && bodyText.trim().length > 0,
          status: response.status,
          elapsedMs: elapsed,
          ts: Date.now(),
          failureMode,
          error: null,
        };
        signals.record(outcome);

        // ─── Post-call: adjust regulator ─────────────────────────
        this.adjustRegulator();

        if (outcome.ok) {
          if (this.sessionId) noteSessionTurn(this.sessionId);
          return response;
        }

        // ─── Post-call failure: heal ─────────────────────────────
        if (failureMode) {
          const healResult = await heal(failureMode, this.ctx);
          if (healResult.applied && healResult.mitigation === 'rotate_session') {
            this.sessionId = this.ctx.sessionId;
          }
          if (healResult.mitigation === 'pause_pipeline') {
            pause.paused = true;
            pause.reason = healResult.detail;
            pause.since = Date.now();
            return response; // don't retry; surface to caller
          }
        }

        if (attempt < maxAttempts && shouldRetry(response.status)) {
          await new Promise((r) => setTimeout(r, regulator.delayMs));
          continue;
        }
        return response;
      } catch (err) {
        lastErr = err;
        const elapsed = Date.now() - t0;
        const failureMode = classifyFromResponse(0, '', err);

        signals.record({
          endpoint,
          ok: false,
          status: null,
          elapsedMs: elapsed,
          ts: Date.now(),
          failureMode,
          error: (err as Error).message,
        });

        this.adjustRegulator();

        if (failureMode) {
          const healResult = await heal(failureMode, this.ctx);
          if (healResult.mitigation === 'pause_pipeline') {
            pause.paused = true;
            pause.reason = healResult.detail;
            pause.since = Date.now();
            throw err;
          }
        }

        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, regulator.delayMs));
          continue;
        }
      }
    }

    if (lastErr) throw lastErr;
    if (response) return response;
    throw new Error('guard.fetch: exhausted attempts with no response');
  }

  private adjustRegulator(): void {
    const windowMs = 30_000;
    const calls = signals.recentCalls(windowMs);
    const failures = calls.filter((o) => !o.ok).length;
    const rate = calls.length === 0 ? 1 : 1 - failures / calls.length;
    regulator.adjust(rate, failures);
  }

  status(): GuardStatus {
    const endpoints = signals.allEndpoints();
    const stats = endpoints.map((e) => {
      const arr = signals.forEndpoint(e);
      const fails = arr.filter((o) => !o.ok).length;
      const sorted = arr.map((o) => o.elapsedMs).sort((a, b) => a - b);
      return {
        endpoint: e,
        calls: arr.length,
        failures: fails,
        successRate: arr.length === 0 ? 1 : 1 - fails / arr.length,
        p50Ms: sorted[Math.floor(sorted.length / 2)] ?? 0,
        p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      };
    });

    const recent = signals.recentCalls(60_000);
    const recentFails = recent.filter((o) => !o.ok).length;
    const topMode = recent.find((o) => o.failureMode)?.failureMode ?? null;

    const r = regulator.snapshot();

    return {
      endpointStats: stats,
      currentDelayMs: r.delayMs,
      retryBudget: r.retryBudget,
      activeMitigations: activeCooldowns(),
      recentHeals: getRecentHeals(),
      risk: {
        score: recent.length === 0 ? 0 : recentFails / recent.length,
        topMode,
      },
      paused: pause.paused,
      pausedReason: pause.reason,
    };
  }

  reset(): void {
    signals.reset();
    regulator.reset();
    this.sessionId = undefined;
    resumePipeline();
  }
}

function shouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600) || status === 0;
}

export const guard = new Guard();

/** Drop-in fetch replacement that runs the full resilience loop. */
export function guardFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return guard.fetch(input, init);
}

export type { HealResult };
