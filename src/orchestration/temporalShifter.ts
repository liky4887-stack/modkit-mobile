// Pure logic. Models execution timing characteristics of regions
// and flags deviations after a transform.
import { eventBus } from './eventBus';

export interface TemporalSample {
  path: string;
  region: { start: number; end: number };
  estimatedExecutionMs: number;
  callDepth: number;
  loopIterationEstimate: number;
}

export interface TemporalExpectation {
  path: string;
  minMs: number;
  maxMs: number;
  maxDepthDelta: number;
}

export interface TemporalAdjustment {
  path: string;
  region: { start: number; end: number };
  observedMs: number;
  expectedMin: number;
  expectedMax: number;
  deviation: number;   // 0..1
  action: 'none' | 'flag' | 'adjust';
  rationale: string;
}

export function compareTemporal(
  sample: TemporalSample,
  expectation: TemporalExpectation
): TemporalAdjustment {
  const { estimatedExecutionMs: ms } = sample;
  const span = Math.max(expectation.maxMs - expectation.minMs, 0.001);

  if (ms >= expectation.minMs && ms <= expectation.maxMs) {
    return {
      path: sample.path,
      region: sample.region,
      observedMs: ms,
      expectedMin: expectation.minMs,
      expectedMax: expectation.maxMs,
      deviation: 0,
      action: 'none',
      rationale: 'within expected timing band',
    };
  }

  const overshoot = ms > expectation.maxMs ? ms - expectation.maxMs : expectation.minMs - ms;
  const deviation = Math.min(1, overshoot / Math.max(span, 1));
  const action = deviation > 0.5 ? 'flag' : 'adjust';

  return {
    path: sample.path,
    region: sample.region,
    observedMs: ms,
    expectedMin: expectation.minMs,
    expectedMax: expectation.maxMs,
    deviation,
    action,
    rationale: ms > expectation.maxMs ? 'slower than expected' : 'faster than expected',
  };
}

export const temporalShifter = {
  analyze(args: {
    scanId: string;
    correlationId: string;
    samples: TemporalSample[];
    expectations: TemporalExpectation[];
  }): { adjustments: TemporalAdjustment[]; flagged: number } {
    const expByPath = new Map(args.expectations.map(e => [e.path, e]));
    const adjustments: TemporalAdjustment[] = [];

    for (const s of args.samples) {
      const e = expByPath.get(s.path);
      if (!e) continue;
      adjustments.push(compareTemporal(s, e));
    }

    const flagged = adjustments.filter(a => a.action === 'flag').length;

    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'validate', functionId: 'temporal_shifter',
      severity: flagged > 0 ? 'warn' : 'info',
      payload: {
        action: 'temporal_analyzed',
        samples: adjustments.length,
        flagged,
      },
    });

    return { adjustments, flagged };
  },
};
