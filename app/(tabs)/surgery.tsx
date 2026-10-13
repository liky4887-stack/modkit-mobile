// SURGERY — license and login bypass workflow.
//
// 1. SCAN: runs apk_license_scan + apk_login_scan against the APK path.
// 2. REVIEW: shows candidate patches. Toggle which to apply.
// 3. APPLY: runs apk_license_bypass and/or apk_login_bypass, writes
//    signed APKs to /storage/emulated/0/Download/.
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';

const BACKEND = 'http://127.0.0.1:8792';
const DEFAULT_APK = '/storage/emulated/0/Download/DxCheat.apk';

async function tool(name: string, args: any): Promise<any> {
  const r = await fetch(BACKEND + '/tool/' + name, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || name + ' failed');
  return j;
}

interface LicenseCandidate {
  class: string;
  method: string;
  return_type: string;
  dex: string;
}
interface LoginInfo {
  launcher: string;
  destination: string;
  package: string;
}

export default function SurgeryTab() {
  const [apkPath, setApkPath] = useState(DEFAULT_APK);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [licenseCandidates, setLicenseCandidates] = useState<LicenseCandidate[]>([]);
  const [selectedLicense, setSelectedLicense] = useState<Record<string, boolean>>({});
  const [loginInfo, setLoginInfo] = useState<LoginInfo | null>(null);
  const [applyLogin, setApplyLogin] = useState(false);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!apkPath.trim()) return;
    setBusy('scan');
    setStatus('scanning license + login gates...');
    setLicenseCandidates([]);
    setLoginInfo(null);
    setSelectedLicense({});
    setApplyLogin(false);
    setOutputPath(null);
    try {
      await tool('load', { apk_path: apkPath.trim() });

      const [lic, log] = await Promise.all([
        tool('apk_license_scan', {}).catch((e: any) => ({ ok: false, error: e.message })),
        tool('apk_login_scan', { apk_path: apkPath.trim() }).catch((e: any) => ({ ok: false, error: e.message })),
      ]);

      if (lic && lic.candidates) {
        setLicenseCandidates(lic.candidates);
        const sel: Record<string, boolean> = {};
        for (const c of lic.candidates) sel[c.class + '#' + c.method] = true;
        setSelectedLicense(sel);
      }

      if (log && log.launcher && log.destination) {
        setLoginInfo({ launcher: log.launcher, destination: log.destination, package: log.package || '?' });
        setApplyLogin(true);
      }

      const parts: string[] = [];
      parts.push(`${lic?.candidates?.length || 0} license candidates`);
      parts.push(log?.launcher ? `LAUNCHER: ${log.launcher} → ${log.destination}` : 'no LAUNCHER found');
      setStatus(parts.join(' · '));
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)).slice(0, 180));
    }
    setBusy(null);
  }, [apkPath]);

  const apply = useCallback(async () => {
    if (busy) return;
    const selected = licenseCandidates.filter(c => selectedLicense[c.class + '#' + c.method]);
    if (selected.length === 0 && !applyLogin) {
      Alert.alert('Nothing selected', 'Toggle at least one patch, or enable login bypass.');
      return;
    }
    setBusy('apply');
    setStatus('applying...');
    try {
      const paths: string[] = [];

      if (selected.length > 0) {
        setStatus(`applying ${selected.length} license patch(es)...`);
        const licOut = apkPath.replace(/\.apk$/i, '') + '-license-bypassed.apk';
        const r = await tool('apk_license_bypass', {
          apk_path: apkPath.trim(),
          output_path: licOut,
          targets: selected.map(c => ({
            class: c.class, method: c.method, dex: c.dex, force_value: true,
          })),
        });
        if (r.final_apk) paths.push(r.final_apk);
      }

      if (applyLogin && loginInfo) {
        setStatus('applying login bypass...');
        const logOut = apkPath.replace(/\.apk$/i, '') + '-login-bypassed.apk';
        const r = await tool('apk_login_bypass', {
          apk_path: apkPath.trim(),
          output_path: logOut,
          launcher: loginInfo.launcher,
          destination: loginInfo.destination,
        });
        if (r.final_apk) paths.push(r.final_apk);
      }

      setOutputPath(paths.length ? paths.join('\n') : null);
      setStatus('done · ' + paths.length + ' file(s) written');
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)).slice(0, 200));
    }
    setBusy(null);
  }, [apkPath, licenseCandidates, selectedLicense, applyLogin, loginInfo, busy]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · SURGERY</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.block}>
          <Text style={styles.blockLabel}>TARGET APK</Text>
          <TextInput
            value={apkPath}
            onChangeText={setApkPath}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <Pressable onPress={scan} disabled={!!busy}
            style={[styles.btn, { marginTop: 10 }, busy && styles.btnDisabled]}>
            <Text style={styles.btnText}>
              {busy === 'scan' ? 'SCANNING…' : 'SCAN FOR GATES'}
            </Text>
          </Pressable>
          {status && <Text style={styles.status}>{status}</Text>}
        </View>

        {licenseCandidates.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>LICENSE GATES · {licenseCandidates.length}</Text>
            {licenseCandidates.map(c => {
              const key = c.class + '#' + c.method;
              const on = !!selectedLicense[key];
              return (
                <Pressable key={key} onPress={() =>
                  setSelectedLicense(s => ({ ...s, [key]: !s[key] }))}
                  style={styles.row}>
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.method}()</Text>
                    <Text style={styles.rowSub}>{c.class}</Text>
                    <Text style={styles.rowMeta}>returns {c.return_type} · {c.dex}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {loginInfo && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>LOGIN SCREEN</Text>
            <Pressable onPress={() => setApplyLogin(v => !v)} style={styles.row}>
              <View style={[styles.checkbox, applyLogin && styles.checkboxOn]}>
                {applyLogin && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Bypass LAUNCHER</Text>
                <Text style={styles.rowSub}>{loginInfo.launcher}</Text>
                <Text style={styles.rowMeta}>redirects to {loginInfo.destination}</Text>
              </View>
            </Pressable>
          </View>
        )}

        {(licenseCandidates.length > 0 || loginInfo) && (
          <View style={styles.block}>
            <Pressable onPress={apply} disabled={!!busy}
              style={[styles.btn, busy && styles.btnDisabled]}>
              <Text style={styles.btnText}>
                {busy === 'apply' ? 'APPLYING…' : 'APPLY · BUILD SIGNED APK'}
              </Text>
            </Pressable>
            {outputPath && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.blockLabel}>OUTPUT</Text>
                {outputPath.split('\n').map((p, i) => (
                  <Text key={i} style={styles.outPath}>{p}</Text>
                ))}
                <Text style={styles.hint}>
                  Uninstall the original, then install the new APK from Files.
                </Text>
              </View>
            )}
          </View>
        )}

        {busy && <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  topBar: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  topBarTitle: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 2 },
  content: { padding: spacing.md, paddingBottom: 60 },
  block: {
    marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.surface,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
  },
  blockLabel: {
    color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 10,
    letterSpacing: 2, marginBottom: 8,
  },
  input: {
    color: colors.textPrimary, fontFamily: 'JetBrainsMono-Regular', fontSize: 10,
    backgroundColor: colors.pureBlack, borderRadius: 6, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 8,
  },
  btn: {
    backgroundColor: colors.accent, borderRadius: 6, paddingVertical: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: colors.pureBlack, fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1,
  },
  status: {
    color: colors.accent, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10, marginTop: 10, lineHeight: 15,
  },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.pureBlack, fontFamily: 'Inter-Bold', fontSize: 12 },
  rowTitle: { color: colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 },
  rowSub: { color: colors.textSecondary, fontFamily: 'JetBrainsMono-Regular', fontSize: 10, marginTop: 2 },
  rowMeta: { color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular', fontSize: 9, marginTop: 2 },
  outPath: {
    color: colors.textPrimary, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10, lineHeight: 16,
  },
  hint: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 10, marginTop: 8 },
});
