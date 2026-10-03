import { useCallback, useEffect, useState } from 'react';
import {
  listScans, getScan, getScanFeatures, deleteScan, countScans,
  type SaveScanInput, saveScan, updateScanPatchPlan,
} from '@/db/scans';
import type { ScanRecord, FeatureRecord } from '@/db/schema';

export function useScanList() {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, c] = await Promise.all([listScans(100), countScans()]);
      setScans(rows);
      setTotal(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await deleteScan(id);
    await refresh();
  }, [refresh]);

  return { scans, total, loading, error, refresh, remove };
}

export function useScanDetail(id: string | null) {
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [features, setFeatures] = useState<FeatureRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) { setScan(null); setFeatures([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [s, fs] = await Promise.all([getScan(id), getScanFeatures(id)]);
        if (!cancelled) { setScan(s); setFeatures(fs); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return { scan, features, loading };
}

export async function persistScan(input: SaveScanInput): Promise<string> {
  return saveScan(input);
}

export async function attachPlanToScan(id: string, plan: unknown, goal: string): Promise<void> {
  await updateScanPatchPlan(id, JSON.stringify(plan), goal);
}
