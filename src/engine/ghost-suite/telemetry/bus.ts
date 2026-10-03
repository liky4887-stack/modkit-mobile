// LAB-ONLY: Shared telemetry bus for the Defensive Ghost Analysis Suite.

export type GhostLayer = 'hardware' | 'kernel' | 'identity' | 'integrity';

export interface GhostEvent {
  layer: GhostLayer;
  timestamp: number;
  eventType: string;
  payload: Record<string, unknown>;
  groundTruthLabel: 'benign' | 'anomalous';
  experimentId: string;
}

class TelemetryBus {
  private events: GhostEvent[] = [];

  emit(event: GhostEvent): void {
    this.events.push(event);
  }

  getEvents(layer?: GhostLayer): GhostEvent[] {
    return layer ? this.events.filter((e) => e.layer === layer) : this.events;
  }

  reset(): void {
    this.events = [];
  }
}

export const telemetryBus = new TelemetryBus();
