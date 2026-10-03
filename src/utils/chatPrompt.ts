import type { ChatRecord, FeatureRecord, ScanRecord } from '@/db/schema';

// Build a focused prompt each turn. We send the full thread + scan context
// because the DeepSeek web API is stateless for our purposes.
export function buildFindingPrompt(
  scan: ScanRecord,
  feature: FeatureRecord,
  history: ChatRecord[],
  question: string,
): string {
  const patterns: string[] = JSON.parse(feature.patterns || '[]');

  const context = [
    'You are a reverse-engineering analyst embedded in the ModKit mobile app.',
    'Answer concisely and concretely. Use real class names, real files, real techniques.',
    'Never invent facts. If you need more data, say exactly which command would produce it.',
    '',
    '=== SCAN CONTEXT ===',
    `APK: ${scan.apkName}  (${(scan.apkSize / 1024 / 1024 / 1024).toFixed(2)} GB)`,
    `SHA256: ${scan.apkHash}`,
    `DEX files: ${scan.dexParsed} / ${scan.dexTotal}`,
    `Classes parsed: ${scan.totalClasses}`,
    '',
    '=== FINDING ===',
    `Feature: ${feature.featureId}`,
    `Status: ${feature.status}`,
    `Message: ${feature.message}`,
    `Hits: ${feature.totalHits} DEX files (${feature.dexCount} distinct)`,
  ];
  if (feature.topSignalClass) context.push(`Top signal class: ${feature.topSignalClass}`);
  if (patterns.length > 0) context.push(`Patterns matched: ${patterns.slice(0, 12).join(', ')}`);

  // Include last 5 exchanges for continuity
  const tail = history.slice(-10);
  if (tail.length > 0) {
    context.push('');
    context.push('=== PRIOR EXCHANGE ===');
    for (const m of tail) {
      context.push(`${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content.slice(0, 800)}`);
    }
  }

  context.push('');
  context.push('=== QUESTION ===');
  context.push(question);
  context.push('');
  context.push('Answer:');

  return context.join('\n');
}
