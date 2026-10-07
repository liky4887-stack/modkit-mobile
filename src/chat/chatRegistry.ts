// CRUD for pipeline_chats + pipeline_chat_turns.
import * as SQLite from 'expo-sqlite';
import { getDb } from '@/db/client';

export type ChatState = 'open' | 'closed' | 'failed' | 'aborted';
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatRecord {
  id: string;
  jobId: string | null;
  unitId: string | null;
  phase: string;
  purpose: string | null;
  dsSessionId: string | null;
  state: ChatState;
  turns: number;
  tokensIn: number;
  tokensOut: number;
  elapsedMs: number;
  lastTurnAt: number | null;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  model: string | null;
  promptVersion: string | null;
}

export interface TurnRecord {
  id: number;
  chatId: string;
  jobId: string | null;
  ts: number;
  turnIndex: number;
  role: ChatRole;
  content: string;
  tokens: number;
  dsSessionId: string | null;
  elapsedMs: number;
  error: string | null;
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function rowToChat(r: any): ChatRecord {
  return {
    id: r.id,
    jobId: r.job_id,
    unitId: r.unit_id,
    phase: r.phase,
    purpose: r.purpose,
    dsSessionId: r.ds_session_id,
    state: r.state as ChatState,
    turns: r.turns ?? 0,
    tokensIn: r.tokens_in ?? 0,
    tokensOut: r.tokens_out ?? 0,
    elapsedMs: r.elapsed_ms ?? 0,
    lastTurnAt: r.last_turn_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    error: r.error,
    model: r.model,
    promptVersion: r.prompt_version,
  };
}

function rowToTurn(r: any): TurnRecord {
  return {
    id: r.id,
    chatId: r.chat_id,
    jobId: r.job_id,
    ts: r.ts,
    turnIndex: r.turn_index,
    role: r.role as ChatRole,
    content: r.content,
    tokens: r.tokens ?? 0,
    dsSessionId: r.ds_session_id,
    elapsedMs: r.elapsed_ms ?? 0,
    error: r.error,
  };
}

export const chatRegistry = {
  async create(input: {
    jobId?: string | null;
    unitId?: string | null;
    phase: string;
    purpose?: string | null;
    model?: string | null;
    promptVersion?: string | null;
  }): Promise<ChatRecord> {
    const db = await getDb();
    const id = uuid();
    const now = Date.now();
    await db.runAsync(
      `INSERT INTO pipeline_chats
         (id, job_id, unit_id, phase, purpose, state,
          started_at, model, prompt_version)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id, input.jobId ?? null, input.unitId ?? null,
        input.phase, input.purpose ?? null, 'open',
        now, input.model ?? 'deepseek-chat', input.promptVersion ?? null,
      ]
    );
    return {
      id,
      jobId: input.jobId ?? null,
      unitId: input.unitId ?? null,
      phase: input.phase,
      purpose: input.purpose ?? null,
      dsSessionId: null,
      state: 'open',
      turns: 0,
      tokensIn: 0,
      tokensOut: 0,
      elapsedMs: 0,
      lastTurnAt: null,
      startedAt: now,
      finishedAt: null,
      error: null,
      model: input.model ?? 'deepseek-chat',
      promptVersion: input.promptVersion ?? null,
    };
  },

  async get(id: string): Promise<ChatRecord | null> {
    const db = await getDb();
    const r = await db.getFirstAsync<any>(
      `SELECT * FROM pipeline_chats WHERE id = ?`, [id]
    );
    return r ? rowToChat(r) : null;
  },

  async findOpenForUnit(unitId: string): Promise<ChatRecord | null> {
    const db = await getDb();
    const r = await db.getFirstAsync<any>(
      `SELECT * FROM pipeline_chats
        WHERE unit_id = ? AND state = 'open'
        ORDER BY started_at DESC LIMIT 1`,
      [unitId]
    );
    return r ? rowToChat(r) : null;
  },

  async listActive(limit = 50): Promise<ChatRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM pipeline_chats
        WHERE state = 'open'
        ORDER BY started_at DESC LIMIT ?`,
      [limit]
    );
    return rows.map(rowToChat);
  },

  async listByJob(jobId: string, limit = 200): Promise<ChatRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM pipeline_chats
        WHERE job_id = ?
        ORDER BY started_at DESC LIMIT ?`,
      [jobId, limit]
    );
    return rows.map(rowToChat);
  },

  async listRecent(limit = 100): Promise<ChatRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM pipeline_chats
        ORDER BY started_at DESC LIMIT ?`,
      [limit]
    );
    return rows.map(rowToChat);
  },

  async appendTurn(input: {
    chatId: string;
    jobId?: string | null;
    role: ChatRole;
    content: string;
    tokens?: number;
    dsSessionId?: string | null;
    elapsedMs?: number;
    error?: string | null;
  }): Promise<number> {
    const db = await getDb();

    const chatRow = await db.getFirstAsync<{ turns: number }>(
      `SELECT turns FROM pipeline_chats WHERE id = ?`, [input.chatId]
    );
    const nextIdx = (chatRow?.turns ?? 0);

    const res = await db.runAsync(
      `INSERT INTO pipeline_chat_turns
         (chat_id, job_id, ts, turn_index, role, content, tokens, ds_session_id, elapsed_ms, error)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        input.chatId, input.jobId ?? null, Date.now(), nextIdx,
        input.role, input.content,
        input.tokens ?? 0, input.dsSessionId ?? null,
        input.elapsedMs ?? 0, input.error ?? null,
      ]
    );

    const tokenIn = input.role === 'user' ? (input.tokens ?? 0) : 0;
    const tokenOut = input.role === 'assistant' ? (input.tokens ?? 0) : 0;

    await db.runAsync(
      `UPDATE pipeline_chats
         SET turns = turns + 1,
             tokens_in = tokens_in + ?,
             tokens_out = tokens_out + ?,
             elapsed_ms = elapsed_ms + ?,
             last_turn_at = ?,
             ds_session_id = COALESCE(?, ds_session_id)
       WHERE id = ?`,
      [
        tokenIn, tokenOut, input.elapsedMs ?? 0, Date.now(),
        input.dsSessionId ?? null, input.chatId,
      ]
    );

    return res.lastInsertRowId;
  },

  async setSessionId(chatId: string, dsSessionId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE pipeline_chats SET ds_session_id = ? WHERE id = ?`,
      [dsSessionId, chatId]
    );
  },

  async close(chatId: string, error: string | null = null): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE pipeline_chats
         SET state = ?, finished_at = ?, error = ?
       WHERE id = ?`,
      [error ? 'failed' : 'closed', Date.now(), error, chatId]
    );
  },

  async abort(chatId: string, reason: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE pipeline_chats
         SET state = 'aborted', finished_at = ?, error = ?
       WHERE id = ?`,
      [Date.now(), reason, chatId]
    );
  },

  async listTurns(chatId: string, limit = 500): Promise<TurnRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM pipeline_chat_turns
        WHERE chat_id = ?
        ORDER BY turn_index ASC LIMIT ?`,
      [chatId, limit]
    );
    return rows.map(rowToTurn);
  },

  async findStuck(olderThanMs: number): Promise<ChatRecord[]> {
    const db = await getDb();
    const cutoff = Date.now() - olderThanMs;
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM pipeline_chats
        WHERE state = 'open'
          AND (last_turn_at IS NULL OR last_turn_at < ?)
        ORDER BY started_at ASC`,
      [cutoff]
    );
    return rows.map(rowToChat);
  },

  async stats(periodMs: number): Promise<{
    total: number; open: number; closed: number; failed: number; aborted: number;
    turnsTotal: number; tokensIn: number; tokensOut: number; elapsedMs: number;
  }> {
    const db = await getDb();
    const cutoff = Date.now() - periodMs;
    const r = await db.getFirstAsync<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN state = 'open' THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN state = 'closed' THEN 1 ELSE 0 END) AS closed,
         SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN state = 'aborted' THEN 1 ELSE 0 END) AS aborted,
         COALESCE(SUM(turns),0) AS turns_total,
         COALESCE(SUM(tokens_in),0) AS tokens_in,
         COALESCE(SUM(tokens_out),0) AS tokens_out,
         COALESCE(SUM(elapsed_ms),0) AS elapsed_ms
       FROM pipeline_chats
       WHERE started_at > ?`,
      [cutoff]
    );
    return {
      total: r?.total ?? 0,
      open: r?.open ?? 0,
      closed: r?.closed ?? 0,
      failed: r?.failed ?? 0,
      aborted: r?.aborted ?? 0,
      turnsTotal: r?.turns_total ?? 0,
      tokensIn: r?.tokens_in ?? 0,
      tokensOut: r?.tokens_out ?? 0,
      elapsedMs: r?.elapsed_ms ?? 0,
    };
  },
  // Group chats by job id, for the pipeline-aware CHATS tab.
  // Only returns chats that belong to a real job.
  async listGroupedByJob(withinHours = 48): Promise<Record<string, ChatRecord[]>> {
    const db = await getDb();
    const cutoff = Date.now() - withinHours * 3600 * 1000;
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM pipeline_chats
        WHERE job_id IS NOT NULL
          AND started_at > ?
        ORDER BY job_id DESC, started_at ASC`,
      [cutoff]
    );
    const byJob: Record<string, ChatRecord[]> = {};
    for (const r of rows) {
      const c = rowToChat(r);
      const key = c.jobId || '_orphan';
      if (!byJob[key]) byJob[key] = [];
      byJob[key].push(c);
    }
    return byJob;
  },

  // Counts of chat states within a job
  async jobChatStats(jobId: string): Promise<{
    total: number; open: number; done: number; failed: number;
    turns: number; tokensIn: number; tokensOut: number;
  }> {
    const db = await getDb();
    const r = await db.getFirstAsync<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN state = 'open' THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN state = 'closed' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN state = 'failed' OR state = 'aborted' THEN 1 ELSE 0 END) AS failed,
         COALESCE(SUM(turns),0) AS turns,
         COALESCE(SUM(tokens_in),0) AS tokens_in,
         COALESCE(SUM(tokens_out),0) AS tokens_out
       FROM pipeline_chats WHERE job_id = ?`,
      [jobId]
    );
    return {
      total: r?.total ?? 0,
      open: r?.open ?? 0,
      done: r?.done ?? 0,
      failed: r?.failed ?? 0,
      turns: r?.turns ?? 0,
      tokensIn: r?.tokens_in ?? 0,
      tokensOut: r?.tokens_out ?? 0,
    };
  },

};
