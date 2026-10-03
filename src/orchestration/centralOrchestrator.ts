import { PhaseId } from './types';
import { eventBus } from './eventBus';
import {
  SegmentDefinition,
  WorkerDefinition,
  selectWorker,
  computeBudget,
} from './workerSelection';

export type { SegmentDefinition, WorkerDefinition };

export interface OrchestrationJob {
  scanId: string;
  correlationId: string;
  totalTokenBudget: number;
  segments: SegmentDefinition[];
  workers: WorkerDefinition[];
}

export interface OrchestrationAssignment {
  segmentId: string;
  workerId: string;
  tokenBudget: number;
  deadlineMs: number;
}

export interface OrchestratorDeps {
  lookupConstraints: (segmentId: string) => Promise<number>;
  upsertSegment: (args: {
    segmentId: string; scanId: string; phase: PhaseId;
    workerId?: string; tokenBudget?: number;
  }) => Promise<void>;
}

export const noopDeps: OrchestratorDeps = {
  lookupConstraints: async () => 0,
  upsertSegment: async () => {},
};

export function makeOrchestrator(deps: OrchestratorDeps) {
  return {
    async orchestrateJob(job: OrchestrationJob): Promise<OrchestrationAssignment[]> {
      const assignments: OrchestrationAssignment[] = [];
      const sorted = [...job.segments].sort((a, b) => b.priority - a.priority);
      let remaining = job.totalTokenBudget;

      for (const seg of sorted) {
        if (remaining <= 0) {
          eventBus.emit({
            scanId: job.scanId, correlationId: job.correlationId,
            phase: 'orchestrator', functionId: 'central_orchestrator',
            severity: 'warn',
            payload: { action: 'budget_exhausted', segmentId: seg.id },
          });
          break;
        }

        const constraintsCount = await deps.lookupConstraints(seg.id);
        const worker = selectWorker(job.workers, seg, remaining);
        if (!worker) {
          eventBus.emit({
            scanId: job.scanId, correlationId: job.correlationId,
            phase: 'orchestrator', functionId: 'central_orchestrator',
            severity: 'warn',
            payload: { action: 'queue_segment', segmentId: seg.id },
          });
          continue;
        }

        const budget = computeBudget(seg, worker, remaining, constraintsCount);
        assignments.push({
          segmentId: seg.id,
          workerId: worker.id,
          tokenBudget: budget,
          deadlineMs: Date.now() + 120000,
        });
        worker.currentLoad += budget;
        remaining -= budget;

        await deps.upsertSegment({
          segmentId: seg.id,
          scanId: job.scanId,
          phase: 'analyze' as PhaseId,
          workerId: worker.id,
          tokenBudget: budget,
        });
      }

      eventBus.emit({
        scanId: job.scanId, correlationId: job.correlationId,
        phase: 'orchestrator', functionId: 'central_orchestrator',
        severity: 'info',
        payload: {
          action: 'job_assigned',
          total: job.segments.length,
          assigned: assignments.length,
          budgetRemaining: remaining,
        },
      });

      return assignments;
    },

    segmentForClass(className: string, estimatedTokens: number): SegmentDefinition {
      return {
        id: 'dex_class:' + className,
        type: 'dex_class',
        estimatedTokens,
        priority: 50,
        dependencies: [],
      };
    },

    segmentForNativeLib(libPath: string, estimatedTokens: number): SegmentDefinition {
      return {
        id: 'native_lib:' + libPath,
        type: 'native_lib',
        estimatedTokens,
        priority: 70,
        dependencies: [],
      };
    },
  };
}

// Default export uses noop deps — pure, importable from anywhere.
export const centralOrchestrator = makeOrchestrator(noopDeps);
