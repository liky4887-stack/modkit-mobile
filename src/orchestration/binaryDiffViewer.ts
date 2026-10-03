import { eventBus } from './eventBus';

const BACKEND = 'http://127.0.0.1:8790';
const SF_CWD = '/data/data/com.termux/files/home/sovereign-factory';

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
    classesAdded: number;
    classesRemoved: number;
    dexDelta: number;
  };
  entries: DiffEntry[];
  concentrationScore: number;
}

async function callBackendDiff(originalPath: string, transformedPath: string): Promise<any> {
  const res = await fetch(BACKEND + '/executeCommand', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command: 'node',
      args: ['scripts/diff-apks.mjs', originalPath, transformedPath],
      cwd: SF_CWD,
      timeoutMs: 120000,
    }),
  });
  if (!res.ok) throw new Error('diff backend HTTP ' + res.status);
  const raw = await res.json();
  if (!raw || raw.ok !== true || !raw.result) {
    throw new Error('diff backend error: ' + JSON.stringify(raw).slice(0, 200));
  }
  if (raw.result.exitCode !== 0) {
    throw new Error('diff-apks exit ' + raw.result.exitCode + ': ' + (raw.result.stderr || '').slice(0, 200));
  }
  const parsed = JSON.parse(raw.result.stdout);
  if (parsed && parsed.ok === false) {
    throw new Error('diff-apks reported: ' + parsed.error);
  }
  return parsed;
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

    const summary = backendResult.summary || {};
    const filesBucket = backendResult.files || {};
    const classesBucket = backendResult.classes || {};

    const filesAdded: string[]   = Array.isArray(filesBucket.added)   ? filesBucket.added   : [];
    const filesRemoved: string[] = Array.isArray(filesBucket.removed) ? filesBucket.removed : [];

    const entries: DiffEntry[] = [];
    for (const p of filesAdded)   entries.push({ path: String(p), changeType: 'add',    byteDelta: 0 });
    for (const p of filesRemoved) entries.push({ path: String(p), changeType: 'remove', byteDelta: 0 });

    const sizeDelta = typeof summary.sizeDeltaBytes === 'number' ? summary.sizeDeltaBytes : 0;
    const totalChangedBytes = Math.max(Math.abs(sizeDelta), entries.length);

    const result: StructuredDiff = {
      summary: {
        totalChangedBytes,
        filesAdded:     summary.filesAdded   || filesAdded.length,
        filesRemoved:   summary.filesRemoved || filesRemoved.length,
        filesModified:  0,
        classesAdded:   summary.classesAdded   || classesBucket.addedTotal   || 0,
        classesRemoved: summary.classesRemoved || classesBucket.removedTotal || 0,
        dexDelta:       summary.dexDelta || 0,
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
        totalChangedBytes: result.summary.totalChangedBytes,
        filesAdded: result.summary.filesAdded,
        filesRemoved: result.summary.filesRemoved,
        concentration: result.concentrationScore,
      },
    });

    return result;
  },

  computeConcentration,
};
