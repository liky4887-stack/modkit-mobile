// Pure logic. Given a byte distribution per region, compute a
// normalized entropy profile and compare against an expected range.
import { eventBus } from './eventBus';

export interface EntropySample {
  path: string;
  region: { start: number; end: number };
  // 256-bin histogram of byte values (counts, not frequencies)
  histogram: number[];
}

export interface EntropyProfile {
  path: string;
  region: { start: number; end: number };
  byteCount: number;
  shannonEntropy: number;    // 0..8
}

export interface EntropyExpectation {
  path: string;
  // expected range for that path/region
  min: number;
  max: number;
}

export interface EntropyAdjustment {
  path: string;
  region: { start: number; end: number };
  observed: number;
  expectedMin: number;
  expectedMax: number;
  deviation: number;         // 0..1, 0 = centered in range
  action: 'none' | 'flag' | 'adjust';
  rationale: string;
}

// Shannon entropy, normalized to [0, 8].
export function shannonEntropy(histogram: number[]): number {
  let total = 0;
  for (let i = 0; i < 256; i++) total += histogram[i] || 0;
  if (total === 0) return 0;
  let h = 0;
  for (let i = 0; i < 256; i++) {
    const c = histogram[i] || 0;
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

export function profile(sample: EntropySample): EntropyProfile {
  const total = sample.histogram.reduce((s, v) => s + (v || 0), 0);
  return {
    path: sample.path,
    region: sample.region,
    byteCount: total,
    shannonEntropy: shannonEntropy(sample.histogram),
  };
}

export function compareToExpectation(
  p: EntropyProfile,
  e: EntropyExpectation
): EntropyAdjustment {
  const span = Math.max(e.max - e.min, 0.0001);
  const center = (e.min + e.max) / 2;

  if (p.shannonEntropy >= e.min && p.shannonEntropy <= e.max) {
    // Inside band → zero drift. Deviation measures band violation, not
    // distance from center.
    return {
      path: p.path,
      region: p.region,
      observed: p.shannonEntropy,
      expectedMin: e.min,
      expectedMax: e.max,
      deviation: 0,
      action: 'none',
      rationale: 'within expected band',
    };
  }

  const overshoot = p.shannonEntropy > e.max
    ? p.shannonEntropy - e.max
    : e.min - p.shannonEntropy;
  const deviation = Math.min(1, overshoot / Math.max(span, 0.5));
  const action = deviation > 0.5 ? 'flag' : 'adjust';

  return {
    path: p.path,
    region: p.region,
    observed: p.shannonEntropy,
    expectedMin: e.min,
    expectedMax: e.max,
    deviation,
    action,
    rationale: p.shannonEntropy > e.max ? 'entropy above band' : 'entropy below band',
  };
}

export const entropyBalancer = {
  analyze(args: {
    scanId: string;
    correlationId: string;
    samples: EntropySample[];
    expectations: EntropyExpectation[];
  }): { profiles: EntropyProfile[]; adjustments: EntropyAdjustment[] } {
    const expectationsByPath = new Map(args.expectations.map(e => [e.path, e]));
    const profiles: EntropyProfile[] = [];
    const adjustments: EntropyAdjustment[] = [];

    for (const s of args.samples) {
      const p = profile(s);
      profiles.push(p);
      const e = expectationsByPath.get(s.path);
      if (!e) continue;
      adjustments.push(compareToExpectation(p, e));
    }

    const flagged = adjustments.filter(a => a.action === 'flag').length;
    const adjusted = adjustments.filter(a => a.action === 'adjust').length;

    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'validate', functionId: 'entropy_balancer',
      severity: flagged > 0 ? 'warn' : 'info',
      payload: {
        action: 'entropy_analyzed',
        samples: profiles.length,
        flagged,
        adjusted,
      },
    });

    return { profiles, adjustments };
  },
};
