// APK picker + streaming copy — Expo Go compatible.
// Uses expo-file-system SDK 54 File/Directory classes.
import * as DocumentPicker from 'expo-document-picker';
import { File, Directory } from 'expo-file-system';

const STAGING_DIR = '/storage/emulated/0/Download/modkit-apks';

export interface PickedApk {
  originalName: string;
  sourceUri: string;
  stagedPath: string;
  size: number;
  copiedMs: number;
}

export const apkPicker = {
  async pick(): Promise<PickedApk | null> {
    const t0 = Date.now();

    // copyToCacheDirectory: true → Expo copies the file to the app cache
    // using a NATIVE stream (not JS memory), then returns a file:// URI.
    // This is required because expo-file-system@19.0.24's File.copy()
    // rejects content:// schemes ("URI is not absolute").
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/vnd.android.package-archive',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) return null;

    const asset = result.assets[0];
    const name = (asset.name || 'picked.apk').replace(/[^A-Za-z0-9._-]/g, '_');
    const stagedPath = STAGING_DIR + '/' + name;

    // Ensure staging dir exists (idempotent)
    const stagingDir = new Directory(STAGING_DIR);
    try { stagingDir.create({ idempotent: true, intermediates: true }); } catch { /* ok */ }

    // Wrap source content:// URI in a File — new API handles it natively
    const sourceFile = new File(asset.uri);

    // Destination on shared storage
    const destFile = new File(stagedPath);
    try { if (destFile.exists) destFile.delete(); } catch { /* ok */ }

    // Native copy. Note: File.copy returns void synchronously per SDK 54 .d.ts.
    // For very large files this MAY block briefly — measured below.
    const copyStart = Date.now();
    sourceFile.copy(destFile);
    const copyMs = Date.now() - copyStart;

    let size = 0;
    try { size = destFile.size; } catch { /* ok */ }

    return {
      originalName: asset.name || 'picked.apk',
      sourceUri: asset.uri,
      stagedPath,
      size,
      copiedMs: Date.now() - t0,
    };
  },

  async list(): Promise<Array<{ path: string; size: number; name: string }>> {
    try {
      const dir = new Directory(STAGING_DIR);
      if (!dir.exists) return [];
      const entries = dir.list();
      const out: Array<{ path: string; size: number; name: string }> = [];
      for (const e of entries) {
        if (!(e instanceof File)) continue;
        if (!e.name.endsWith('.apk')) continue;
        out.push({ path: e.uri, size: e.size ?? 0, name: e.name });
      }
      out.sort((a, b) => b.size - a.size);
      return out;
    } catch {
      return [];
    }
  },

  async remove(stagedPath: string): Promise<void> {
    try { new File(stagedPath).delete(); } catch {}
  },
};
