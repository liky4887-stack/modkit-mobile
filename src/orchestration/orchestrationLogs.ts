import { eventBus } from './eventBus';
import { PhaseId, FunctionId, Severity } from './types';

export interface LogPayload {
  action: string;
  component?: string;
  offsets?: { start: number; end: number };
  durationMs?: number;
  tokenCount?: number;
  result?: unknown;
  [k: string]: unknown;
}

export const orchestrationLogs = {
  emit(args: {
    scanId: string;
    correlationId: string;
    phase: PhaseId;
    functionId: FunctionId;
    severity: Severity;
    payload: LogPayload;
  }) {
    return eventBus.emit({
      scanId: args.scanId,
      correlationId: args.correlationId,
      phase: args.phase,
      functionId: args.functionId,
      severity: args.severity,
      payload: args.payload,
    });
  },

  since(ts: number) { return eventBus.since(ts); },
  tail(n?: number)   { return eventBus.tail(n); },
  subscribe(fn: (e: unknown) => void) { return eventBus.subscribe(fn as any); },
};
