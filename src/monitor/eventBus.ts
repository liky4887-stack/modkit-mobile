// Inline event bus. Replaces the orchestration/eventBus module the
// LLM-era pipeline used. Same tiny pub/sub surface; nothing depends on
// the old module's DB side effects.

type Handler = (event: any) => void;

class EventBus {
  private handlers: Set<Handler> = new Set();

  subscribe(fn: Handler): () => void {
    this.handlers.add(fn);
    return () => { this.handlers.delete(fn); };
  }

  emit(event: any): void {
    for (const h of this.handlers) {
      try { h(event); } catch { /* never crash the emitter */ }
    }
  }
}

export const eventBus = new EventBus();
