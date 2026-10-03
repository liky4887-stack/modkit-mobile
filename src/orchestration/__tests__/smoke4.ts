import { auditAssembly } from '../finalAssemblyAudit';
import { buildHealingPlan } from '../healingLoops';
import { classifySignals, decideResponse, antiAnalysisTripwire } from '../antiAnalysisTripwire';
import { compareMetrics, integrityHeartbeat } from '../integrityHeartbeat';

const scanId = 'smoke4-' + Date.now();
const correlationId = scanId;

// ---------- Final Assembly Audit ----------
const cleanAudit = auditAssembly({
  scanId, correlationId,
  original: { apkHash: 'a', dexCount: 3, classCount: 100, entryCount: 50, classes: ['A','B','C'], files: ['classes.dex'] },
  rebuilt:  { apkHash: 'a', dexCount: 3, classCount: 100, entryCount: 50, classes: ['A','B','C'], files: ['classes.dex'] },
  ledgerEntries: [{ sourceSegment: 'A', validationOutcome: 'passed' }],
  depConstraints: [],
});
console.log('audit clean (expect accept/true):', cleanAudit.finalDecision, cleanAudit.passed);

const dirtyAudit = auditAssembly({
  scanId, correlationId,
  original: { apkHash: 'a', dexCount: 3, classCount: 100, entryCount: 50, classes: ['A','B','C'], files: ['classes.dex'] },
  rebuilt:  { apkHash: 'b', dexCount: 4, classCount: 120, entryCount: 52, classes: ['A','B','C','D','E','F','G','H','I','J','K'], files: ['classes.dex', '__modkit_trace.bin'] },
  ledgerEntries: [{ sourceSegment: 'A', validationOutcome: 'pending' }],
  depConstraints: [],
});
console.log('audit dirty (expect reject):', dirtyAudit.finalDecision);
console.log('audit dirty finding kinds:', dirtyAudit.findings.map(f => f.kind).sort());

// ---------- Healing Loops ----------
const p1 = buildHealingPlan({
  scanId, correlationId, triggerType: 'validation_failure',
  affectedSegments: ['s1'], failureDetails: 'structural delta', previousAttempts: 0,
});
console.log('healing v-fail attempt0 (expect refine_parameters):', p1.strategy, 'target:', p1.targetPhase);

const p2 = buildHealingPlan({
  scanId, correlationId, triggerType: 'validation_failure',
  affectedSegments: ['s1'], failureDetails: 'still failing', previousAttempts: 2,
});
console.log('healing v-fail attempt2 (expect rollback_segment):', p2.strategy);

const p3 = buildHealingPlan({
  scanId, correlationId, triggerType: 'worker_failure',
  affectedSegments: ['s1'], failureDetails: 'timeout', previousAttempts: 5,
});
console.log('healing exhausted (expect escalate):', p3.strategy, 'maxRetries:', p3.maxRetries);

// ---------- Anti-Analysis Tripwire ----------
const sigLow = [{ source: 'runtime' as const, pattern: 'timing_anomaly' as const, intensity: 0.1, affectedSegments: ['s1'], timestamp: Date.now() }];
const sigHigh = [
  { source: 'backend' as const, pattern: 'deep_scan' as const, intensity: 0.9, affectedSegments: ['s1','s2'], timestamp: Date.now() },
  { source: 'network' as const, pattern: 'rapid_queries' as const, intensity: 0.7, affectedSegments: ['s3'], timestamp: Date.now() },
];
const sigMid = [
  { source: 'runtime' as const, pattern: 'dynamic_probe' as const, intensity: 0.5, affectedSegments: ['s1'], timestamp: Date.now() },
];

console.log('tripwire low (expect monitor):', decideResponse(classifySignals(sigLow).intensity));
console.log('tripwire mid (expect adjust_surface):', decideResponse(classifySignals(sigMid).intensity));
console.log('tripwire high (expect log_escalate):', decideResponse(classifySignals(sigHigh).intensity));

const trip = antiAnalysisTripwire.process({ scanId, correlationId, signals: sigMid });
console.log('tripwire process mid action:', trip.action, 'adjustments:', trip.adjustments.length);

// ---------- Integrity Heartbeat ----------
const hb = compareMetrics(
  [
    { name: 'dex_count', kind: 'numeric', expected: '3', tolerance: 0.1 },
    { name: 'apk_hash', kind: 'string', expected: 'deadbeef', tolerance: 0 },
  ],
  [
    { name: 'dex_count', value: '3' },
    { name: 'apk_hash', value: 'deadbeef' },
  ]
);
console.log('heartbeat healthy (expect true):', hb.healthy);

const hbDiv = compareMetrics(
  [
    { name: 'dex_count', kind: 'numeric', expected: '3', tolerance: 0.1 },
    { name: 'apk_hash', kind: 'string', expected: 'deadbeef', tolerance: 0 },
  ],
  [
    { name: 'dex_count', value: '5' },
    { name: 'apk_hash', value: 'cafebabe' },
  ]
);
console.log('heartbeat divergences (expect 2):', hbDiv.divergences.length);
console.log('heartbeat severities:', hbDiv.divergences.map(d => d.severity).sort());

const hbMissing = compareMetrics(
  [{ name: 'x', kind: 'string', expected: 'a', tolerance: 0 }],
  []
);
console.log('heartbeat missing (expect 1 high):', hbMissing.divergences.length, hbMissing.divergences[0].severity);

const tick = integrityHeartbeat.tick({
  scanId, correlationId,
  expected: [{ name: 'dex_count', kind: 'numeric', expected: '3', tolerance: 0.1 }],
  observed: [{ name: 'dex_count', value: '3' }],
});
console.log('heartbeat tick healthy (expect true):', tick.healthy);
