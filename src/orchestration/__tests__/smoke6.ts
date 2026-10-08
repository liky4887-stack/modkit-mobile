import { evaluateContinuity, versionContinuityGuard } from '../versionContinuityGuard';
import { fakeUpdateHandshake } from '../fakeUpdateHandshake';
import { computeDelta, remapEntry, migrateLedger, autoMigration } from '../autoMigration';

const scanId = 'smoke6-' + Date.now();
const correlationId = scanId;

// ---------- Version Continuity Guard ----------
const observed = {
  versionCode: 2100, versionName: '2.1.0',
  minSdk: 21, targetSdk: 33,
  packageName: 'com.sandbox.krmobile',
};

const perfect = evaluateContinuity(observed, {
  versionCode: 2100, versionName: '2.1.0', minSdk: 21, targetSdk: 33,
  packageName: 'com.sandbox.krmobile',
});
console.log('continuity perfect (expect none/true):', perfect.action, perfect.consistent, 'score:', perfect.score);

const mild = evaluateContinuity(observed, {
  versionCode: 2200, versionName: '2.2.0',
  packageName: 'com.sandbox.krmobile',
});
console.log('continuity mild (expect adjust_metadata):', mild.action, 'score:', Number(mild.score.toFixed(2)));
console.log('continuity mild severities:', mild.discrepancies.map(d => d.severity));

const severe = evaluateContinuity(observed, { packageName: 'com.evil.fake' });
console.log('continuity severe (expect flag_review):', severe.action);

const check = versionContinuityGuard.check({
  scanId, correlationId, observed,
  expected: { versionCode: 2100, packageName: 'com.sandbox.krmobile' },
});
console.log('continuity wrapper (expect none):', check.action);

// ---------- Fake Update Handshake ----------
const view = {
  currentVersionCode: 2100, currentVersionName: '2.1.0',
  packageName: 'com.sandbox.krmobile',
  minSupportedVersionCode: 2000,
  forceUpdateRecommended: false,
};

const h1 = fakeUpdateHandshake.handle({
  scanId, correlationId,
  request: { queryType: 'version_check', payload: {}, clientVersion: '2100' },
  view,
});
console.log('handshake version_check (expect ok):', h1.policyCompliant, 'resp:', JSON.stringify(h1.response));

const h2 = fakeUpdateHandshake.handle({
  scanId, correlationId,
  request: { queryType: 'update_available', payload: {}, clientVersion: '2000' },
  view,
});
console.log('handshake update_available for old client (expect true):', h2.response.updateAvailable);

const h3 = fakeUpdateHandshake.handle({
  scanId, correlationId,
  request: { queryType: 'compatibility_check', payload: {}, clientVersion: '1900' },
  view,
});
console.log('handshake compat old (expect supported false):', h3.response.supported);

const h4 = fakeUpdateHandshake.handle({
  scanId, correlationId,
  request: { queryType: 'version_check', payload: {}, clientVersion: '2100' },
  view: { ...view, minSupportedVersionCode: 3000 },   // inconsistent policy
});
console.log('handshake bad policy (expect false):', h4.policyCompliant);

// ---------- Auto Migration ----------
const oldClasses = ['com.sandbox.krmobile.Main', 'com.sandbox.krmobile.Loader', 'com.sandbox.krmobile.Assets', 'com.sandbox.krmobile.engine.Physics'];
const newClasses = ['com.sandbox.krmobile.Main', 'com.sandbox.krmobile.Loader', 'com.sandbox.krmobile.Assets', 'com.sandbox.krmobile.engine.Render'];

const delta = computeDelta(oldClasses, newClasses);
console.log('delta added:', delta.classesAdded.length, 'removed:', delta.classesRemoved.length, 'common:', delta.classesCommon.length);

const priorLedger = [
  { id: 'L1', sourceSegment: 'com.sandbox.krmobile.Main', targetOffsets: [{ start: 0x1000, end: 0x1040 }], rationale: 'a', validationOutcome: 'passed', beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64) },
  { id: 'L2', sourceSegment: 'com.sandbox.krmobile.engine.Physics', targetOffsets: [{ start: 0x5000, end: 0x5040 }], rationale: 'b', validationOutcome: 'passed', beforeHash: 'c'.repeat(64), afterHash: 'd'.repeat(64) },
  { id: 'L3', sourceSegment: 'com.sandbox.krmobile.Loader', targetOffsets: [{ start: 0x2000, end: 0x2020 }], rationale: 'c', validationOutcome: 'pending', beforeHash: 'e'.repeat(64), afterHash: 'f'.repeat(64) },
];

const migration = migrateLedger(priorLedger, { ...delta, classOffsetShift: { 'com.sandbox.krmobile.Main': 0x100 } });
console.log('migration successful (expect 1):', migration.successful.length);
console.log('migration failed (expect 2):', migration.failed.length);
console.log('migration first failure reason:', migration.failed[0]?.reason);
console.log('migration rate (expect 0.333):', Number(migration.migrationRate.toFixed(3)));
console.log('migration shifted offset (expect 0x1100):', migration.successful[0]?.targetOffsets[0].start.toString(16));

const plan = autoMigration.plan({
  scanId, correlationId,
  priorLedger, oldClasses, newClasses,
});
console.log('autoMigration plan ok:', plan.successful.length, plan.failed.length);

// remapEntry direct
const r1 = remapEntry(priorLedger[0], delta);
console.log('remapEntry passed (expect ok):', r1.ok);
const r2 = remapEntry(priorLedger[1], delta);
console.log('remapEntry removed class (expect !ok, reason):', r2.ok ? 'ok' : r2.reason);
const r3 = remapEntry(priorLedger[2], delta);
console.log('remapEntry pending validation (expect !ok, reason):', r3.ok ? 'ok' : r3.reason);
