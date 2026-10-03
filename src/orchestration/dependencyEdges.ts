// Pure edge derivation. No SQLite, no react-native.
export interface DependencyEdge {
  source: string;
  target: string;
  type: 'shared_ref' | 'version_bind' | 'checksum_span' | 'loader_ref';
  constraints: string[];
}

export function deriveEdgesFromScan(scan: any): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const dex = Array.isArray(scan && scan.dexFiles) ? scan.dexFiles : [];

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
  for (const entry of Array.from(byPackage.entries())) {
    const pkg = entry[0];
    const members = entry[1];
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
