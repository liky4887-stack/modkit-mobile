// Pure logic. Detects synthetic pattern clusters (n-gram frequency
// outliers) relative to a project baseline. Proposes normalization.
import { eventBus } from './eventBus';

export interface PatternStat {
  pattern: string;    // e.g. an identifier, string literal, or n-gram
  count: number;
}

export interface PatternBaseline {
  // Statistical norms derived from the original project (class names,
  // method names, string constants). Distribution of counts.
  mean: number;
  stddev: number;
  sampleCount: number;
}

export interface PatternOutlier {
  pattern: string;
  count: number;
  zScore: number;
  suspicion: number;    // 0..1
  reason: string;
}

export interface NormalizationSuggestion {
  pattern: string;
  suggestion: 'rename_to_project_norm' | 'reduce_frequency' | 'remove_if_unused';
  proposed: string;
  rationale: string;
}

export function computeBaseline(stats: PatternStat[]): PatternBaseline {
  const counts = stats.map(s => s.count);
  if (counts.length === 0) return { mean: 0, stddev: 0, sampleCount: 0 };
  const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
  const variance = counts.reduce((s, c) => s + (c - mean) * (c - mean), 0) / counts.length;
  return { mean, stddev: Math.sqrt(variance), sampleCount: counts.length };
}

export function findOutliers(
  stats: PatternStat[],
  baseline: PatternBaseline,
  zThreshold = 2.5
): PatternOutlier[] {
  const sd = baseline.stddev > 0.0001 ? baseline.stddev : 1;
  const out: PatternOutlier[] = [];
  for (const s of stats) {
    const z = (s.count - baseline.mean) / sd;
    if (z < zThreshold) continue;
    const suspicion = Math.min(1, (z - zThreshold) / 4 + 0.5);
    out.push({
      pattern: s.pattern,
      count: s.count,
      zScore: Number(z.toFixed(3)),
      suspicion: Number(suspicion.toFixed(3)),
      reason: 'z=' + z.toFixed(2) + ' above ' + zThreshold,
    });
  }
  return out;
}

// Heuristic: a synthetic identifier often has an unusual token shape.
// e.g. contains numeric suffix blocks, random-looking consonant clusters,
// or __-wrapped triplets.
export function looksSynthetic(pattern: string): boolean {
  if (/__[a-z]+_[a-z]+__/i.test(pattern)) return true;
  if (/[bcdfghjklmnpqrstvwxz]{6,}/i.test(pattern)) return true;
  if (/_v\d+_\d{4,}/.test(pattern)) return true;
  if (/[a-z]{3,}\d{4,}[a-z]{3,}/i.test(pattern)) return true;
  return false;
}

export function suggestNormalization(
  outlier: PatternOutlier,
  projectNorms: string[]
): NormalizationSuggestion | null {
  const synthetic = looksSynthetic(outlier.pattern);
  if (!synthetic && outlier.suspicion < 0.7) return null;

  if (outlier.suspicion >= 0.85) {
    return {
      pattern: outlier.pattern,
      suggestion: 'remove_if_unused',
      proposed: '',
      rationale: 'high suspicion + synthetic shape',
    };
  }

  if (projectNorms.length > 0) {
    // pick nearest-length norm as a renaming target
    const target = projectNorms.slice().sort(
      (a, b) => Math.abs(a.length - outlier.pattern.length) - Math.abs(b.length - outlier.pattern.length)
    )[0];
    return {
      pattern: outlier.pattern,
      suggestion: 'rename_to_project_norm',
      proposed: target,
      rationale: 'align to project naming convention: ' + target,
    };
  }

  return {
    pattern: outlier.pattern,
    suggestion: 'reduce_frequency',
    proposed: outlier.pattern,
    rationale: 'low-norm-similarity; reduce occurrences',
  };
}

export const signatureScrubber = {
  analyze(args: {
    scanId: string;
    correlationId: string;
    stats: PatternStat[];
    projectNorms: string[];
    zThreshold?: number;
  }): {
    baseline: PatternBaseline;
    outliers: PatternOutlier[];
    suggestions: NormalizationSuggestion[];
  } {
    const baseline = computeBaseline(args.stats);
    const outliers = findOutliers(args.stats, baseline, args.zThreshold ?? 2.5);
    const suggestions: NormalizationSuggestion[] = [];
    for (const o of outliers) {
      const s = suggestNormalization(o, args.projectNorms);
      if (s) suggestions.push(s);
    }

    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'validate', functionId: 'signature_scrubber',
      severity: suggestions.length > 0 ? 'warn' : 'info',
      payload: {
        action: 'scrub_analyzed',
        outliers: outliers.length,
        suggestions: suggestions.length,
        baselineMean: Number(baseline.mean.toFixed(3)),
      },
    });

    return { baseline, outliers, suggestions };
  },
};
