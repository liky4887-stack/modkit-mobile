import * as SQLite from 'expo-sqlite';
import { DB_NAME, MIGRATIONS, SCHEMA_VERSION } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;
let _opening: Promise<SQLite.SQLiteDatabase> | null = null;

async function tryOpen(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  try {
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync('PRAGMA synchronous = NORMAL;');
    await db.execAsync('PRAGMA busy_timeout = 5000;');
    await migrate(db);
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    console.log('[db] ready. user_version =', v?.user_version, 'target =', SCHEMA_VERSION);
    return db;
  } catch (err) {
    // CRITICAL: close the handle before rethrowing. If we don't, the
    // native file stays locked and deleteDatabaseAsync in the caller
    // cannot proceed. Every retry would leak another handle otherwise.
    try { await db.closeAsync(); } catch (closeErr) {
      console.warn('[db] close after fail also threw:', closeErr);
    }
    throw err;
  }
}

/**
 * Open with self-heal. tryOpen() self-closes on failure so the file is
 * released before we delete it. Then we wipe and retry once.
 */
// Only wipe on genuine corruption signals. Everything else is a code or
// migration bug — wiping silently destroys real data and hides the bug.
function looksLikeCorruption(err: unknown): boolean {
  const s = String((err as any)?.message ?? err ?? '').toLowerCase();
  return (
    s.includes('sqlite_corrupt') ||
    s.includes('database disk image is malformed') ||
    s.includes('file is not a database') ||
    s.includes('sqlite_notadb') ||
    s.includes('database corrupt')
  );
}

async function openWithSelfHeal(): Promise<SQLite.SQLiteDatabase> {
  try {
    return await tryOpen();
  } catch (firstErr) {
    if (!looksLikeCorruption(firstErr)) {
      // Migration bug, missing column, locked file, etc — surface it.
      // Do NOT wipe; real data lives here.
      console.error('[db] open failed (not corruption — NOT wiping):', firstErr);
      throw firstErr;
    }
    console.warn('[db] open failed (corruption detected), wiping:', firstErr);
    try {
      await SQLite.deleteDatabaseAsync(DB_NAME);
      console.log('[db] wiped', DB_NAME, '(and sidecars)');
    } catch (wipeErr) {
      console.warn('[db] wipe failed:', wipeErr);
      throw firstErr;
    }
    try {
      return await tryOpen();
    } catch (secondErr) {
      console.error('[db] retry after wipe also failed:', secondErr);
      throw secondErr;
    }
  }
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_opening) return _opening;

  _opening = openWithSelfHeal();

  try {
    const db = await _opening;
    _db = db;
    return db;
  } finally {
    _opening = null;
  }
}

/** Force a fresh DB — wipes the file and sidecars, then re-opens. */
export async function resetDb(): Promise<SQLite.SQLiteDatabase> {
  await closeDb();
  try { await SQLite.deleteDatabaseAsync(DB_NAME); } catch {}
  return getDb();
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;

  while (current < SCHEMA_VERSION) {
    const steps = MIGRATIONS[current];
    if (!steps) break;
    for (const sql of steps) {
      await db.execAsync(sql);
    }
    current += 1;
    await db.execAsync(`PRAGMA user_version = ${current};`);
  }
}

export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.closeAsync();
    _db = null;
  }
}
