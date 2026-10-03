// Pure-logic smoke test. Run via: npx tsx src/orchestration/__tests__/smoke.ts
import { eventBus } from '../eventBus';
import { orchestrationLogs } from '../orchestrationLogs';

const scanId = 'smoke-' + Date.now();

orchestrationLogs.emit({
  scanId, correlationId: scanId, phase: 'import',
  functionId: 'orchestration_logs', severity: 'info',
  payload: { action: 'smoke_start' },
});

orchestrationLogs.emit({
  scanId, correlationId: scanId, phase: 'investigate',
  functionId: 'orchestration_logs', severity: 'info',
  payload: { action: 'scan_segment', component: 'classes.dex', offsets: { start: 0, end: 128 } },
});

const events = eventBus.since(0);
console.log('events:', events.length);
console.log('tail:', eventBus.tail(5).map(e => `${e.phase}/${e.functionId}/${e.payload.action}`));
