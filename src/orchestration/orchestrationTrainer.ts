// Orchestration Trainer — the wired entry point that drives all 26
// modules through the patch pathway. Loads real SQLite-backed deps and
// runs the pipeline. Import this only inside the RN runtime.
import { runPipeline, PipelineInput, PipelineResult } from './orchestrationPipeline';
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

const runner = makeRunner(realDeps);

// High-level: run the full patch pathway with all modules.
export interface TrainerInput extends PipelineInput {}

export interface TrainerResult extends PipelineResult {
  runnerResult?: any;   // includes assignments + ledger view
  recordedLedgerId?: string;
}

export const orchestrationTrainer = {
  // Full pipeline across all phases
  async train(input: TrainerInput): Promise<TrainerResult> {
    // 1. orchestrate segments (assigns workers, tracks token budgets)
    const runResult = await runner.run({
      scanId: input.scanId,
      apkPath: input.apkPath,
      transformedPath: input.transformedPath,
      phases: input.phases,
      segments: input.segments,
      workers: input.workers,
      totalTokenBudget: input.totalTokenBudget,
      scan: input.scan,
    });

    // 2. full pipeline with all 26 modules
    const pipelineResult = await runPipeline(realDeps, input);

    return {
      ...pipelineResult,
      runnerResult: runResult,
    };
  },

  // Record one transformation through the full proof → collision → ledger path
  async recordTransformation(args: {
    scanId: string;
    segmentId: string;
    phase: PhaseId;
    workerId: string;
    safetyScore: number;
    rawResponse: string;
    claimedOffsets?: { start: number; end: number }[];
    beforeHash?: string;
    afterHash?: string;
    rationale: string;
  }) {
    return runner.recordTransformation(args);
  },

  // Access the ledger directly (for the patch screen to display)
  async getLedger(scanId: string) {
    return truthLedger.getByScan(scanId);
  },

  async getProgress(scanId: string) {
    return progressTracker.snapshot(scanId);
  },

  async getConflicts(scanId: string) {
    return truthLedger.detectConflicts(scanId);
  },
};
