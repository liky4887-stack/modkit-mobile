// Persist httpLog entries into SQLite. Keeps httpLog itself pure.
import * as SQLite from 'expo-sqlite';
import { getDb } from '@/db/client';

let _unsub: (() => void) | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  return getDb();
}

function extractPath(url: string): string | null {
  try {
    const u = new URL(url);
    return u.pathname || null;
  } catch {
    return null;
  }
}

async function insert(e: any): Promise<void> {
  try {
    const d = await db();
    await d.runAsync(
      `INSERT INTO http_log
         (ts, job_id, method, url, path, req_preview, res_status, res_preview, duration_ms, error)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        e.ts || Date.now(),
        (e as any).jobId || null,
        e.method || 'GET',
        e.url || '',
        extractPath(e.url || ''),
        e.reqPreview || '',
        e.resStatus === null || e.resStatus === undefined ? null : e.resStatus,
        e.resPreview || '',
        e.durationMs || 0,
        e.error || null,
      ]
    );
  } catch {
    // never throw into the log
  }
}

export function startPersistingHttp(log: { subscribe: (fn: (e: any) => void) => () => void }): void {
  if (_unsub) return;
  _unsub = log.subscribe((e) => { void insert(e); });
}

export function stopPersistingHttp(): void {
  if (_unsub) { _unsub(); _unsub = null; }
}
