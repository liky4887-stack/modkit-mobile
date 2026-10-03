// APK picker + streaming copy.
// Uses expo-file-system/legacy copyAsync because the modern File.copy()
// rejects content:// URIs on Android (SDK 54, expo-file-system 19.0.24).
// copyAsync routes through Android's ContentResolver and streams natively.
import * as DocumentPicker from 'expo-document-picker';
import { File, Directory } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

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

    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/vnd.android.package-archive',
      copyToCacheDirectory: false,
      multiple: false,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) return null;

    const asset = result.assets[0];
    console.log('[apkPicker] asset.uri =', asset.uri);

    const name = (asset.name || 'picked.apk').replace(/[^A-Za-z0-9._-]/g, '_');
    const stagedPath = STAGING_DIR + '/' + name;
    const stagedFileUri = 'file://' + stagedPath;

    // Ensure staging dir exists (idempotent)
    const stagingDir = new Directory(STAGING_DIR);
    try { stagingDir.create({ idempotent: true, intermediates: true }); } catch { /* ok */ }

    // Delete stale destination if present
    try {
      const destFile = new File(stagedPath);
      if (destFile.exists) destFile.delete();
    } catch { /* ok */ }

    // Legacy copyAsync handles content:// sources via ContentResolver
    await LegacyFS.copyAsync({ from: asset.uri, to: stagedFileUri });

    let size = 0;
    try {
      const stat = await LegacyFS.getInfoAsync(stagedFileUri);
      if (stat.exists && !stat.isDirectory) size = stat.size ?? 0;
    } catch { /* ok */ }

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
