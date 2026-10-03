// LAB-ONLY: Reversible kernel signal masking for sensitivity testing.

import { telemetryBus } from '../../telemetry/bus';

export interface KernelSignal {
  type: 'syscall' | 'module_list' | 'memory_map';
  payload: unknown;
  original: unknown;
}

export class KernelSignalMasker {
  private auditLog: KernelSignal[] = [];
  private experimentId: string;

  constructor(experimentId: string) {
    this.experimentId = experimentId;
  }

  maskSignal(signal: KernelSignal, strategy: 'hide' | 'reshape'): KernelSignal {
    this.auditLog.push({ ...signal });
    const masked: KernelSignal = { ...signal };
    if (strategy === 'hide') {
      masked.payload = null;
    } else {
      masked.payload = this.injectControlledNoise(signal.payload);
    }

    telemetryBus.emit({
      layer: 'kernel',
      timestamp: Date.now(),
      eventType: 'signal_masked',
      payload: { signalType: signal.type, strategy },
      groundTruthLabel: 'anomalous',
      experimentId: this.experimentId,
    });

    return masked;
  }

  revertAll(): void {
    this.auditLog = [];
  }

  private injectControlledNoise(payload: unknown): unknown {
    return { ...(payload as object), noise: Math.random() * 0.01 };
  }
}
