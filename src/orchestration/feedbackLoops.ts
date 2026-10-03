import { eventBus } from './eventBus';
import { PhaseId } from './types';
import { ValidationResult, ValidationCheck } from './validationPhase';

export interface FeedbackAction {
  targetPhase: PhaseId;
  refinedParameters: Record<string, unknown>;
  segmentsToRevisit: string[];
  rollbackRequired: boolean;
  reason: string;
}

export interface FeedbackTrigger {
  scanId: string;
  correlationId: string;
  currentPhase: PhaseId;
  validation: ValidationResult;
  affectedSegments: string[];
  priorAttempts: number;
}

const PHASE_FOR_CHECK: Record<string, PhaseId> = {
  structural_delta: 'edit',
  entropy_deviation: 'edit',
  change_concentration: 'edit',
  signature_stability: 'edit',
  ledger_reconciled: 'build',
};

const MAX_REVISIT_ATTEMPTS = 3;

export function buildFeedbackActions(trigger: FeedbackTrigger): FeedbackAction[] {
  const validation = trigger.validation;
  const affectedSegments = trigger.affectedSegments;
  const priorAttempts = trigger.priorAttempts;

  if (validation.passed) return [];
  if (priorAttempts >= MAX_REVISIT_ATTEMPTS) {
    return [{
      targetPhase: 'validate',
      refinedParameters: { escalate: true },
      segmentsToRevisit: affectedSegments,
      rollbackRequired: true,
      reason: 'max_attempts_exceeded',
    }];
  }

  const failed = validation.checks.filter((c: ValidationCheck) => !c.passed);
  const byPhase = new Map<PhaseId, ValidationCheck[]>();
  for (const c of failed) {
    const p = PHASE_FOR_CHECK[c.name] || 'edit';
    if (!byPhase.has(p)) byPhase.set(p, []);
    byPhase.get(p)!.push(c);
  }

  const actions: FeedbackAction[] = [];
  for (const [phase, checks] of byPhase) {
    const refined: Record<string, unknown> = {};
    let rollback = false;

    for (const c of checks) {
      const ratio = c.threshold > 0 ? c.actual / c.threshold : (c.actual > 0 ? 2 : 0);
      if (ratio > 1.5) {
        rollback = true;
        refined['rollback_' + c.name] = true;
      } else {
        refined['tighten_' + c.name + '_factor'] = Math.max(0.5, 1 - (ratio - 1) * 0.5);
      }
    }

    actions.push({
      targetPhase: phase,
      refinedParameters: refined,
      segmentsToRevisit: affectedSegments,
      rollbackRequired: rollback,
      reason: 'failed_checks:' + checks.map(c => c.name).join(','),
    });
  }
  return actions;
}

export const feedbackLoops = {
  process(trigger: FeedbackTrigger): FeedbackAction[] {
    const actions = buildFeedbackActions(trigger);
    if (actions.length === 0) return actions;

    eventBus.emit({
      scanId: trigger.scanId, correlationId: trigger.correlationId,
      phase: trigger.currentPhase, functionId: 'feedback_loops',
      severity: actions.some(a => a.rollbackRequired) ? 'warn' : 'info',
      payload: {
        action: 'feedback_dispatched',
        actionCount: actions.length,
        phases: actions.map(a => a.targetPhase),
        rollback: actions.some(a => a.rollbackRequired),
      },
    });
    return actions;
  },
};
