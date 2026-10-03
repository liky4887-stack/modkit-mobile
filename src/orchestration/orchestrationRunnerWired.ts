// Real-module wiring. Import only inside RN runtime.
import { makeRunner, RunnerDeps } from './orchestrationRunner';
import { makeOrchestrator } from './centralOrchestrator';
import { truthLedger } from './truthLedger';
import { progressTracker } from './progressTracker';
import { collisionGuard } from './collisionGuard';
import { dependencyMapper } from './dependencyMapper';
import { stateRecovery } from './stateRecovery';
import { crossSessionIntelligence } from './crossSessionIntelligence';
import { PhaseId } from './types';

const orchestrator = makeOrchestrator({
  lookupConstraints: async (segmentId: string) => {
    const rows = await crossSessionIntelligence.lookup(segmentId);
    return rows.length;
  },
  upsertSegment: async (args: {
    segmentId: string; scanId: string; phase: PhaseId;
    workerId?: string; tokenBudget?: number;
  }) => {
    await progressTracker.upsertSegment(args);
  },
});

export const realDeps: RunnerDeps = {
  truthLedger: truthLedger as any,
  progressTracker: progressTracker as any,
  collisionGuard: collisionGuard as any,
  dependencyMapper: dependencyMapper as any,
  stateRecovery: stateRecovery as any,
  crossSessionIntelligence: crossSessionIntelligence as any,
  orchestrator: orchestrator as any,
};

export const orchestrationRunner = makeRunner(realDeps);
