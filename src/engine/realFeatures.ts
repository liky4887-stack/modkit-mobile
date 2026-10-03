import { featureApi, type FeatureCheckResponse, type FeatureCheckResult } from '@/api/factory';

let cache: { apkPath: string; data: FeatureCheckResponse } | null = null;

export async function loadFeatureData(apkPath: string): Promise<FeatureCheckResponse> {
  if (cache && cache.apkPath === apkPath) return cache.data;
  const data = await featureApi.checkAll(apkPath);
  cache = { apkPath, data };
  return data;
}

export function getFeatureResult(id: string): FeatureCheckResult | null {
  return cache?.data.features[id] ?? null;
}

export function hasFeatureData(apkPath: string): boolean {
  return cache?.apkPath === apkPath;
}

export function clearFeatureCache(): void {
  cache = null;
}

export function getCacheStats(): { apkPath: string; count: number } | null {
  if (!cache) return null;
  return { apkPath: cache.apkPath, count: Object.keys(cache.data.features).length };
}

export function getLastResponse(): FeatureCheckResponse | null {
  return cache?.data ?? null;
}
