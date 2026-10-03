// APK picker + copy.
// Root cause of prior failure: destination File needs file:// scheme.
// Java's URI parser rejects bare paths with "URI is not absolute".
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

    // copyToCacheDirectory: true → Expo's native picker copies the file
    // into app cache using the picker's URI permission grant (which our
    // JS code does NOT get with copyToCacheDirectory:false). The returned
    // asset.uri is then file://... so File.copy() succeeds.
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/vnd.android.package-archive',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) return null;

    const asset = result.assets[0];
    console.log('[apkPicker] source uri =', asset.uri);

    const name = (asset.name || 'picked.apk').replace(/[^A-Za-z0-9._-]/g, '_');
    const stagedPath = STAGING_DIR + '/' + name;

    // Ensure dir exists
    const stagingDir = new Directory(STAGING_DIR);
    try { stagingDir.create({ idempotent: true, intermediates: true }); } catch {}

    // Build the destination File from a proper file:// URI.
    // This was the actual bug: bare path → Java "URI is not absolute".
    const destUri = 'file://' + stagedPath;
    console.log('[apkPicker] dest uri =', destUri);

    const sourceFile = new File(asset.uri);
    const destFile = new File(destUri);

    try { if (destFile.exists) destFile.delete(); } catch {}

    // Now both sides have schemes: content:// (source) + file:// (dest)
    sourceFile.copy(destFile);

    let size = 0;
    try { size = destFile.size; } catch {}

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
      const dir = new Directory('file://' + STAGING_DIR);
      if (!dir.exists) return [];
      const entries = dir.list();
      const out: Array<{ path: string; size: number; name: string }> = [];
      for (const e of entries) {
        if (!(e instanceof File)) continue;
        if (!e.name.endsWith('.apk')) continue;
        // Strip file:// for the caller so downstream APIs (backend path) match
        const path = e.uri.startsWith('file://') ? e.uri.slice(7) : e.uri;
        out.push({ path, size: e.size ?? 0, name: e.name });
      }
      out.sort((a, b) => b.size - a.size);
      return out;
    } catch {
      return [];
    }
  },

  async remove(stagedPath: string): Promise<void> {
    try { new File('file://' + stagedPath).delete(); } catch {}
  },
};
