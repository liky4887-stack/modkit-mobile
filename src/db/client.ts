import * as SQLite from 'expo-sqlite';
import { DB_NAME, MIGRATIONS, SCHEMA_VERSION } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA synchronous = NORMAL;');
  await db.execAsync('PRAGMA busy_timeout = 5000;');
  await migrate(db);
  _db = db;
  return db;
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
