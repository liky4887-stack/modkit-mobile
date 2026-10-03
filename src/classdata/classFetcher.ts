// Class fetcher — the responder for chat "give me class X" requests.
// Parses natural-language query intent, looks up the cache, formats
// the answer as compact text the chat can consume.

import { classCache, ClassRecord } from './classCache';

export interface FetchRequest {
  scanId: string;
  query: string;
  maxClasses?: number;
}

export interface FetchResult {
  kind: 'package' | 'prefix' | 'siblings' | 'dex' | 'top' | 'unknown';
  args: Record<string, string>;
  classes: ClassRecord[];
  totalInCache: number;
  truncated: boolean;
}

function topOfPackage(pkg: string): string {
  return pkg.split('.').slice(0, 3).join('.');
}

export const classFetcher = {
  async fetch(req: FetchRequest): Promise<FetchResult> {
    const q = req.query.trim();
    const limit = req.maxClasses ?? 200;
    const totalInCache = await classCache.count(req.scanId);

    // 1. "siblings of com.foo.Bar"
    const sibMatch = q.match(/siblings\s+(?:of\s+)?([\w.$]+)/i);
    if (sibMatch) {
      const fqcn = sibMatch[1];
      const classes = await classCache.siblings(req.scanId, fqcn, limit);
      return {
        kind: 'siblings',
        args: { fqcn },
        classes,
        totalInCache,
        truncated: classes.length >= limit,
      };
    }

    // 2. "package com.foo"
    const pkgMatch = q.match(/package\s+([\w.]+)/i);
    if (pkgMatch) {
      const pkg = pkgMatch[1];
      const exact = await classCache.byPackage(req.scanId, pkg, limit);
      if (exact.length > 0) {
        return { kind: 'package', args: { package: pkg }, classes: exact, totalInCache, truncated: exact.length >= limit };
      }
      const prefix = await classCache.byPackagePrefix(req.scanId, pkg, limit);
      return { kind: 'prefix', args: { prefix: pkg }, classes: prefix, totalInCache, truncated: prefix.length >= limit };
    }

    // 3. "classes in com.foo" / "under com.foo"
    const underMatch = q.match(/(?:in|under)\s+([\w.]+)/i);
    if (underMatch) {
      const prefix = underMatch[1];
      const classes = await classCache.byPackagePrefix(req.scanId, prefix, limit);
      return { kind: 'prefix', args: { prefix }, classes, totalInCache, truncated: classes.length >= limit };
    }

    // 4. "dex classes582.dex"
    const dexMatch = q.match(/(classes\d*\.dex)/i);
    if (dexMatch) {
      const dexFile = dexMatch[1];
      const classes = await classCache.search(req.scanId, { dexFile, limit });
      return { kind: 'dex', args: { dexFile }, classes, totalInCache, truncated: classes.length >= limit };
    }

    // 5. fqcn-like token
    const fqcnMatch = q.match(/([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)\b/i);
    if (fqcnMatch && fqcnMatch[1].indexOf('.') >= 0) {
      const tok = fqcnMatch[1];
      const last = tok.split('.').pop() || '';
      if (/^[A-Z]/.test(last)) {
        const classes = await classCache.search(req.scanId, { contains: tok, limit });
        return { kind: 'prefix', args: { contains: tok }, classes, totalInCache, truncated: classes.length >= limit };
      }
      const classes = await classCache.byPackagePrefix(req.scanId, tok, limit);
      return { kind: 'prefix', args: { prefix: tok }, classes, totalInCache, truncated: classes.length >= limit };
    }

    // 6. top packages
    if (/top|summary|overview/i.test(q)) {
      const summary = await classCache.packageSummary(req.scanId, 20);
      const classes: ClassRecord[] = summary.map((s) => ({
        scanId: req.scanId,
        fqcn: s.top,
        package: s.top,
        simpleName: s.top.split('.').pop() || s.top,
        dexFile: '—',
        dexSize: 0,
        firstSeenAt: 0,
      }));
      return { kind: 'top', args: {}, classes, totalInCache, truncated: false };
    }

    return { kind: 'unknown', args: {}, classes: [], totalInCache, truncated: false };
  },

  formatForChat(result: FetchResult, maxRows = 100): string {
    if (result.kind === 'top') {
      const lines = result.classes.slice(0, maxRows).map(c => '  ' + c.fqcn + ' (' + c.dexFile + ')');
      return ['=== TOP PACKAGES ===', 'Total classes in cache: ' + result.totalInCache].concat(lines).join('\n');
    }

    if (result.classes.length === 0) {
      return [
        '=== CLASS FETCH: NO MATCH ===',
        'Query kind: ' + result.kind,
        'Args: ' + JSON.stringify(result.args),
        'Total classes in cache: ' + result.totalInCache,
      ].join('\n');
    }

    const rows = result.classes.slice(0, maxRows);
    const lines = rows.map(c => '  ' + c.fqcn + ' | ' + c.dexFile + ' | ' + c.dexSize + 'B');
    const truncatedNote = result.truncated
      ? '\n(showing first ' + rows.length + ' of ' + result.classes.length + '+)'
      : '';

    return [
      '=== CLASS FETCH: ' + result.kind.toUpperCase() + ' ===',
      'Args: ' + JSON.stringify(result.args),
      'Total classes in cache: ' + result.totalInCache,
      'Returned: ' + rows.length + truncatedNote,
    ].concat(lines).join('\n');
  },

  formatOne(c: ClassRecord): string {
    return [
      'fqcn: ' + c.fqcn,
      'package: ' + c.package,
      'simpleName: ' + c.simpleName,
      'dexFile: ' + c.dexFile,
      'dexSize: ' + c.dexSize + 'B',
      'topPackage: ' + topOfPackage(c.package),
    ].join('\n');
  },
};
