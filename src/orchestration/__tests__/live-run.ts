// LIVE end-to-end test of the runner.
// Real backend HTTP. In-memory stubs for SQLite-backed deps.
import { makeRunner, RunnerDeps } from '../orchestrationRunner';
import { makeOrchestrator, noopDeps } from '../centralOrchestrator';

const APK = '/data/data/com.termux/files/home/SANDBOX_v2.apk';
const scanId = 'live-run-' + Date.now();

// In-memory ledger so we can observe state without SQLite.
const ledgerRows: any[] = [];
const edges: any[] = [];
const knowledge: any[] = [];

const stubDeps: RunnerDeps = {
  orchestrator: makeOrchestrator(noopDeps) as any,
  truthLedger: {
    async record(e: any) { const id = 'L' + ledgerRows.length; ledgerRows.push({ id, ...e }); return id; },
    async getByScan(scanId: string) { return ledgerRows.filter(r => r.scanId === scanId); },
    async getBySegment(s: string) { return ledgerRows.filter(r => r.sourceSegment === s); },
    async markValidated() {},
    async rollback() {},
    async detectConflicts() { return []; },
  } as any,
  progressTracker: {
    async upsertSegment() {},
    async updateStatus() {},
    async snapshot() { return { overall: 0, byPhase: {}, bySegment: {}, criticalPath: [], estimatedRemainingMs: 0 }; },
  } as any,
  collisionGuard: {
    async check() { return { action: 'proceed', reason: 'stub' }; },
  } as any,
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
    async checkpoint() {},
    async findOrphans() { return []; },
    async bumpRetry() { return 1; },
    async recoverOrphans() { return []; },
  } as any,
  crossSessionIntelligence: {
    async record(r: any) { knowledge.push(r); return 'k'; },
    async lookup() { return []; },
    async all() { return knowledge; },
  } as any,
};

const runner = makeRunner(stubDeps);

const fakeScan = {
  dexFiles: [
    { name: 'classes.dex', classes: ['com.sandbox.krmobile.Main', 'com.sandbox.krmobile.Loader'] },
  ],
};

(async () => {
  const t0 = Date.now();
  const result = await runner.run({
    scanId,
    apkPath: APK,
    transformedPath: APK,
    phases: ['import', 'investigate', 'validate', 'export'],
    totalTokenBudget: 100000,
    scan: fakeScan,
    segments: [
      { id: 'dex_class:com.sandbox.krmobile.Main', type: 'dex_class', estimatedTokens: 4000, priority: 80, dependencies: [] },
    ],
    workers: [
      { id: 'w1', model: 'deepseek-chat', maxContextTokens: 64000, currentLoad: 0, healthy: true },
    ],
  });
  const ms = Date.now() - t0;

  console.log('LIVE RUN OK in', ms, 'ms');
  console.log('phasesCompleted:', result.phasesCompleted);
  console.log('assignments:', result.assignments.length);
  console.log('diff.summary:', JSON.stringify(result.diff?.summary || null));
  console.log('validation.decision:', result.validation?.promotionDecision);
  console.log('validation.passed:', result.validation?.passed);
  console.log('feedback actions:', result.feedback.length);
  console.log('edges ingested:', edges[0]?.total || 0);
  console.log('ledgerPending:', result.ledgerPending);

  // Record one transformation to exercise the full proof+collision+ledger path
  const rec = await runner.recordTransformation({
    scanId,
    segmentId: 'dex_class:com.sandbox.krmobile.Main',
    phase: 'edit',
    workerId: 'w1',
    safetyScore: 0.9,
    rationale: 'unit test',
    rawResponse: [
      'Adjusted 0x1000 - 0x1040.',
      'before: ' + 'a'.repeat(64),
      'after:  ' + 'b'.repeat(64),
    ].join('\n'),
  });
  console.log('recordTransformation ok:', rec.ok, 'reason:', rec.reason, 'ledgerId:', rec.ledgerId);
  console.log('ledger rows:', ledgerRows.length);
})();
