// LIVE test — calls the real Termux backend.
// Requires ~/start-factory.sh running + SANDBOX_v2.apk present.
import { binaryDiffViewer } from '../binaryDiffViewer';

const APK = '/data/data/com.termux/files/home/SANDBOX_v2.apk';
const scanId = 'live-diff-' + Date.now();

(async () => {
  const t0 = Date.now();
  try {
    const diff = await binaryDiffViewer.compare({
      scanId,
      correlationId: scanId,
      originalPath: APK,
      transformedPath: APK,   // self-diff: expect 0 add / 0 remove
    });
    const ms = Date.now() - t0;
    console.log('LIVE OK in', ms, 'ms');
    console.log('summary:', JSON.stringify(diff.summary));
    console.log('entries:', diff.entries.length);
    console.log('concentration:', Number(diff.concentrationScore.toFixed(4)));
  } catch (err) {
    console.error('LIVE FAIL:', String(err));
    process.exit(1);
  }
})();
