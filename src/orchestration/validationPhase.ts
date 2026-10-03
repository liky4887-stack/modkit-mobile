import { eventBus } from './eventBus';

export interface ValidationThresholds {
  maxStructuralDelta: number;
  maxEntropyDeviation: number;
  maxConcentratedChangeRegion: number;
  requiredSignatureStability: boolean;
}

export const DEFAULT_THRESHOLDS: ValidationThresholds = {
  maxStructuralDelta: 0.20,
  maxEntropyDeviation: 0.10,
  maxConcentratedChangeRegion: 0.30,
  requiredSignatureStability: true,
};

export interface ValidationCheck {
  name: string;
  passed: boolean;
  actual: number;
  threshold: number;
  details: string;
}

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
  overallRiskScore: number;
  promotionDecision: 'promote' | 'remediate' | 'reject';
}

export interface ValidationInput {
  scanId: string;
  correlationId: string;
  structuralDelta: number;
  entropyDeviation: number;
  concentrationScore: number;
  signatureStable: boolean;
  ledgerPendingCount: number;
  thresholds?: Partial<ValidationThresholds>;
}

export function evaluateValidation(input: ValidationInput): ValidationResult {
  const t: ValidationThresholds = Object.assign({}, DEFAULT_THRESHOLDS, input.thresholds || {});
  const checks: ValidationCheck[] = [];

  checks.push({
    name: 'structural_delta',
    passed: input.structuralDelta <= t.maxStructuralDelta,
    actual: input.structuralDelta,
    threshold: t.maxStructuralDelta,
    details: 'change magnitude vs base artifact',
  });

  checks.push({
    name: 'entropy_deviation',
    passed: input.entropyDeviation <= t.maxEntropyDeviation,
    actual: input.entropyDeviation,
    threshold: t.maxEntropyDeviation,
    details: 'statistical profile drift',
  });

  checks.push({
    name: 'change_concentration',
    passed: input.concentrationScore <= t.maxConcentratedChangeRegion,
    actual: input.concentrationScore,
    threshold: t.maxConcentratedChangeRegion,
    details: 'no single region dominated by edits',
  });

  if (t.requiredSignatureStability) {
    checks.push({
      name: 'signature_stability',
      passed: input.signatureStable,
      actual: input.signatureStable ? 0 : 1,
      threshold: 0,
      details: 'integrity markers stable across transform',
    });
  }

  checks.push({
    name: 'ledger_reconciled',
    passed: input.ledgerPendingCount === 0,
    actual: input.ledgerPendingCount,
    threshold: 0,
    details: 'no pending truth-ledger entries',
  });

  const failed = checks.filter(c => !c.passed);
  const overallRiskScore = Math.min(1, failed.length * 0.25 + input.concentrationScore * 0.3);

  let promotionDecision: 'promote' | 'remediate' | 'reject';
  if (failed.length === 0) promotionDecision = 'promote';
  else if (failed.length <= 2 && overallRiskScore < 0.6) promotionDecision = 'remediate';
  else promotionDecision = 'reject';

  return {
    passed: failed.length === 0,
    checks,
    overallRiskScore,
    promotionDecision,
  };
}

export const validationPhase = {
  evaluate: evaluateValidation,

  run(input: ValidationInput): ValidationResult {
    const result = evaluateValidation(input);
    eventBus.emit({
      scanId: input.scanId, correlationId: input.correlationId,
      phase: 'validate', functionId: 'validation_phase',
      severity: result.passed ? 'info' : (result.promotionDecision === 'reject' ? 'critical' : 'warn'),
      payload: {
        action: 'validation_complete',
        decision: result.promotionDecision,
        riskScore: result.overallRiskScore,
        failedChecks: result.checks.filter(c => !c.passed).map(c => c.name),
      },
    });
    return result;
  },
};
