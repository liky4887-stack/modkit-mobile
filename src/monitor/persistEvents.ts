// Persist eventBus emits into SQLite. Keeps eventBus itself pure.
import * as SQLite from 'expo-sqlite';
import { getDb } from '@/db/client';

let _unsub: (() => void) | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  return getDb();
}

async function insert(e: any): Promise<void> {
  try {
    const d = await db();
    const payload = e.payload ? JSON.stringify(e.payload) : null;
    const action = e.payload && typeof e.payload.action === 'string' ? e.payload.action : null;
    await d.runAsync(
      `INSERT INTO event_log
         (ts, job_id, phase, function_id, severity, action, payload_json, correlation)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        e.timestamp || Date.now(),
        e.scanId || null,
        e.phase || null,
        e.functionId || 'unknown',
        e.severity || 'info',
        action,
        payload,
        e.correlationId || null,
      ]
    );
  } catch {
    // never let persistence throw into the bus
  }
}

export function startPersistingEvents(bus: { subscribe: (fn: (e: any) => void) => () => void }): void {
  if (_unsub) return;
  _unsub = bus.subscribe((e) => { void insert(e); });
}

export function stopPersistingEvents(): void {
  if (_unsub) { _unsub(); _unsub = null; }
}
