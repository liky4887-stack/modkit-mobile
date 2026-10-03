// Pure logic. Compares expected version metadata against observed,
// produces discrepancies and a recommended action.
import { eventBus } from './eventBus';

export interface VersionMetadata {
  versionCode: number;
  versionName: string;
  minSdk: number;
  targetSdk: number;
  packageName: string;
}

export interface VersionExpectation {
  versionCode?: number;
  versionName?: string;
  minSdk?: number;
  targetSdk?: number;
  packageName?: string;
  integrityMarkers?: string[];
}

export interface VersionDiscrepancy {
  field: string;
  expected: string;
  actual: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ContinuityResult {
  consistent: boolean;
  discrepancies: VersionDiscrepancy[];
  action: 'none' | 'adjust_metadata' | 'flag_review';
  score: number;   // 0..1, 1 = perfect
}

function severityFor(field: string, expected: unknown, actual: unknown): VersionDiscrepancy['severity'] {
  // packageName differences are critical
  if (field === 'packageName') return 'high';
  // SDK range differences are high
  if (field === 'minSdk' || field === 'targetSdk') return 'medium';
  // versionCode/Name differences are expected during a transform
  if (field === 'versionCode' || field === 'versionName') return 'low';
  return 'low';
}

export function evaluateContinuity(
  observed: VersionMetadata,
  expected: VersionExpectation
): ContinuityResult {
  const disc: VersionDiscrepancy[] = [];

  const compare = (field: keyof VersionMetadata) => {
    const exp = (expected as any)[field];
    if (exp === undefined) return;
    const act = (observed as any)[field];
    if (String(exp) !== String(act)) {
      disc.push({
        field,
        expected: String(exp),
        actual: String(act),
        severity: severityFor(field, exp, act),
      });
    }
  };

  compare('versionCode');
  compare('versionName');
  compare('minSdk');
  compare('targetSdk');
  compare('packageName');

  const high = disc.filter(d => d.severity === 'high').length;
  const medium = disc.filter(d => d.severity === 'medium').length;

  const score = Math.max(0, 1 - high * 0.5 - medium * 0.15 - disc.filter(d => d.severity === 'low').length * 0.03);

  let action: ContinuityResult['action'];
  if (disc.length === 0) action = 'none';
  else if (high === 0) action = 'adjust_metadata';
  else action = 'flag_review';

  return {
    consistent: disc.length === 0,
    discrepancies: disc,
    action,
    score,
  };
}

export const versionContinuityGuard = {
  check(args: {
    scanId: string;
    correlationId: string;
    observed: VersionMetadata;
    expected: VersionExpectation;
  }): ContinuityResult {
    const result = evaluateContinuity(args.observed, args.expected);
    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'validate', functionId: 'version_continuity_guard',
      severity: result.action === 'flag_review' ? 'critical'
              : result.action === 'adjust_metadata' ? 'warn' : 'info',
      payload: {
        action: 'continuity_evaluated',
        decision: result.action,
        discrepancies: result.discrepancies.length,
        score: Number(result.score.toFixed(3)),
      },
    });
    return result;
  },
};
