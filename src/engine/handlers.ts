import { featureMap } from '@/features/registry';
import type { FeatureHandler, FeatureResult, HandlerContext, WorkflowPhase } from './types';
import { PHASE_FEATURES } from './phases';
import { getFeatureResult } from './realFeatures';

const PHASE_OF: Record<string, WorkflowPhase> = (() => {
  const m: Record<string, WorkflowPhase> = {};
  for (const [phase, ids] of Object.entries(PHASE_FEATURES)) {
    for (const id of ids) m[id] = phase as WorkflowPhase;
  }
  return m;
})();

export function getHandler(featureId: string): FeatureHandler | null {
  const phase = PHASE_OF[featureId];
  if (!phase) return null;
  const feature = featureMap[featureId];

  return async (_ctx: HandlerContext): Promise<FeatureResult> => {
    const start = Date.now();
    const shortName = feature?.shortName ?? featureId;

    if (!feature) {
      return { featureId, shortName, phase, status: 'warn', message: 'Feature not in registry', durationMs: Date.now() - start };
    }

    const real = getFeatureResult(featureId);
    if (!real) {
      return { featureId, shortName, phase, status: 'skipped', message: 'No backend result — run Import first', durationMs: Date.now() - start };
    }

    let status: FeatureResult['status'] = 'ok';
    if (real.status === 'runtime') status = 'warn';
    if (real.status === 'clean') status = 'ok';

    const data: Record<string, string | number> = {};
    data.hits = real.totalHits;
    data.dex = real.dexCount;
    data.patterns = real.patterns.length;
    if (real.hits.length > 0) {
      data.top_dex = real.hits[0].dex;
      const firstSignal = real.hits[0].signalClasses?.[0];
      if (firstSignal) data.top_class = firstSignal;
    }

    return {
      featureId, shortName, phase,
      status,
      message: real.message,
      durationMs: Date.now() - start,
      data,
    };
  };
}
