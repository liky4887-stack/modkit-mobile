// SURGERY — full modification workflow.
//
// SCAN runs three engines in one call:
//   1. feature_bots_run  — every mod feature the fleet detects
//   2. apk_license_scan  — activation gates to force-return
//   3. apk_login_scan    — LAUNCHER + destination for login bypass
//
// APPLY builds ONE signed APK with every selected patch.
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';
import { apkPicker } from '@/upload/apkPicker';

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

interface LicenseCandidate { class: string; method: string; return_type: string; dex: string; }
interface FeatureHit {
  feature_id: string; feature_name: string; confidence: number;
  severity: string; risk: string; source: string; evidence: any[];
}

export default function SurgeryTab() {
  const [apkPath, setApkPath] = useState(DEFAULT_APK);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [features, setFeatures] = useState<Record<string, FeatureHit[]>>({});
  const [featureCount, setFeatureCount] = useState(0);
  const [licenseCandidates, setLicenseCandidates] = useState<LicenseCandidate[]>([]);
  const [selectedLicense, setSelectedLicense] = useState<Record<string, boolean>>({});
  const [loginInfo, setLoginInfo] = useState<{ launcher: string; destination: string } | null>(null);
  const [applyLogin, setApplyLogin] = useState(false);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  const pickApk = useCallback(async () => {
    try {
      const p = await apkPicker.pick();
      const target = p?.stagedPath || p?.sourceUri || null;
      if (target) setApkPath(String(target));
    } catch (e) {
      Alert.alert('Pick failed', (e as Error).message);
    }
  }, []);

  const scan = useCallback(async () => {
    if (!apkPath.trim()) return;
    setBusy('scan');
    setStatus('running fleet + license + login scan (~30s)…');
    setFeatures({});
    setFeatureCount(0);
    setLicenseCandidates([]);
    setSelectedLicense({});
    setLoginInfo(null);
    setApplyLogin(false);
    setOutputPath(null);
    try {
      await tool('load', { apk_path: apkPath.trim() });
      const r = await tool('apk_surgery_scan', { apk_path: apkPath.trim() });

      setFeatures(r.mod_by_category || {});
      setFeatureCount(r.features?.feature_count || 0);

      const lic = r.license || {};
      if (lic.candidates) {
        setLicenseCandidates(lic.candidates);
        const sel: Record<string, boolean> = {};
        for (const c of lic.candidates) sel[c.class + '#' + c.method] = true;
        setSelectedLicense(sel);
      }

      const log = r.login || {};
      if (log.launcher && log.destination) {
        setLoginInfo({ launcher: log.launcher, destination: log.destination });
        setApplyLogin(true);
      }

      const parts = [
        `${r.features?.feature_count || 0} mod features`,
        `${lic.candidates?.length || 0} license gates`,
        log.launcher ? `login: ${log.launcher}` : 'no login',
      ];
      setStatus(parts.join(' · '));
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)).slice(0, 200));
    }
    setBusy(null);
  }, [apkPath]);

  const apply = useCallback(async () => {
    if (busy) return;
    const selected = licenseCandidates.filter(c => selectedLicense[c.class + '#' + c.method]);
    if (selected.length === 0 && !applyLogin) {
      Alert.alert('Nothing selected', 'Toggle at least one patch.');
      return;
    }
    setBusy('apply');
    setStatus('building combined signed APK…');
    try {
      const targets: any[] = [];
      for (const c of selected) {
        targets.push({ type: 'force_return', class: c.class, method: c.method,
                       dex: c.dex, force_value: true });
      }
      if (applyLogin && loginInfo) {
        targets.push({ type: 'launcher_redirect', class: loginInfo.launcher,
                       dest_class: loginInfo.destination });
      }
      const out = apkPath.replace(/\.apk$/i, '') + '-bypassed.apk';
      const r = await tool('apk_license_bypass', {
        apk_path: apkPath.trim(), output_path: out, targets,
      });
      setOutputPath(r.final_apk || out);
      setStatus('done · ' + targets.length + ' patch(es) applied');
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)).slice(0, 200));
    }
    setBusy(null);
  }, [apkPath, licenseCandidates, selectedLicense, applyLogin, loginInfo, busy]);

  const sevColor = (s: string) =>
    s === 'critical' ? '#FF3B30' : s === 'high' ? '#FF9500'
    : s === 'medium' ? '#FFCC00' : s === 'low' ? '#34C759' : '#8E8E93';

  return (
    <View style={styles.container}>
      <View style={styles.topBar}><Text style={styles.topBarTitle}>MODKIT · SURGERY</Text></View>
      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>TARGET APK</Text>
          <TextInput
            value={apkPath} onChangeText={setApkPath}
            style={styles.input} autoCapitalize="none" autoCorrect={false}
            editable={!busy}
          />
          <Pressable onPress={pickApk} disabled={!!busy}
            style={[styles.btnAlt, { marginTop: 8 }]}>
            <Text style={styles.btnAltText}>PICK FROM FILES</Text>
          </Pressable>
          <Pressable onPress={scan} disabled={!!busy}
            style={[styles.btn, { marginTop: 8 }, busy && styles.btnDisabled]}>
            <Text style={styles.btnText}>
              {busy === 'scan' ? 'SCANNING…' : 'SCAN (FLEET + LICENSE + LOGIN)'}
            </Text>
          </Pressable>
          {status && <Text style={styles.status}>{status}</Text>}
        </View>

        {featureCount > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>MOD FEATURES · {featureCount}</Text>
            {Object.entries(features).map(([cat, hits]) => (
              <View key={cat} style={{ marginTop: 10 }}>
                <Text style={styles.catLabel}>{cat.toUpperCase()} · {hits.length}</Text>
                {hits.map((h, i) => (
                  <View key={h.feature_id + i} style={styles.featureRow}>
                    <View style={[styles.sevPill, { backgroundColor: sevColor(h.severity) }]}>
                      <Text style={styles.sevPillText}>{(h.severity || '?').slice(0, 4).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.featTitle}>{h.feature_name}</Text>
                      <Text style={styles.featMeta}>
                        conf {typeof h.confidence === 'number' ? h.confidence.toFixed(2) : '?'} · {h.source || '?'}
                      </Text>
                      {(h.evidence || []).slice(0, 2).map((e, j) => (
                        <Text key={j} style={styles.featEv} numberOfLines={1}>
                          {String(e?.matched || '').slice(0, 100)}
                        </Text>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {licenseCandidates.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>LICENSE GATES · {licenseCandidates.length}</Text>
            {licenseCandidates.map(c => {
              const key = c.class + '#' + c.method;
              const on = !!selectedLicense[key];
              return (
                <Pressable key={key}
                  onPress={() => setSelectedLicense(s => ({ ...s, [key]: !s[key] }))}
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
                {busy === 'apply' ? 'BUILDING…' : 'APPLY · BUILD ONE SIGNED APK'}
              </Text>
            </Pressable>
            {outputPath && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.blockLabel}>OUTPUT</Text>
                <Text style={styles.outPath}>{outputPath}</Text>
                <Text style={styles.hint}>
                  Uninstall the original, then install from Files.
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
  topBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.md,
            borderBottomWidth: 1, borderBottomColor: colors.border },
  topBarTitle: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 2 },
  content: { padding: spacing.md, paddingBottom: 60 },
  block: { marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.surface,
           borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  blockLabel: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 10,
                letterSpacing: 2, marginBottom: 8 },
  input: { color: colors.textPrimary, fontFamily: 'JetBrainsMono-Regular', fontSize: 10,
           backgroundColor: colors.pureBlack, borderRadius: 6, borderWidth: 1,
           borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 8 },
  btn: { backgroundColor: colors.accent, borderRadius: 6, paddingVertical: 12, alignItems: 'center' },
  btnAlt: { backgroundColor: '#1A3A5C', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.pureBlack, fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1 },
  btnAltText: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 1 },
  status: { color: colors.accent, fontFamily: 'JetBrainsMono-Regular', fontSize: 10,
            marginTop: 10, lineHeight: 15 },
  catLabel: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 9,
              letterSpacing: 1, marginBottom: 6 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  sevPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginTop: 2 },
  sevPillText: { color: colors.pureBlack, fontFamily: 'Inter-SemiBold', fontSize: 8, letterSpacing: 0.5 },
  featTitle: { color: colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 15 },
  featMeta: { color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular', fontSize: 9, marginTop: 2 },
  featEv: { color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular', fontSize: 9,
            marginTop: 2, opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10,
         borderTopWidth: 1, borderTopColor: colors.border },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: colors.border,
              alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.pureBlack, fontFamily: 'Inter-Bold', fontSize: 12 },
  rowTitle: { color: colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 },
  rowSub: { color: colors.textSecondary, fontFamily: 'JetBrainsMono-Regular', fontSize: 10, marginTop: 2 },
  rowMeta: { color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular', fontSize: 9, marginTop: 2 },
  outPath: { color: colors.textPrimary, fontFamily: 'JetBrainsMono-Regular', fontSize: 10, lineHeight: 16 },
  hint: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 10, marginTop: 8 },
});
