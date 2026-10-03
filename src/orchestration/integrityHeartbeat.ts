// Pure logic. Compares observed metrics against expected; emits divergences.
// The scheduler (setInterval) lives in the wired module, not here.
import { eventBus } from './eventBus';

export interface HeartbeatMetric {
  name: string;
  expected: string;
  tolerance: number;   // 0..1, fraction of allowed deviation for numeric metrics
  kind: 'numeric' | 'string';
}

export interface MetricObservation {
  name: string;
  value: string;
}

export interface MetricStatus {
  name: string;
  expected: string;
  actual: string;
  withinTolerance: boolean;
  deviation: number;
}

export interface Divergence {
  metric: string;
  expected: string;
  actual: string;
  severity: 'low' | 'medium' | 'high';
  detectedAt: number;
}

export interface HeartbeatResult {
  healthy: boolean;
  metrics: MetricStatus[];
  divergences: Divergence[];
  lastCheckAt: number;
}

function numericDeviation(expected: string, actual: string, tolerance: number): number {
  const e = Number(expected);
  const a = Number(actual);
  if (!isFinite(e) || !isFinite(a)) return 1;
  if (e === 0) return a === 0 ? 0 : 1;
  const relDrift = Math.abs(a - e) / Math.abs(e);
  if (relDrift <= tolerance) return 0;
  return Math.min(1, (relDrift - tolerance) / Math.max(1 - tolerance, 0.0001));
}

function severityFor(deviation: number): Divergence['severity'] {
  if (deviation >= 0.8) return 'high';
  if (deviation >= 0.4) return 'medium';
  return 'low';
}

export function compareMetrics(
  expected: HeartbeatMetric[],
  observed: MetricObservation[]
): HeartbeatResult {
  const obsMap = new Map(observed.map(o => [o.name, o.value]));
  const metrics: MetricStatus[] = [];
  const divergences: Divergence[] = [];

  for (const e of expected) {
    const actual = obsMap.get(e.name);
    if (actual === undefined) {
      metrics.push({
        name: e.name,
        expected: e.expected,
        actual: '<missing>',
        withinTolerance: false,
        deviation: 1,
      });
      divergences.push({
        metric: e.name,
        expected: e.expected,
        actual: '<missing>',
        severity: 'high',
        detectedAt: Date.now(),
      });
      continue;
    }

    let deviation: number;
    let within: boolean;
    if (e.kind === 'numeric') {
      deviation = numericDeviation(e.expected, actual, e.tolerance);
      within = deviation === 0;
    } else {
      deviation = e.expected === actual ? 0 : 1;
      within = e.expected === actual;
    }

    metrics.push({
      name: e.name,
      expected: e.expected,
      actual,
      withinTolerance: within,
      deviation,
    });

    if (!within) {
      divergences.push({
        metric: e.name,
        expected: e.expected,
        actual,
        severity: severityFor(deviation),
        detectedAt: Date.now(),
      });
    }
  }

  return {
    healthy: divergences.length === 0,
    metrics,
    divergences,
    lastCheckAt: Date.now(),
  };
}

export const integrityHeartbeat = {
  tick(args: {
    scanId: string;
    correlationId: string;
    expected: HeartbeatMetric[];
    observed: MetricObservation[];
  }): HeartbeatResult {
    const result = compareMetrics(args.expected, args.observed);

    const severity: 'info' | 'warn' | 'critical' = result.healthy
      ? 'info'
      : (result.divergences.some(d => d.severity === 'high') ? 'critical' : 'warn');

    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'validate', functionId: 'integrity_heartbeat',
      severity,
      payload: {
        action: result.healthy ? 'heartbeat_ok' : 'heartbeat_divergence',
        healthy: result.healthy,
        divergences: result.divergences.length,
        highSeverity: result.divergences.filter(d => d.severity === 'high').length,
      },
    });

    return result;
  },
};
