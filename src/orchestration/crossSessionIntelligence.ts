import * as SQLite from 'expo-sqlite';

async function db() { return SQLite.openDatabaseAsync('modkit.db'); }

export interface ConstraintRecord {
  id: string;
  constraintType: string;
  description: string;
  encounteredBy: string;
  affectedSegments: string[];
  strategyAdjustment: string;
  createdAt: number;
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const crossSessionIntelligence = {
  async record(r: Omit<ConstraintRecord, 'id' | 'createdAt'>): Promise<string> {
    const id = uuid();
    const d = await db();
    await d.runAsync(
      `INSERT INTO cross_session_knowledge
         (id, constraint_type, description, encountered_by, affected_segments, strategy_adjustment, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [
        id, r.constraintType, r.description, r.encounteredBy,
        JSON.stringify(r.affectedSegments), r.strategyAdjustment, Date.now(),
      ]
    );
    return id;
  },

  async lookup(segmentId: string, constraintType?: string): Promise<ConstraintRecord[]> {
    const d = await db();
    const rows = await d.getAllAsync<any>(
      `SELECT * FROM cross_session_knowledge
        WHERE (? IS NULL OR constraint_type = ?)
          AND affected_segments LIKE ?`,
      [constraintType ?? null, constraintType ?? null, `%${segmentId}%`]
    );
    return rows.map(r => ({
      id: r.id,
      constraintType: r.constraint_type,
      description: r.description,
      encounteredBy: r.encountered_by,
      affectedSegments: JSON.parse(r.affected_segments || '[]'),
      strategyAdjustment: r.strategy_adjustment,
      createdAt: r.created_at,
    }));
  },

  async all(): Promise<ConstraintRecord[]> {
    const d = await db();
    const rows = await d.getAllAsync<any>(`SELECT * FROM cross_session_knowledge ORDER BY created_at DESC`);
    return rows.map(r => ({
      id: r.id,
      constraintType: r.constraint_type,
      description: r.description,
      encounteredBy: r.encountered_by,
      affectedSegments: JSON.parse(r.affected_segments || '[]'),
      strategyAdjustment: r.strategy_adjustment,
      createdAt: r.created_at,
    }));
  },
};
