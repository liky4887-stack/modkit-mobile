import { getHandler } from './handlers';
import { PHASE_FEATURES } from './phases';
import type { FeatureResult, HandlerContext, WorkflowPhase } from './types';

// Prevents duplicate concurrent execution of the same phase.
// Even if the UI double-taps Next, only one pass runs.
const RUNNING = new Set<WorkflowPhase>();

export async function runPhase(
  phase: WorkflowPhase,
  ctx: HandlerContext,
  onResult: (r: FeatureResult) => void,
): Promise<FeatureResult[]> {
  if (RUNNING.has(phase)) {
    try { ctx.log('warn', `[${phase}] already running — duplicate call ignored`); } catch {}
    return [];
  }

  RUNNING.add(phase);

  const results: FeatureResult[] = [];

  try {
    const ids = PHASE_FEATURES[phase];

    if (!Array.isArray(ids) || ids.length === 0) {
      try { ctx.log('error', `[${phase}] no features registered for this phase`); } catch {}
      return results;
    }

    for (const id of ids) {
      try {
        const handler = getHandler(id);

        if (!handler) {
          try { ctx.log('debug', `[${id}] no handler — skipped`); } catch {}
          continue;
        }

        const result = await handler(ctx);
        results.push(result);

        // Notify UI — never let a UI callback take down the pipeline
        try { onResult(result); } catch {}

        const level =
          result.status === 'error' ? 'error' :
          result.status === 'warn' ? 'warn' :
          result.status === 'skipped' ? 'debug' : 'success';

        try {
          ctx.log(level as 'info' | 'success' | 'warn' | 'error' | 'debug', `[${id}] ${result.message}`);
        } catch {}
      } catch (e) {
        // A handler itself threw — still emit an error result so the row is visible
        const msg = e instanceof Error ? e.message : 'Unknown error';
        const errResult: FeatureResult = {
          featureId: id,
          shortName: id,
          phase,
          status: 'error',
          message: `Handler crashed: ${msg}`,
          durationMs: 0,
        };
        results.push(errResult);
        try { onResult(errResult); } catch {}
        try { ctx.log('error', `[${id}] crashed: ${msg}`); } catch {}
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown phase error';
    try { ctx.log('error', `[${phase}] phase failed: ${msg}`); } catch {}
  } finally {
    RUNNING.delete(phase);
  }

  return results;
}
