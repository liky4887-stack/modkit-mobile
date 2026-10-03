import { strictExecutionProof } from '../strictExecutionProof';
import { selectWorker, computeBudget } from '../workerSelection';

const scanId = 'smoke2-' + Date.now();
const correlationId = scanId;

const good = strictExecutionProof.validate({
  scanId, correlationId, segmentId: 'seg-a', phase: 'edit',
  rawResponse: [
    'Offset range 0x1000 - 0x1040 modified.',
    'before: ' + 'a'.repeat(64),
    'after:  ' + 'b'.repeat(64),
    'rationale: normalize',
  ].join('\n'),
});
const bad = strictExecutionProof.validate({
  scanId, correlationId, segmentId: 'seg-b', phase: 'edit',
  rawResponse: 'Success. Change applied.',
});
const same = strictExecutionProof.validate({
  scanId, correlationId, segmentId: 'seg-c', phase: 'edit',
  rawResponse: [
    'Offset range 0x2000 - 0x2040 modified.',
    'before: ' + 'c'.repeat(64),
    'after:  ' + 'c'.repeat(64),
  ].join('\n'),
});

console.log('proof.valid (expect true):', good.valid);
console.log('proof.byteCount (expect 64):', good.evidence?.byteCount);
console.log('proof.reject (expect no_offset_evidence):', bad.rejectionReason);
console.log('proof.reject (expect checksums_identical):', same.rejectionReason);

const workers = [
  { id: 'w1', model: 'deepseek-chat',     maxContextTokens: 64000,  currentLoad: 0,     healthy: true  },
  { id: 'w2', model: 'deepseek-reasoner', maxContextTokens: 128000, currentLoad: 10000, healthy: true  },
  { id: 'w3', model: 'kimi',              maxContextTokens: 32000,  currentLoad: 0,     healthy: false },
];
const segSmall = { id: 's1', type: 'dex_class' as const,  estimatedTokens: 5000,  priority: 90, dependencies: [] };
const segBig   = { id: 's2', type: 'native_lib' as const, estimatedTokens: 20000, priority: 70, dependencies: [] };

console.log('worker for small seg (expect w2):', selectWorker(workers, segSmall, 100000)?.id);
console.log('worker for big seg   (expect w2):', selectWorker(workers, segBig,   100000)?.id);

const unhealthyOnly = [{ id: 'w3', model: 'kimi', maxContextTokens: 32000, currentLoad: 0, healthy: false }];
console.log('worker when only unhealthy (expect null):', selectWorker(unhealthyOnly, segSmall, 100000));

console.log('budget no-constraint (expect 24000):',   computeBudget(segBig, workers[1], 100000, 0));
console.log('budget with-constraint (expect 27600):', computeBudget(segBig, workers[1], 100000, 1));
