// [SHΔDØW CORE] Real-time Pipeline Telemetry Bridge
import { EventEmitter } from "events";

class PipelineTelemetryEmitter extends EventEmitter {
  private static instance: PipelineTelemetryEmitter;
  
  private constructor() {
    super();
  }

  public static getInstance(): PipelineTelemetryEmitter {
    if (!PipelineTelemetryEmitter.instance) {
      PipelineTelemetryEmitter.instance = new PipelineTelemetryEmitter();
    }
    return PipelineTelemetryEmitter.instance;
  }

  public broadcast(phase: number, moduleName: string, status: string, metrics: any = {}) {
    const telemetryEvent = {
      timestamp: new Date().toISOString(),
      phase,
      moduleName,
      status,
      metrics
    };
    this.emit("telemetry_tick", telemetryEvent);
  }
}

export const telemetryBridge = PipelineTelemetryEmitter.getInstance();
