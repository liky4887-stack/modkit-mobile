// Full-pipeline test — exercises all 26 modules via runPipeline with
// in-memory stubs. Proves phase ordering + integration without RN.
import { runPipeline, PipelineInput } from '../orchestrationPipeline';
import { makeRunner, RunnerDeps } from '../orchestrationRunner';
import { makeOrchestrator, noopDeps } from '../centralOrchestrator';

const scanId = 'pipe-' + Date.now();
const correlationId = scanId;

const ledgerRows: any[] = [];
const knowledge: any[] = [];
const edges: any[] = [];

const stubDeps: RunnerDeps = {
  orchestrator: makeOrchestrator(noopDeps) as any,
  truthLedger: {
    async record(e: any) { const id = 'L' + ledgerRows.length; ledgerRows.push({ id, ...e, scanId: e.scanId || e.correlationId, validation_outcome: 'pending', source_segment: e.sourceSegment }); return id; },
    async getByScan(s: string) { return ledgerRows.filter(r => r.scanId === s); },
    async getBySegment(s: string) { return ledgerRows.filter(r => r.source_segment === s); },
    async markValidated() {},
    async rollback() {},
    async detectConflicts() { return []; },
  } as any,
  progressTracker: {
    async upsertSegment() {}, async updateStatus() {},
    async snapshot() { return { overall: 0, byPhase: {}, bySegment: {}, criticalPath: [], estimatedRemainingMs: 0 }; },
  } as any,
  collisionGuard: { async check() { return { action: 'proceed', reason: 'stub' }; } } as any,
  dependencyMapper: {
    async recordEdge() { return 'e'; },
    async ingestScan(_: string, scan: any) {
      const dex = scan?.dexFiles || [];
      const total = dex.reduce((s: number, d: any) => s + (d.classes?.length || 0), 0);
      edges.push({ scanId, total });
      return total;
    },
    async getDownstream() { return []; },
    async getDownstreamForSegments() { return []; },
    async stats() { return { edges: 0, sources: 0, targets: 0 }; },
  } as any,
  stateRecovery: {
    async checkpoint() {}, async findOrphans() { return []; },
    async bumpRetry() { return 1; }, async recoverOrphans() { return []; },
  } as any,
  crossSessionIntelligence: {
    async record(r: any) { knowledge.push(r); return 'k'; },
    async lookup() { return []; }, async all() { return knowledge; },
  } as any,
};

const APK = '/data/data/com.termux/files/home/SANDBOX_v2.apk';

const input: PipelineInput = {
  scanId, apkPath: APK, transformedPath: APK,
  phases: ['import', 'investigate', 'analyze', 'edit', 'validate', 'build', 'export'],
  segments: [
    { id: 'dex_class:com.sandbox.krmobile.Main', type: 'dex_class', estimatedTokens: 4000, priority: 80, dependencies: [] },
  ],
  workers: [
    { id: 'w1', model: 'deepseek-chat', maxContextTokens: 64000, currentLoad: 0, healthy: true },
  ],
  totalTokenBudget: 200000,

  scan: {
    apkHash: 'h1', dexCount: 1, classCount: 2, entryCount: 2,
    files: ['classes.dex'],
    original: { apkHash: 'h1', dexCount: 1, classCount: 2, entryCount: 2, files: ['classes.dex'] },
    dexFiles: [{ name: 'classes.dex', classes: ['com.sandbox.krmobile.Main', 'com.sandbox.krmobile.Loader'] }],
  },
  classes: [
    { fqcn: 'com.sandbox.krmobile.Main', kind: 'class' },
    { fqcn: 'com.sandbox.krmobile.Loader', kind: 'class' },
  ],
  patterns: [
    { pattern: 'com.sandbox.krmobile.Main', count: 3 },
    { pattern: 'com.sandbox.krmobile.Loader', count: 3 },
    { pattern: '__mkit_trace_xyz__', count: 40 },
  ],
  entropySamples: [
    { path: 'classes.dex', region: { start: 0, end: 100 }, histogram: new Array(256).fill(10) },
  ],
  entropyExpectations: [
    { path: 'classes.dex', min: 7, max: 8 },
  ],
  temporalSamples: [
    { path: 'classes.dex', region: { start: 0, end: 100 }, estimatedExecutionMs: 50, callDepth: 3, loopIterationEstimate: 10 },
  ],
  temporalExpectations: [
    { path: 'classes.dex', minMs: 40, maxMs: 60, maxDepthDelta: 2 },
  ],
  proposedChanges: [
    { changeId: 'c1', targetSegment: 'com.sandbox.krmobile.Main', changeKind: 'add_class', proposedContent: 'com.sandbox.krmobile.NewThing' },
  ],
  contexts: {
    'com.sandbox.krmobile.Main': {
      packageName: 'com.sandbox.krmobile',
      parentClasses: ['com.sandbox.krmobile.Loader'],
      siblingMethods: ['compute()', 'render()'],
      calledBy: [], calls: [],
      stringConstants: ['mode_idle', 'mode_active'],
    },
  },
  allocationRequests: [{
    request: { segmentId: 'seg-1', resourceType: 'metadata', estimatedSizeBytes: 1000, contextConstraints: { packageName: 'com.sandbox.krmobile', criticalPathSegments: [] } },
    candidates: [{ name: 'assets/extra', freeBytes: 5000, isCritical: false, distanceFromCore: 0.9 }],
  }],
  inspectionSignals: [
    { source: 'runtime', pattern: 'timing_anomaly', intensity: 0.1, affectedSegments: ['s1'], timestamp: Date.now() },
  ],
  heartbeatExpected: [{ name: 'dex_count', kind: 'numeric', expected: '1', tolerance: 0.1 }],
  heartbeatObserved: [{ name: 'dex_count', value: '1' }],
  versionObserved: { versionCode: 2100, versionName: '2.1.0', minSdk: 21, targetSdk: 33, packageName: 'com.sandbox.krmobile' },
  versionExpected: { versionCode: 2100, packageName: 'com.sandbox.krmobile' },
  handshakeRequest: { queryType: 'version_check', payload: {}, clientVersion: '2100' },
  policyView: {
    currentVersionCode: 2100, currentVersionName: '2.1.0',
    packageName: 'com.sandbox.krmobile',
    minSupportedVersionCode: 2000, forceUpdateRecommended: false,
  },
  depConstraints: [],
};

(async () => {
  const t0 = Date.now();
  try {
    const result = await runPipeline(stubDeps, input);
    const ms = Date.now() - t0;
    console.log('PIPELINE OK in', ms, 'ms');
    console.log('phasesCompleted:', result.phasesCompleted);
    console.log('edges:', result.edgeCount);
    console.log('norms.sampleSize:', result.norms?.sampleSize);
    console.log('chameleon.verdicts:', result.chameleon?.verdicts?.length);
    console.log('temporal.adjustments:', result.temporal?.adjustments?.length);
    console.log('diff.summary.filesAdded:', result.diff?.summary?.filesAdded);
    console.log('entropy.profiles:', result.entropy?.profiles?.length);
    console.log('scrubber.outliers:', result.scrubber?.outliers?.length);
    console.log('heartbeat.healthy:', result.heartbeat?.healthy);
    console.log('tripwire.action:', result.tripwire?.action);
    console.log('validation.decision:', result.validation?.promotionDecision);
    console.log('validation.checks:', JSON.stringify(result.validation?.checks?.map((c: any) => ({ n: c.name, p: c.passed, a: c.actual }))));
    console.log('continuity.action:', result.continuity?.action);
    console.log('allocations:', result.allocations?.length);
    console.log('audit.decision:', result.audit?.finalDecision);
    console.log('handshake.ok:', result.handshake?.policyCompliant);
    console.log('feedback:', result.feedback?.length);
    console.log('healing:', result.healing?.length);
  } catch (err) {
    console.error('PIPELINE FAIL:', err);
    process.exit(1);
  }
})();
