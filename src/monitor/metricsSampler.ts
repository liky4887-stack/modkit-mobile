// Samples backend health + DB state every intervalMs into metric_snapshots.
// Started once from the app root; idempotent.
import * as SQLite from 'expo-sqlite';
import { getDb } from '@/db/client';

const BACKEND = 'http://127.0.0.1:8790';
const DEFAULT_INTERVAL_MS = 10000;

let _timer: ReturnType<typeof setInterval> | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  return getDb();
}

interface BackendHealth {
  ok: boolean;
  bearerValid: boolean;
  cookiesLen: number;
}

async function fetchBackendHealth(): Promise<BackendHealth> {
  try {
    const res = await fetch(BACKEND + '/deepseek/health');
    const json: any = await res.json();
    const status = json?.status || {};
    return {
      ok: json?.ok === true,
      bearerValid: status.bearerValid === true,
      cookiesLen: typeof status.cookiesLength === 'number' ? status.cookiesLength : 0,
    };
  } catch {
    return { ok: false, bearerValid: false, cookiesLen: 0 };
  }
}

async function sample(jobId: string | null): Promise<void> {
  try {
    const d = await db();
    const now = Date.now();
  const oneMinAgo = now - 60000;

  const health = await fetchBackendHealth();

  const chats = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM pipeline_units WHERE state = 'running'`
  ).catch(() => ({ n: 0 })) ?? { n: 0 };

  const queued = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM pipeline_units WHERE state = 'queued'`
  ).catch(() => ({ n: 0 })) ?? { n: 0 };

  const done = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM pipeline_units WHERE state = 'done'`
  ).catch(() => ({ n: 0 })) ?? { n: 0 };

  const failed = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM pipeline_units WHERE state = 'failed'`
  ).catch(() => ({ n: 0 })) ?? { n: 0 };

  const dsCalls1m = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM http_log WHERE path = '/deepseek/chat' AND ts > ?`,
    [oneMinAgo]
  ).catch(() => ({ n: 0 })) ?? { n: 0 };

  const dsElapsed1m = await d.getFirstAsync<{ n: number }>(
    `SELECT COALESCE(SUM(duration_ms),0) AS n FROM http_log WHERE path = '/deepseek/chat' AND ts > ?`,
    [oneMinAgo]
  ).catch(() => ({ n: 0 })) ?? { n: 0 };

  const events1m = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM event_log WHERE ts > ?`,
    [oneMinAgo]
  ).catch(() => ({ n: 0 })) ?? { n: 0 };

  const errors1m = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM event_log WHERE severity = 'critical' AND ts > ?`,
    [oneMinAgo]
  ).catch(() => ({ n: 0 })) ?? { n: 0 };

  await d.runAsync(
    `INSERT INTO metric_snapshots
       (ts, job_id, backend_ok, bearer_valid, cookies_len,
        active_chats, queued_units, running_units, done_units, failed_units,
        ds_calls_1m, ds_elapsed_1m, events_1m, errors_1m)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      now, jobId,
      health.ok ? 1 : 0, health.bearerValid ? 1 : 0, health.cookiesLen,
      chats.n || 0,
      queued.n || 0,
      chats.n || 0,
      done.n || 0,
      failed.n || 0,
      dsCalls1m.n || 0,
      dsElapsed1m.n || 0,
      events1m.n || 0,
      errors1m.n || 0,
    ]
    );
  } catch {
    // never throw into the sampler
  }
}

export function startMetricsSampler(jobId: string | null = null, intervalMs = DEFAULT_INTERVAL_MS): void {
  if (_timer) return;
  void sample(jobId);
  _timer = setInterval(() => { void sample(jobId); }, intervalMs);
}

export function stopMetricsSampler(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
