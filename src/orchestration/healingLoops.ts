// Pure logic. Given a trigger (validation failure, collision, structural
// anomaly, worker failure), produce a remediation plan. Execution is
// delegated to the caller; this module only plans.
import { eventBus } from './eventBus';
import { PhaseId } from './types';

export interface HealingTrigger {
  scanId: string;
  correlationId: string;
  triggerType: 'validation_failure' | 'collision' | 'structural_anomaly' | 'worker_failure';
  affectedSegments: string[];
  failureDetails: string;
  previousAttempts: number;
}

export interface HealingPlan {
  strategy: 'refine_parameters' | 'rollback_segment' | 'replace_worker' | 'escalate';
  segments: string[];
  targetPhase: PhaseId;
  refinedParameters?: Record<string, unknown>;
  rollbackTargets?: string[];
  maxRetries: number;
  rationale: string;
}

const MAX_TOTAL_ATTEMPTS = 4;

export function buildHealingPlan(trigger: HealingTrigger): HealingPlan {
  const attempts = trigger.previousAttempts;

  if (attempts >= MAX_TOTAL_ATTEMPTS) {
    return {
      strategy: 'escalate',
      segments: trigger.affectedSegments,
      targetPhase: 'validate',
      maxRetries: 0,
      rationale: 'attempts exhausted: ' + attempts,
    };
  }

  switch (trigger.triggerType) {
    case 'validation_failure':
      return {
        strategy: attempts < 2 ? 'refine_parameters' : 'rollback_segment',
        segments: trigger.affectedSegments,
        targetPhase: 'edit',
        refinedParameters: {
          tighten_structural_delta: true,
          tighten_entropy: true,
          tighten_concentration: true,
          attempt: attempts + 1,
        },
        rollbackTargets: attempts >= 2 ? trigger.affectedSegments : undefined,
        maxRetries: MAX_TOTAL_ATTEMPTS - attempts,
        rationale: 'validation failed: ' + trigger.failureDetails,
      };

    case 'collision':
      return {
        strategy: 'rollback_segment',
        segments: trigger.affectedSegments,
        targetPhase: 'edit',
        rollbackTargets: trigger.affectedSegments,
        maxRetries: MAX_TOTAL_ATTEMPTS - attempts,
        rationale: 'collision: ' + trigger.failureDetails,
      };

    case 'structural_anomaly':
      return {
        strategy: 'refine_parameters',
        segments: trigger.affectedSegments,
        targetPhase: 'build',
        refinedParameters: {
          rebuild_affected: true,
          verify_dep_map: true,
          attempt: attempts + 1,
        },
        maxRetries: MAX_TOTAL_ATTEMPTS - attempts,
        rationale: 'structural anomaly: ' + trigger.failureDetails,
      };

    case 'worker_failure':
      return {
        strategy: attempts < 2 ? 'replace_worker' : 'refine_parameters',
        segments: trigger.affectedSegments,
        targetPhase: 'analyze',
        refinedParameters: {
          reassign: true,
          bump_token_budget: 1.2,
          attempt: attempts + 1,
        },
        maxRetries: MAX_TOTAL_ATTEMPTS - attempts,
        rationale: 'worker failed: ' + trigger.failureDetails,
      };
  }
}

export const healingLoops = {
  plan(trigger: HealingTrigger): HealingPlan {
    const plan = buildHealingPlan(trigger);
    eventBus.emit({
      scanId: trigger.scanId, correlationId: trigger.correlationId,
      phase: 'recovery', functionId: 'healing_loops',
      severity: plan.strategy === 'escalate' ? 'critical' : 'warn',
      payload: {
        action: 'healing_planned',
        strategy: plan.strategy,
        triggerType: trigger.triggerType,
        segments: plan.segments.length,
        attempts: trigger.previousAttempts,
        maxRetries: plan.maxRetries,
      },
    });
    return plan;
  },
};
