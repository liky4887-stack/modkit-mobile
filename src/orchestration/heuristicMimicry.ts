// Pure logic. Learns naming/structure norms from the original project,
// then scores a proposed change against those norms.
import { eventBus } from './eventBus';

export interface ClassName {
  fqcn: string;         // e.g. com.sandbox.krmobile.DownloaderActivity (sample target)
  kind: 'class' | 'interface' | 'enum';
}

export interface ProjectNorms {
  // package-depth histogram: how many classes at each depth
  packageDepthDistribution: Record<number, number>;
  // naming style of the last segment
  lastSegmentCase: 'pascal' | 'camel' | 'snake' | 'unknown';
  // common top-level packages
  topPackages: string[];
  // average segments per fqcn
  avgSegments: number;
  sampleSize: number;
}

export interface MimicryScore {
  changeId: string;
  consistency: number;    // 0..1, higher = more aligned
  violations: string[];
  suggestion?: string;
}

function classifyCase(token: string): ProjectNorms['lastSegmentCase'] {
  if (/^[a-z][a-zA-Z0-9]*$/.test(token)) return 'camel';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(token)) return 'pascal';
  if (/^[a-z][a-z0-9_]*$/.test(token)) return 'snake';
  return 'unknown';
}

export function learnNorms(classes: ClassName[]): ProjectNorms {
  const depthDist: Record<number, number> = {};
  const topCounts = new Map<string, number>();
  const caseCounts = new Map<ProjectNorms['lastSegmentCase'], number>();
  let segTotal = 0;

  for (const c of classes) {
    const parts = c.fqcn.split('.');
    segTotal += parts.length;
    depthDist[parts.length] = (depthDist[parts.length] || 0) + 1;

    const top = parts.slice(0, 2).join('.');
    topCounts.set(top, (topCounts.get(top) || 0) + 1);

    const last = parts[parts.length - 1] || '';
    const k = classifyCase(last);
    caseCounts.set(k, (caseCounts.get(k) || 0) + 1);
  }

  let bestCase: ProjectNorms['lastSegmentCase'] = 'unknown';
  let bestCount = 0;
  for (const entry of Array.from(caseCounts.entries())) {
    if (entry[1] > bestCount) { bestCount = entry[1]; bestCase = entry[0]; }
  }

  const topPackages = Array.from(topCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(e => e[0]);

  return {
    packageDepthDistribution: depthDist,
    lastSegmentCase: bestCase,
    topPackages,
    avgSegments: classes.length > 0 ? segTotal / classes.length : 0,
    sampleSize: classes.length,
  };
}

export function scoreChange(
  changeId: string,
  proposedFqcn: string,
  norms: ProjectNorms
): MimicryScore {
  const violations: string[] = [];
  const parts = proposedFqcn.split('.');
  const depth = parts.length;
  const last = parts[parts.length - 1] || '';
  const top = parts.slice(0, 2).join('.');

  // depth check
  const depths = Object.keys(norms.packageDepthDistribution).map(Number);
  if (depths.length > 0) {
    const minDepth = Math.min.apply(null, depths);
    const maxDepth = Math.max.apply(null, depths);
    if (depth < minDepth || depth > maxDepth) {
      violations.push('package depth ' + depth + ' outside [' + minDepth + ',' + maxDepth + ']');
    }
  }

  // case check
  const observed = classifyCase(last);
  if (norms.lastSegmentCase !== 'unknown' && observed !== norms.lastSegmentCase) {
    violations.push('case ' + observed + ' vs project norm ' + norms.lastSegmentCase);
  }

  // top-package check
  if (norms.topPackages.length > 0 && norms.topPackages.indexOf(top) < 0) {
    violations.push('top package ' + top + ' not in project top set');
  }

  // depth-vs-avg
  if (norms.avgSegments > 0 && Math.abs(depth - norms.avgSegments) > 2) {
    violations.push('depth ' + depth + ' far from avg ' + norms.avgSegments.toFixed(2));
  }

  const consistency = Math.max(0, 1 - violations.length * 0.2);
  let suggestion: string | undefined;
  if (violations.length > 0 && norms.topPackages.length > 0) {
    suggestion = 'consider: ' + norms.topPackages[0] + '.' + parts[parts.length - 1];
  }

  return { changeId, consistency, violations, suggestion };
}

export const heuristicMimicry = {
  analyze(args: {
    scanId: string;
    correlationId: string;
    classes: ClassName[];
    proposedChanges: Array<{ changeId: string; proposedFqcn: string }>;
  }): { norms: ProjectNorms; scores: MimicryScore[] } {
    const norms = learnNorms(args.classes);
    const scores = args.proposedChanges.map(c =>
      scoreChange(c.changeId, c.proposedFqcn, norms)
    );

    const aligned = scores.filter(s => s.consistency >= 0.8).length;
    const misaligned = scores.length - aligned;

    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'analyze', functionId: 'heuristic_mimicry',
      severity: misaligned > 0 ? 'warn' : 'info',
      payload: {
        action: 'mimicry_analyzed',
        sampleSize: norms.sampleSize,
        aligned,
        misaligned,
        dominantCase: norms.lastSegmentCase,
      },
    });

    return { norms, scores };
  },
};
