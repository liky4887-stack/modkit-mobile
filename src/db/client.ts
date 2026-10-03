import * as SQLite from 'expo-sqlite';
import { DB_NAME, MIGRATIONS, SCHEMA_VERSION } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;
let _opening: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_opening) return _opening;

  _opening = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync('PRAGMA synchronous = NORMAL;');
    await db.execAsync('PRAGMA busy_timeout = 5000;');
    await migrate(db);
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    console.log('[db] ready. user_version =', v?.user_version, 'target =', SCHEMA_VERSION);
    _db = db;
    _opening = null;
    return db;
  })();

  try {
    return await _opening;
  } catch (e) {
    _opening = null;
    throw e;
  }
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
