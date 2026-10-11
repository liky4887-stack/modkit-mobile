// Client for the mod-diff pipeline. Reads two APK paths, calls the
// sidecar's /tools/apk_diff_run route, returns a modification inventory.
// The inventory is display-only until the user checks REVERT on
// individual items — nothing is written back to any APK until the
// recombine step, and the recombine step only produces an APK reverted
// to the original bytes.
const BACKEND = 'http://127.0.0.1:8792';

export interface Modification {
  id: string;
  type: 'ADDED' | 'REMOVED' | 'MODIFIED';
  kind: 'class' | 'method' | 'resource' | 'permission' | 'component' | 'native';
  target: string;                  // fqcn, method sig, resource key, etc.
  original: string | null;         // original value/snippet, null if ADDED
  modified: string | null;         // modified value/snippet, null if REMOVED
  original_hash: string | null;    // sha256 of original bytes (if MODIFIED)
  modified_hash: string | null;    // sha256 of modified bytes
  reverted: boolean;               // UI state
}

export interface ModCompareResult {
  original_apk: string;
  modified_apk: string;
  modifications: Modification[];
  wall_ms: number;
}

export async function runModCompare(
  originalApk: string,
  modifiedApk: string,
): Promise<ModCompareResult> {
  if (!originalApk.trim() || !modifiedApk.trim()) {
    throw new Error('both APK paths required');
  }
  const t0 = Date.now();
  const r = await fetch(`${BACKEND}/tools/apk_diff_run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      original_apk: originalApk.trim(),
      modified_apk: modifiedApk.trim(),
    }),
  });
  const j: any = await r.json();
  if (!j.ok) throw new Error(j.error || 'diff failed');
  const mods: Modification[] = (j.modifications || []).map((m: any, i: number) => ({
    id: m.id || `mod_${i + 1}`,
    type: m.type,
    kind: m.kind,
    target: m.target,
    original: m.original ?? null,
    modified: m.modified ?? null,
    original_hash: m.original_hash ?? null,
    modified_hash: m.modified_hash ?? null,
    reverted: false,
  }));
  return {
    original_apk: originalApk,
    modified_apk: modifiedApk,
    modifications: mods,
    wall_ms: Date.now() - t0,
  };
}

export async function requestRevert(
  originalApk: string,
  modifiedApk: string,
  toRevert: Modification[],
  outputPath: string,
): Promise<{ ok: boolean; output?: string; error?: string }> {
  const r = await fetch(`${BACKEND}/tools/apk_revert_run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      original_apk: originalApk,
      modified_apk: modifiedApk,
      revert: toRevert.map(m => ({
        type: m.type,
        kind: m.kind,
        target: m.target,
        original_hash: m.original_hash,
        modified_hash: m.modified_hash,
      })),
      output_path: outputPath,
    }),
  });
  return r.json();
}
