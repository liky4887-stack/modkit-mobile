import { getDb } from './client';
import type { ChatRecord } from './schema';

export async function appendChat(
  scanId: string,
  featureId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<number> {
  const db = await getDb();
  const r = await db.runAsync(
    `INSERT INTO finding_chats (scanId, featureId, role, content, createdAt) VALUES (?,?,?,?,?)`,
    [scanId, featureId, role, content, Date.now()],
  );
  return r.lastInsertRowId ?? 0;
}

export async function getChat(
  scanId: string,
  featureId: string,
): Promise<ChatRecord[]> {
  const db = await getDb();
  return db.getAllAsync<ChatRecord>(
    `SELECT * FROM finding_chats WHERE scanId = ? AND featureId = ? ORDER BY createdAt ASC`,
    [scanId, featureId],
  );
}

export async function clearChat(scanId: string, featureId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM finding_chats WHERE scanId = ? AND featureId = ?`,
    [scanId, featureId],
  );
}

export async function countChatsForScan(scanId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM finding_chats WHERE scanId = ?`,
    [scanId],
  );
  return row?.c ?? 0;
}
