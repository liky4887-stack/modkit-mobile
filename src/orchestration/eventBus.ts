import { OrchestrationEvent, Severity, PhaseId, FunctionId } from './types';

type Listener = (e: OrchestrationEvent) => void;

function uuid(): string {
  // RFC4122-ish, sufficient for correlation ids
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class EventBus {
  private ring: OrchestrationEvent[] = [];
  private ringMax = 2000;
  private listeners = new Set<Listener>();

  emit(input: Omit<OrchestrationEvent, 'id' | 'timestamp'>): OrchestrationEvent {
    const e: OrchestrationEvent = {
      ...input,
      id: uuid(),
      timestamp: Date.now(),
    };
    this.ring.push(e);
    if (this.ring.length > this.ringMax) this.ring.shift();
    for (const l of this.listeners) {
      try { l(e); } catch { /* listener fault isolated */ }
    }
    return e;
  }

  since(ts: number): OrchestrationEvent[] {
    return this.ring.filter(e => e.timestamp > ts);
  }

  tail(n = 100): OrchestrationEvent[] {
    return this.ring.slice(-n);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const eventBus = new EventBus();
