import { compareTemporal, temporalShifter } from '../temporalShifter';
import { checkContext, contextualChameleon } from '../contextualChameleon';
import { stableHash, selectVariant, variantsFunctionallyEquivalent, dynamicMasking } from '../dynamicMasking';
import { pickRegion, dynamicResourceAllocation } from '../dynamicResourceAllocation';

const scanId = 'smoke7-' + Date.now();
const correlationId = scanId;

// ---------- Temporal Shifter ----------
const tIn = compareTemporal(
  { path: 'classes.dex', region: { start: 0, end: 100 }, estimatedExecutionMs: 50, callDepth: 3, loopIterationEstimate: 10 },
  { path: 'classes.dex', minMs: 40, maxMs: 60, maxDepthDelta: 2 }
);
console.log('temporal in-band (expect none):', tIn.action);

const tAbove = compareTemporal(
  { path: 'classes.dex', region: { start: 0, end: 100 }, estimatedExecutionMs: 500, callDepth: 3, loopIterationEstimate: 10 },
  { path: 'classes.dex', minMs: 40, maxMs: 60, maxDepthDelta: 2 }
);
console.log('temporal far-above (expect flag):', tAbove.action, 'deviation:', tAbove.deviation.toFixed(2));

const tJustAbove = compareTemporal(
  { path: 'x', region: { start: 0, end: 1 }, estimatedExecutionMs: 65, callDepth: 1, loopIterationEstimate: 1 },
  { path: 'x', minMs: 40, maxMs: 60, maxDepthDelta: 2 }
);
console.log('temporal just-above (expect adjust):', tJustAbove.action);

// ---------- Contextual Chameleon ----------
const ctx = {
  packageName: 'com.sandbox.krmobile.engine',
  parentClasses: ['com.sandbox.krmobile.engine.Physics', 'com.sandbox.krmobile.engine.Render'],
  siblingMethods: ['computePhysics()', 'renderFrame()', 'updateState()'],
  calledBy: [],
  calls: [],
  stringConstants: ['physics_enabled', 'render_mode', 'state_idle'],
};

const cv1 = checkContext(
  { changeId: 'c1', targetSegment: 'seg', changeKind: 'add_class', proposedContent: 'com.sandbox.krmobile.engine.NewPhysics' },
  ctx
);
console.log('context aligned (expect consistent):', cv1.consistent, 'violations:', cv1.violations.length);

const cv2 = checkContext(
  { changeId: 'c2', targetSegment: 'seg', changeKind: 'add_class', proposedContent: 'org.evil.NewClass' },
  ctx
);
console.log('context wrong-package (expect !consistent):', cv2.consistent, 'violations:', cv2.violations.map(v => v.type));

const cv3 = checkContext(
  { changeId: 'c3', targetSegment: 'seg', changeKind: 'add_method', proposedContent: 'ComputedResult()' },
  ctx
);
console.log('context method-case (expect violation):', cv3.violations.map(v => v.type));

const cv4 = checkContext(
  { changeId: 'c4', targetSegment: 'seg', changeKind: 'add_string', proposedContent: 'RandomLabelXYZ' },
  ctx
);
console.log('context string-style (expect violation):', cv4.violations.map(v => v.type));

const cc = contextualChameleon.analyze({
  scanId, correlationId,
  changes: [
    { changeId: 'c1', targetSegment: 'seg', changeKind: 'add_class', proposedContent: 'com.sandbox.krmobile.engine.NewPhysics' },
    { changeId: 'c2', targetSegment: 'seg', changeKind: 'add_class', proposedContent: 'org.evil.NewClass' },
  ],
  contexts: { seg: ctx },
});
console.log('chameleon verdicts (expect 1):', cc.verdicts.length, 'rejected:', cc.rejected);

// ---------- Dynamic Masking ----------
const goodVariants = [
  { id: 'v1', representation: 'A', functionalityHash: 'H', validationStatus: 'approved' as const },
  { id: 'v2', representation: 'B', functionalityHash: 'H', validationStatus: 'approved' as const },
  { id: 'v3', representation: 'C', functionalityHash: 'H', validationStatus: 'approved' as const },
];
const badVariants = [
  { id: 'v1', representation: 'A', functionalityHash: 'H', validationStatus: 'approved' as const },
  { id: 'v2', representation: 'B', functionalityHash: 'K', validationStatus: 'approved' as const },
];

console.log('hash deterministic (expect equal):', stableHash('hello') === stableHash('hello'));
console.log('variants equivalent (expect true):', variantsFunctionallyEquivalent(goodVariants));
console.log('variants not-equivalent (expect false):', variantsFunctionallyEquivalent(badVariants));

const s1 = selectVariant(goodVariants, 'seed-1');
const s2 = selectVariant(goodVariants, 'seed-2');
console.log('select v1:', s1 ? s1.id : null, 'select v2:', s2 ? s2.id : null);

const dm = dynamicMasking.apply({
  scanId, correlationId,
  request: { segmentId: 'seg-a', region: { start: 0, end: 1 }, approvedVariants: goodVariants, buildSeed: 'b1' },
});
console.log('masking applied:', dm.validationPassed, 'selected:', dm.selectedVariant?.id);

const dmBad = dynamicMasking.apply({
  scanId, correlationId,
  request: { segmentId: 'seg-b', region: { start: 0, end: 1 }, approvedVariants: badVariants, buildSeed: 'b1' },
});
console.log('masking rejected (expect false):', dmBad.validationPassed);

// ---------- Dynamic Resource Allocation ----------
const candidates = [
  { name: 'assets/extra',      freeBytes: 100000, isCritical: false, distanceFromCore: 0.9 },
  { name: 'classes.dex.tail',  freeBytes: 50000,  isCritical: true,  distanceFromCore: 0.1 },
  { name: 'assets/near',       freeBytes: 200000, isCritical: false, distanceFromCore: 0.4 },
];

const pick = pickRegion(
  { segmentId: 'seg', resourceType: 'logic', estimatedSizeBytes: 20000,
    contextConstraints: { packageName: 'com.sandbox', criticalPathSegments: [] } },
  candidates
);
console.log('pickRegion (expect assets/extra):', pick ? pick.name : null);

const pickTooBig = pickRegion(
  { segmentId: 'seg', resourceType: 'logic', estimatedSizeBytes: 300000,
    contextConstraints: { packageName: 'com.sandbox', criticalPathSegments: [] } },
  candidates
);
console.log('pickRegion too-big (expect null):', pickTooBig);

const dra = dynamicResourceAllocation.plan({
  scanId, correlationId,
  request: { segmentId: 'seg', resourceType: 'logic', estimatedSizeBytes: 20000,
    contextConstraints: { packageName: 'com.sandbox', criticalPathSegments: [] } },
  candidates,
});
console.log('allocation ok:', dra.allocated, 'region:', dra.targetRegion?.name, 'size:', dra.memoryImpact);
