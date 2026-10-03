// CRUD for class_cache. Populated from dump-classes.mjs output.
import * as SQLite from 'expo-sqlite';
import { getDb } from '@/db/client';

export interface ClassRecord {
  scanId: string;
  fqcn: string;
  package: string;
  simpleName: string;
  dexFile: string;
  dexSize: number;
  firstSeenAt: number;
}

interface DumpClass {
  fqcn: string;
  dex: string;
  package: string;
  simpleName: string;
  size: number;
}

export const classCache = {
  async replace(scanId: string, classes: DumpClass[]): Promise<number> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM class_cache WHERE scan_id = ?`, [scanId]);
    await db.execAsync('BEGIN');
    try {
      const now = Date.now();
      const stmt = await db.prepareAsync(
        `INSERT INTO class_cache
           (scan_id, fqcn, package, simple_name, dex_file, dex_size, first_seen_at)
         VALUES (?,?,?,?,?,?,?)`
      );
      for (const c of classes) {
        await stmt.executeAsync([
          scanId, c.fqcn, c.package, c.simpleName, c.dex, c.size, now,
        ]);
      }
      await stmt.finalizeAsync();
      await db.execAsync('COMMIT');
      return classes.length;
    } catch (e) {
      await db.execAsync('ROLLBACK');
      throw e;
    }
  },

  async count(scanId: string): Promise<number> {
    const db = await getDb();
    const r = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM class_cache WHERE scan_id = ?`,
      [scanId]
    );
    return r?.n ?? 0;
  },

  async exists(scanId: string, fqcn: string): Promise<boolean> {
    const db = await getDb();
    const r = await db.getFirstAsync<{ n: number }>(
      `SELECT 1 AS n FROM class_cache WHERE scan_id = ? AND fqcn = ? LIMIT 1`,
      [scanId, fqcn]
    );
    return !!r;
  },

  async find(scanId: string, prefix: string, limit = 200): Promise<ClassRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT scan_id, fqcn, package, simple_name, dex_file, dex_size, first_seen_at
         FROM class_cache
         WHERE scan_id = ? AND fqcn LIKE ?
         ORDER BY fqcn ASC LIMIT ?`,
      [scanId, prefix + '%', limit]
    );
    return rows.map(rowToRecord);
  },

  async byPackage(scanId: string, pkg: string, limit = 500): Promise<ClassRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT scan_id, fqcn, package, simple_name, dex_file, dex_size, first_seen_at
         FROM class_cache
         WHERE scan_id = ? AND package = ?
         ORDER BY simple_name ASC LIMIT ?`,
      [scanId, pkg, limit]
    );
    return rows.map(rowToRecord);
  },

  async byPackagePrefix(scanId: string, prefix: string, limit = 500): Promise<ClassRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT scan_id, fqcn, package, simple_name, dex_file, dex_size, first_seen_at
         FROM class_cache
         WHERE scan_id = ? AND package LIKE ?
         ORDER BY fqcn ASC LIMIT ?`,
      [scanId, prefix + '%', limit]
    );
    return rows.map(rowToRecord);
  },

  async siblings(scanId: string, fqcn: string, limit = 100): Promise<ClassRecord[]> {
    const parts = fqcn.split('.');
    const pkg = parts.slice(0, -1).join('.');
    return this.byPackage(scanId, pkg, limit);
  },

  async packageSummary(scanId: string, topN = 20): Promise<Array<{ top: string; count: number }>> {
    const db = await getDb();
    // SQLite doesn't have string split — do it in JS.
    const rows = await db.getAllAsync<{ package: string }>(
      `SELECT package FROM class_cache WHERE scan_id = ?`,
      [scanId]
    );
    const counts = new Map<string, number>();
    for (const r of rows) {
      const top = r.package.split('.').slice(0, 3).join('.');
      counts.set(top, (counts.get(top) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([top, count]) => ({ top, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  },

  async search(
    scanId: string,
    opts: { contains?: string; nameEquals?: string; dexFile?: string; limit?: number }
  ): Promise<ClassRecord[]> {
    const db = await getDb();
    const limit = Math.min(2000, opts.limit ?? 200);
    const conds: string[] = ['scan_id = ?'];
    const args: any[] = [scanId];
    if (opts.contains) { conds.push('fqcn LIKE ?'); args.push('%' + opts.contains + '%'); }
    if (opts.nameEquals) { conds.push('LOWER(simple_name) = ?'); args.push(opts.nameEquals.toLowerCase()); }
    if (opts.dexFile) { conds.push('dex_file = ?'); args.push(opts.dexFile); }
    args.push(limit);
    const rows = await db.getAllAsync<any>(
      `SELECT scan_id, fqcn, package, simple_name, dex_file, dex_size, first_seen_at
         FROM class_cache WHERE ${conds.join(' AND ')}
         ORDER BY fqcn ASC LIMIT ?`,
      args
    );
    return rows.map(rowToRecord);
  },
};

function rowToRecord(r: any): ClassRecord {
  return {
    scanId: r.scan_id,
    fqcn: r.fqcn,
    package: r.package,
    simpleName: r.simple_name,
    dexFile: r.dex_file,
    dexSize: r.dex_size,
    firstSeenAt: r.first_seen_at,
  };
}
