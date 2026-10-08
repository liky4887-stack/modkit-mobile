import { shannonEntropy, profile, compareToExpectation, entropyBalancer } from '../entropyBalancer';
import { computeBaseline, findOutliers, looksSynthetic, suggestNormalization, signatureScrubber } from '../signatureScrubber';
import { learnNorms, scoreChange, heuristicMimicry } from '../heuristicMimicry';

const scanId = 'smoke5-' + Date.now();
const correlationId = scanId;

// ---------- Entropy Balancer ----------
// Uniform histogram: entropy = log2(256) = 8.
const uniform = new Array(256).fill(10);
// Skewed: all mass in bin 0 -> entropy = 0.
const skewed = new Array(256).fill(0); skewed[0] = 2560;

console.log('entropy uniform (expect 8):', Number(shannonEntropy(uniform).toFixed(4)));
console.log('entropy skewed (expect 0):', Number(shannonEntropy(skewed).toFixed(4)));

const p1 = profile({ path: 'classes.dex', region: { start: 0, end: 100 }, histogram: uniform });
console.log('profile uniform byteCount (expect 2560):', p1.byteCount);

const a1 = compareToExpectation(p1, { path: 'classes.dex', min: 7, max: 8 });
console.log('compare in-band (expect none):', a1.action);

const a2 = compareToExpectation(p1, { path: 'classes.dex', min: 4, max: 5 });
console.log('compare above (expect flag or adjust):', a2.action, 'deviation:', Number(a2.deviation.toFixed(2)));

// ---------- Signature Scrubber ----------
const stats = [
  { pattern: 'com.sandbox.krmobile.Main', count: 5 },
  { pattern: 'com.sandbox.krmobile.Loader', count: 4 },
  { pattern: 'com.sandbox.krmobile.Assets', count: 6 },
  { pattern: 'com.sandbox.krmobile.Utils', count: 4 },
  { pattern: 'com.sandbox.krmobile.Foo', count: 3 },
  { pattern: '__mkit_trace_v9_20241003__', count: 40 },
];
const baseline = computeBaseline(stats);
console.log('baseline mean (small):', Number(baseline.mean.toFixed(2)));
const outliers = findOutliers(stats, baseline, 1.5);
console.log('outliers count (expect >=1):', outliers.length);
console.log('outlier pattern:', outliers[0] ? outliers[0].pattern : null);

console.log('looksSynthetic __mkit (expect true):', looksSynthetic('__mkit_trace_v9_20241003__'));
console.log('looksSynthetic sandbox main (expect false):', looksSynthetic('com.sandbox.krmobile.Main'));

const sug = suggestNormalization(
  { pattern: '__mkit_trace_v9_20241003__', count: 40, zScore: 3.5, suspicion: 0.9, reason: 'z=3.5' },
  ['com.sandbox.krmobile.Main']
);
console.log('suggestion action:', sug ? sug.suggestion : null);

const scrub = signatureScrubber.analyze({
  scanId, correlationId,
  stats,
  projectNorms: ['com.sandbox.krmobile.Main', 'com.sandbox.krmobile.Loader'],
  zThreshold: 1.5,
});
console.log('scrubber outliers/suggestions:', scrub.outliers.length, scrub.suggestions.length);

// ---------- Heuristic Mimicry ----------
const classes = [
  { fqcn: 'com.sandbox.krmobile.Main',     kind: 'class' as const },
  { fqcn: 'com.sandbox.krmobile.Loader',   kind: 'class' as const },
  { fqcn: 'com.sandbox.krmobile.Assets',   kind: 'class' as const },
  { fqcn: 'com.sandbox.krmobile.Utils',    kind: 'class' as const },
  { fqcn: 'com.sandbox.krmobile.engine.Physics', kind: 'class' as const },
  { fqcn: 'com.sandbox.krmobile.engine.Render',  kind: 'class' as const },
];
const norms = learnNorms(classes);
console.log('norms case (expect pascal):', norms.lastSegmentCase);
console.log('norms sampleSize (expect 6):', norms.sampleSize);
console.log('norms top packages:', norms.topPackages);

const alignedScore = scoreChange('c1', 'com.sandbox.krmobile.NewThing', norms);
console.log('aligned score (expect high):', alignedScore.consistency.toFixed(2));

const badScore = scoreChange('c2', 'org.evil.__modkit_trace__', norms);
console.log('misaligned violations (expect >=1):', badScore.violations.length);
console.log('misaligned consistency (expect low):', badScore.consistency.toFixed(2));

const mimic = heuristicMimicry.analyze({
  scanId, correlationId,
  classes,
  proposedChanges: [
    { changeId: 'c1', proposedFqcn: 'com.sandbox.krmobile.NewThing' },
    { changeId: 'c2', proposedFqcn: 'org.evil.__modkit_trace__' },
  ],
});
console.log('mimicry aligned/misaligned:', mimic.scores.filter(s => s.consistency >= 0.8).length, 'vs', mimic.scores.filter(s => s.consistency < 0.8).length);
