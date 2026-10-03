import { eventBus } from './eventBus';

const BACKEND = 'http://127.0.0.1:8790';

export interface DiffRequest {
  scanId: string;
  correlationId: string;
  originalPath: string;
  transformedPath: string;
}

export interface DiffEntry {
  path: string;
  changeType: 'add' | 'remove' | 'modify' | 'move';
  byteDelta: number;
  originatingSegment?: string;
  rationale?: string;
}

export interface StructuredDiff {
  summary: {
    totalChangedBytes: number;
    filesAdded: number;
    filesRemoved: number;
    filesModified: number;
  };
  entries: DiffEntry[];
  concentrationScore: number;
}

async function callBackendDiff(originalPath: string, transformedPath: string): Promise<any> {
  const res = await fetch(BACKEND + '/executeCommand', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cmd: 'node',
      args: ['scripts/diff-apks.mjs', originalPath, transformedPath],
      cwd: '/data/data/com.termux/files/home/sovereign-factory',
      timeoutMs: 120000,
    }),
  });
  if (!res.ok) throw new Error('diff backend HTTP ' + res.status);
  const raw = await res.json();
  return raw && raw.stdout ? JSON.parse(raw.stdout) : raw;
}

function computeConcentration(entries: DiffEntry[], totalBytes: number): number {
  if (totalBytes === 0 || entries.length === 0) return 0;
  const byPath = new Map<string, number>();
  for (const e of entries) {
    byPath.set(e.path, (byPath.get(e.path) || 0) + Math.abs(e.byteDelta));
  }
  const max = Math.max.apply(null, Array.from(byPath.values()));
  return Math.min(1, max / totalBytes);
}

export const binaryDiffViewer = {
  async compare(req: DiffRequest): Promise<StructuredDiff> {
    let backendResult: any;
    try {
      backendResult = await callBackendDiff(req.originalPath, req.transformedPath);
    } catch (err) {
      eventBus.emit({
        scanId: req.scanId, correlationId: req.correlationId,
        phase: 'validate', functionId: 'binary_diff_viewer',
        severity: 'warn',
        payload: { action: 'backend_unavailable', error: String(err) },
      });
      throw err;
    }

    const entries: DiffEntry[] = [];
    const filesAdded    = backendResult && backendResult.filesAdded    ? backendResult.filesAdded    : [];
    const filesRemoved  = backendResult && backendResult.filesRemoved  ? backendResult.filesRemoved  : [];
    const filesModified = backendResult && backendResult.filesModified ? backendResult.filesModified : [];

    for (const p of filesAdded)   entries.push({ path: typeof p === 'string' ? p : p.name, changeType: 'add',    byteDelta: p && p.size  ? p.size  : 0 });
    for (const p of filesRemoved) entries.push({ path: typeof p === 'string' ? p : p.name, changeType: 'remove', byteDelta: -(p && p.size ? p.size : 0) });
    for (const p of filesModified) entries.push({ path: typeof p === 'string' ? p : p.name, changeType: 'modify', byteDelta: p && p.delta ? p.delta : 0 });

    const totalChangedBytes = entries.reduce((s, e) => s + Math.abs(e.byteDelta), 0);

    const result: StructuredDiff = {
      summary: {
        totalChangedBytes,
        filesAdded: filesAdded.length,
        filesRemoved: filesRemoved.length,
        filesModified: filesModified.length,
      },
      entries,
      concentrationScore: computeConcentration(entries, totalChangedBytes),
    };

    eventBus.emit({
      scanId: req.scanId, correlationId: req.correlationId,
      phase: 'validate', functionId: 'binary_diff_viewer',
      severity: 'info',
      payload: {
        action: 'diff_complete',
        totalChangedBytes,
        entries: entries.length,
        concentration: result.concentrationScore,
      },
    });

    return result;
  },

  computeConcentration,
};
