// HTTP logger — captures every backend call so we can see exactly what
// the app sends and receives. In-memory ring buffer + subscribe.
export interface HttpLogEntry {
  id: number;
  ts: number;
  method: string;
  url: string;
  reqPreview: string;
  resStatus: number | null;
  resPreview: string;
  durationMs: number;
  error: string | null;
}

type Listener = (e: HttpLogEntry) => void;

class HttpLog {
  private next = 1;
  private ring: HttpLogEntry[] = [];
  private max = 400;
  private listeners = new Set<Listener>();

  record(e: Omit<HttpLogEntry, 'id' | 'ts'>): HttpLogEntry {
    const entry: HttpLogEntry = { ...e, id: this.next++, ts: Date.now() };
    this.ring.push(entry);
    if (this.ring.length > this.max) this.ring.shift();
    for (const l of this.listeners) {
      try { l(entry); } catch {}
    }
    return entry;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  tail(n = 50): HttpLogEntry[] {
    return this.ring.slice(-n);
  }

  dump(): string {
    return JSON.stringify({
      exportedAt: Date.now(),
      count: this.ring.length,
      entries: this.ring,
    }, null, 2);
  }

  clear(): void {
    this.ring = [];
  }
}

export const httpLog = new HttpLog();

export function preview(s: string, max = 300): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + '…(+' + (s.length - max) + 'B)';
}
