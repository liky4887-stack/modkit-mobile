import { deriveEdgesFromScan } from '../dependencyEdges';
import { validationPhase } from '../validationPhase';
import { feedbackLoops } from '../feedbackLoops';
import { binaryDiffViewer } from '../binaryDiffViewer';

const scanId = 'smoke3-' + Date.now();
const correlationId = scanId;

const fakeScan = {
  dexFiles: [
    { name: 'classes.dex',  classes: ['com.sandbox.krmobile.Main', 'com.sandbox.krmobile.Loader', 'com.sandbox.krmobile.Assets'] },
    { name: 'classes2.dex', classes: ['com.sandbox.krmobile.Main', 'com.tencent.imsdk.Base'] },
  ],
};
const edges = deriveEdgesFromScan(fakeScan);
const loaderRefs = edges.filter(e => e.type === 'loader_ref').length;
const sharedRefs = edges.filter(e => e.type === 'shared_ref').length;
console.log('edges loader_refs (expect 5):', loaderRefs);
console.log('edges shared_refs (expect >=2):', sharedRefs);
console.log('edges total:', edges.length);

const ok = validationPhase.evaluate({
  scanId, correlationId,
  structuralDelta: 0.05, entropyDeviation: 0.02,
  concentrationScore: 0.10, signatureStable: true, ledgerPendingCount: 0,
});
console.log('validation pass (expect promote):', ok.promotionDecision);

const mild = validationPhase.evaluate({
  scanId, correlationId,
  structuralDelta: 0.25, entropyDeviation: 0.05,
  concentrationScore: 0.15, signatureStable: true, ledgerPendingCount: 0,
});
console.log('validation mild (expect remediate):', mild.promotionDecision);

const severe = validationPhase.evaluate({
  scanId, correlationId,
  structuralDelta: 0.45, entropyDeviation: 0.30,
  concentrationScore: 0.55, signatureStable: false, ledgerPendingCount: 3,
});
console.log('validation severe (expect reject):', severe.promotionDecision);

const fb1 = feedbackLoops.process({
  scanId, correlationId, currentPhase: 'validate',
  validation: ok, affectedSegments: ['s1'], priorAttempts: 0,
});
console.log('feedback on pass (expect 0):', fb1.length);

const fb2 = feedbackLoops.process({
  scanId, correlationId, currentPhase: 'validate',
  validation: mild, affectedSegments: ['s1'], priorAttempts: 0,
});
console.log('feedback on mild (expect >=1):', fb2.length);
console.log('feedback target phase:', fb2.map(a => a.targetPhase));

const fb3 = feedbackLoops.process({
  scanId, correlationId, currentPhase: 'validate',
  validation: severe, affectedSegments: ['s1'], priorAttempts: 5,
});
console.log('feedback max attempts rollback (expect true):', fb3[0] ? fb3[0].rollbackRequired : null);

const conc = binaryDiffViewer.computeConcentration(
  [
    { path: 'classes.dex', changeType: 'modify', byteDelta: 100 },
    { path: 'classes.dex', changeType: 'modify', byteDelta: 100 },
    { path: 'lib/x.so',    changeType: 'modify', byteDelta: 20 },
  ],
  220
);
console.log('concentration (expect 0.909):', Number(conc.toFixed(3)));
