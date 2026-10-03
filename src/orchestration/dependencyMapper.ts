import * as SQLite from 'expo-sqlite';

async function db() { return SQLite.openDatabaseAsync('modkit.db'); }

export interface AssetNode {
  id: string;
  scanId: string;
  type: 'dex_class' | 'native_lib' | 'asset' | 'config' | 'resource';
  hash: string;
  metadata: Record<string, unknown>;
}

export interface DependencyEdge {
  source: string;
  target: string;
  type: 'shared_ref' | 'version_bind' | 'checksum_span' | 'loader_ref';
  constraints: string[];
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function deriveEdgesFromScan(scan: any): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const dex = Array.isArray(scan?.dexFiles) ? scan.dexFiles : [];

  for (const d of dex) {
    const dexId = 'dex:' + (d.name || d.path || 'unknown');
    for (const cls of (d.classes || [])) {
      edges.push({
        source: dexId,
        target: 'dex_class:' + cls,
        type: 'loader_ref',
        constraints: [],
      });
    }
  }

  const allClasses: string[] = dex.flatMap((d: any) => d.classes || []);
  const byPackage = new Map<string, string[]>();
  for (const c of allClasses) {
    const parts = c.split('.').slice(0, 3).join('.');
    if (!byPackage.has(parts)) byPackage.set(parts, []);
    byPackage.get(parts)!.push(c);
  }
  for (const [pkg, members] of byPackage) {
    if (members.length < 2) continue;
    for (let i = 0; i < Math.min(members.length - 1, 8); i++) {
      edges.push({
        source: 'dex_class:' + members[i],
        target: 'dex_class:' + members[i + 1],
        type: 'shared_ref',
        constraints: ['package:' + pkg],
      });
    }
  }

  return edges;
}

export const dependencyMapper = {
  async recordEdge(scanId: string, e: DependencyEdge): Promise<string> {
    const id = uuid();
    const d = await db();
    await d.runAsync(
      'INSERT INTO dependency_map (id, scan_id, source_asset, target_asset, relationship_type, constraints, verified, created_at) VALUES (?,?,?,?,?,?,0,?)',
      [id, scanId, e.source, e.target, e.type, JSON.stringify(e.constraints), Date.now()]
    );
    return id;
  },

  async ingestScan(scanId: string, scan: any): Promise<number> {
    const edges = deriveEdgesFromScan(scan);
    const d = await db();
    for (const e of edges) {
      await d.runAsync(
        'INSERT INTO dependency_map (id, scan_id, source_asset, target_asset, relationship_type, constraints, verified, created_at) VALUES (?,?,?,?,?,?,0,?)',
        [uuid(), scanId, e.source, e.target, e.type, JSON.stringify(e.constraints), Date.now()]
      );
    }
    return edges.length;
  },

  async getDownstream(scanId: string, assetId: string, depth = 2): Promise<string[]> {
    const d = await db();
    const rows = await d.getAllAsync<any>(
      'SELECT source_asset, target_asset FROM dependency_map WHERE scan_id = ?',
      [scanId]
    );
    const adj = new Map<string, string[]>();
    for (const r of rows) {
      if (!adj.has(r.source_asset)) adj.set(r.source_asset, []);
      adj.get(r.source_asset)!.push(r.target_asset);
    }
    const seen = new Set<string>();
    let frontier = [assetId];
    for (let lvl = 0; lvl < depth; lvl++) {
      const next: string[] = [];
      for (const node of frontier) {
        for (const t of adj.get(node) || []) {
          if (!seen.has(t) && t !== assetId) { seen.add(t); next.push(t); }
        }
      }
      frontier = next;
    }
    return Array.from(seen);
  },

  async getDownstreamForSegments(scanId: string, segments: string[]): Promise<string[]> {
    const all = new Set<string>();
    for (const s of segments) {
      for (const t of await this.getDownstream(scanId, s)) all.add(t);
    }
    return Array.from(all);
  },

  async stats(scanId: string): Promise<{ edges: number; sources: number; targets: number }> {
    const d = await db();
    const row = await d.getFirstAsync<any>(
      'SELECT COUNT(*) AS edges, COUNT(DISTINCT source_asset) AS sources, COUNT(DISTINCT target_asset) AS targets FROM dependency_map WHERE scan_id = ?',
      [scanId]
    );
    return { edges: row?.edges ?? 0, sources: row?.sources ?? 0, targets: row?.targets ?? 0 };
  },
};
