// Investigate runner — wraps the agent loop for a specific phase/unit,
// persists every step + the final answer so the JOBS tab can replay it.
import { getDb } from '@/db/client';
import { agentLoop, AgentStep } from '@/agent/agentLoop';
import { eventBus } from '@/orchestration/eventBus';
import { deepseekClient } from '@/chat/deepseekClient';
import { pipelineStore } from './pipelineStore';

export interface InvestigateRequest {
  jobId: string;
  phase: 'partition' | 'investigate' | 'coordinate' | 'propose' | 'verify' | 'export';
  query: string;
  unitId?: string | null;
  maxIterations?: number;
  onStep?: (step: AgentStep) => void;
}

export interface InvestigateResult {
  investigationId: string;
  jobId: string;
  phase: string;
  query: string;
  finalAnswer: string;
  toolCallCount: number;
  totalMs: number;
  chatId: string;
  dsSessionId: string | null;
  steps: AgentStep[];
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function persistStep(
  jobId: string,
  investigationId: string,
  phase: string,
  step: AgentStep,
): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO agent_steps
         (job_id, investigation_id, phase, iteration, kind, tool, args_json, result_chars, elapsed_ms, ts)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        jobId, investigationId, phase, step.iteration, step.kind,
        step.tool ?? null,
        step.args ? JSON.stringify(step.args) : null,
        step.resultChars ?? 0,
        step.elapsedMs ?? 0,
        Date.now(),
      ]
    );
  } catch {
    // never throw from a log write
  }
}

export const investigateRunner = {
  async run(req: InvestigateRequest): Promise<InvestigateResult> {
    const scanId = req.jobId;
    const phase = req.phase;

    eventBus.emit({
      scanId, correlationId: scanId, phase: phase as any,
      functionId: 'orchestration_logs', severity: 'info',
      payload: { action: 'investigate_start', query: req.query.slice(0, 120), unitId: req.unitId ?? null },
    });

    // Pre-create investigation id so steps can be persisted as they arrive
    const investigationId = uuid();

    const result = await agentLoop.run({
      jobId: req.jobId,
      query: req.query,
      maxIterations: req.maxIterations ?? 10,
      onStep: (step) => {
        void persistStep(req.jobId, investigationId, phase, step);
        try { req.onStep?.(step); } catch {}
      },
    });

    // Persist the investigation row
    const toolCallCount = result.steps.filter(s => s.kind === 'tool').length;
    try {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO finding_investigations
           (id, job_id, unit_id, phase, query, final_answer,
            tool_call_count, total_ms, chat_id, ds_session_id, steps_json, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          investigationId,
          req.jobId,
          req.unitId ?? null,
          phase,
          req.query,
          result.final,
          toolCallCount,
          result.totalMs,
          result.chatId,
          result.dsSessionId,
          JSON.stringify(result.steps.map(s => ({
            i: s.iteration, k: s.kind, t: s.tool ?? null,
            rc: s.resultChars ?? 0, ms: s.elapsedMs ?? 0,
          }))),
          Date.now(),
        ]
      );
    } catch (e) {
      eventBus.emit({
        scanId, correlationId: scanId, phase: phase as any,
        functionId: 'orchestration_logs', severity: 'warn',
        payload: { action: 'investigate_persist_failed', error: String(e) },
      });
    }

    // Bump ds_calls on the job so the JOBS tab shows real activity
    try {
      await pipelineStore.bumpDs(req.jobId, {
        calls: 1,
        elapsedMs: result.totalMs,
        tokens: 0,
        sessionId: result.dsSessionId,
      });
    } catch {}

    // Close the chat so it doesn't linger as [open] in the CHATS tab
    try {
      await deepseekClient.close(result.chatId);
    } catch {}

    eventBus.emit({
      scanId, correlationId: scanId, phase: phase as any,
      functionId: 'orchestration_logs', severity: 'info',
      payload: {
        action: 'investigate_done',
        investigationId,
        toolCalls: toolCallCount,
        totalMs: result.totalMs,
      },
    });

    return {
      investigationId,
      jobId: req.jobId,
      phase,
      query: req.query,
      finalAnswer: result.final,
      toolCallCount,
      totalMs: result.totalMs,
      chatId: result.chatId,
      dsSessionId: result.dsSessionId,
      steps: result.steps,
    };
  },

  // List investigations for a job (for the JOBS tab)
  async listByJob(jobId: string, limit = 50): Promise<any[]> {
    const db = await getDb();
    return db.getAllAsync<any>(
      `SELECT id, unit_id, phase, query, tool_call_count, total_ms, created_at,
              substr(final_answer, 1, 200) AS answer_preview
         FROM finding_investigations
         WHERE job_id = ?
         ORDER BY created_at DESC LIMIT ?`,
      [jobId, limit]
    );
  },

  // List steps for one investigation
  async listSteps(investigationId: string, limit = 200): Promise<any[]> {
    const db = await getDb();
    return db.getAllAsync<any>(
      `SELECT iteration, kind, tool, result_chars, elapsed_ms, ts
         FROM agent_steps
         WHERE investigation_id = ?
         ORDER BY iteration ASC LIMIT ?`,
      [investigationId, limit]
    );
  },
};
