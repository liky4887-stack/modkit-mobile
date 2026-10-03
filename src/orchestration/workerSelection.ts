// Pure worker-selection logic. No SQLite, no react-native, no expo.
// Consumed by centralOrchestrator.ts.

export interface SegmentDefinition {
  id: string;
  type: 'dex_class' | 'native_lib' | 'asset' | 'config';
  estimatedTokens: number;
  priority: number;
  dependencies: string[];
}

export interface WorkerDefinition {
  id: string;
  model: string;
  maxContextTokens: number;
  currentLoad: number;
  healthy: boolean;
}

export function selectWorker(
  workers: WorkerDefinition[],
  seg: SegmentDefinition,
  budgetLeft: number
): WorkerDefinition | null {
  const candidates = workers
    .filter(w => w.healthy && (w.maxContextTokens - w.currentLoad) >= seg.estimatedTokens)
    .filter(() => budgetLeft >= seg.estimatedTokens);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aFree = a.maxContextTokens - a.currentLoad;
    const bFree = b.maxContextTokens - b.currentLoad;
    return bFree - aFree;
  });
  return candidates[0];
}

export function computeBudget(
  seg: SegmentDefinition,
  worker: WorkerDefinition,
  remaining: number,
  constraintsCount: number
): number {
  const bump = constraintsCount > 0 ? 1.15 : 1.0;
  return Math.min(
    Math.round(seg.estimatedTokens * 1.2 * bump),
    worker.maxContextTokens - worker.currentLoad,
    remaining
  );
}
