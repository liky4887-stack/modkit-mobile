// Loader: runs dump-classes.mjs on the backend, reads the JSON from disk,
// and populates class_cache for a scan.
import { factoryExec } from '@/api/factory';
import { classCache } from './classCache';
import { eventBus } from '@/orchestration/eventBus';

const SF_HOME = '/data/data/com.termux/files/home/sovereign-factory';
const DUMP_SCRIPT = SF_HOME + '/scripts/dump-classes.mjs';
const CLASS_CACHE_DIR = '/data/data/com.termux/files/home/sovereign-core-data/modkit-classes';
const FILE_READ_URL = 'http://127.0.0.1:8790/file/read';

export interface LoadResult {
  scanId: string;
  apkPath: string;
  totalClasses: number;
  dexParsed: number;
  dexTotal: number;
  elapsedMs: number;
  cacheFile: string;
}

async function readJsonFile(path: string): Promise<any> {
  const res = await fetch(FILE_READ_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error('file/read HTTP ' + res.status);
  const json: any = await res.json();
  if (!json.ok) throw new Error(json.error || 'file/read failed');
  // Response shape: { ok: true, content: "..." }
  const content = json.content ?? json.result?.content;
  if (typeof content !== 'string') throw new Error('file/read returned no content');
  return JSON.parse(content);
}

export const classLoader = {
  async load(scanId: string, apkPath: string): Promise<LoadResult> {
    const t0 = Date.now();
    const cacheFile = CLASS_CACHE_DIR + '/' + scanId + '.json';

    eventBus.emit({
      scanId,
      correlationId: scanId,
      phase: 'investigate',
      functionId: 'orchestration_logs',
      severity: 'info',
      payload: { action: 'class_dump_start', apkPath, cacheFile },
    });

    // 1. Run dump-classes.mjs on backend, writing to the allowed path
    const dump = await factoryExec.run(
      'node',
      [DUMP_SCRIPT, apkPath, '--out', cacheFile],
      { timeoutMs: 300000 }
    );
    if (dump.result.exitCode !== 0) {
      throw new Error('dump-classes exit ' + dump.result.exitCode + ': ' + (dump.result.stderr || '').slice(0, 200));
    }
    let summary: any;
    try { summary = JSON.parse(dump.result.stdout); } catch {
      throw new Error('dump-classes non-JSON: ' + dump.result.stdout.slice(0, 200));
    }
    if (!summary.ok) throw new Error('dump-classes reported: ' + (summary.error || 'unknown'));

    // 2. Read the cache file from disk
    const cache = await readJsonFile(cacheFile);
    const classes = Array.isArray(cache.classes) ? cache.classes : [];

    // 3. Replace the class_cache table for this scan
    await classCache.replace(scanId, classes);

    const elapsedMs = Date.now() - t0;
    eventBus.emit({
      scanId,
      correlationId: scanId,
      phase: 'investigate',
      functionId: 'orchestration_logs',
      severity: 'info',
      payload: {
        action: 'class_dump_done',
        totalClasses: classes.length,
        dexParsed: summary.dexParsed,
        elapsedMs,
      },
    });

    return {
      scanId,
      apkPath,
      totalClasses: classes.length,
      dexParsed: summary.dexParsed ?? 0,
      dexTotal: summary.dexTotal ?? 0,
      elapsedMs,
      cacheFile,
    };
  },

  // Verify the cache is populated for a scan.
  async isLoaded(scanId: string): Promise<boolean> {
    const n = await classCache.count(scanId);
    return n > 0;
  },
};
