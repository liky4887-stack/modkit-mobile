// SURGERY — scan + gate review + apply.
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';
import { apkPicker } from '@/upload/apkPicker';
import { styles } from './surgery.styles';

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
  class: string; method: string; return_type: string; dex: string;
}
interface FeatureHit {
  feature_id: string;
  feature_name: string;
  confidence: number;
  severity: string;
  source: string;
  evidence: any[];
  patchable: boolean;
  class: string | null;
  method: string | null;
}

export default function SurgeryTab() {
  const [apkPath, setApkPath] = useState(DEFAULT_APK);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [features, setFeatures] = useState<Record<string, FeatureHit[]>>({});
  const [featureTotal, setFeatureTotal] = useState(0);
  const [featurePatchable, setFeaturePatchable] = useState(0);
  const [licenseCandidates, setLicenseCandidates] = useState<LicenseCandidate[]>([]);
  const [loginInfo, setLoginInfo] = useState<{ launcher: string; destination: string } | null>(null);

  const [selectedFeatures, setSelectedFeatures] = useState<Record<string, boolean>>({});
  const [selectedLicense, setSelectedLicense] = useState<Record<string, boolean>>({});
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
    setFeatureTotal(0);
    setFeaturePatchable(0);
    setLicenseCandidates([]);
    setLoginInfo(null);
    setSelectedFeatures({});
    setSelectedLicense({});
    setApplyLogin(false);
    setOutputPath(null);
    try {
      await tool('load', { apk_path: apkPath.trim() });
      const r = await tool('apk_surgery_scan', { apk_path: apkPath.trim() });

      const byCat = r.mod_by_category || {};
      setFeatures(byCat);
      setFeatureTotal(r.feature_total || 0);
      setFeaturePatchable(r.feature_patchable || 0);

      const sf: Record<string, boolean> = {};
      for (const hits of Object.values(byCat) as FeatureHit[][]) {
        for (const h of hits) {
          if (h.patchable && h.class && h.method) {
            sf[h.class + '#' + h.method] = true;
          }
        }
      }
      setSelectedFeatures(sf);

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

      setStatus(
        (r.feature_total || 0) + ' features · ' +
        (r.feature_patchable || 0) + ' patchable · ' +
        (lic.candidates?.length || 0) + ' license · ' +
        (log.launcher ? 'login found' : 'no login')
      );
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)).slice(0, 200));
    }
    setBusy(null);
  }, [apkPath]);

  const patchCount = useMemo(() => {
    const fromFeatures = Object.values(selectedFeatures).filter(Boolean).length;
    const fromLicense = Object.values(selectedLicense).filter(Boolean).length;
    return fromFeatures + fromLicense + (applyLogin ? 1 : 0);
  }, [selectedFeatures, selectedLicense, applyLogin]);

  const apply = useCallback(async () => {
    if (busy) return;
    if (patchCount === 0) {
      Alert.alert('Nothing selected', 'Enable at least one patch target.');
      return;
    }
    setBusy('apply');
    setStatus('building combined signed APK (' + patchCount + ' patches)…');
    try {
      const targets: any[] = [];
      for (const hits of Object.values(features) as FeatureHit[][]) {
        for (const h of hits) {
          if (!h.patchable || !h.class || !h.method) continue;
          const key = h.class + '#' + h.method;
          if (!selectedFeatures[key]) continue;
          targets.push({ type: 'force_return', class: h.class,
                         method: h.method, force_value: true });
        }
      }
      for (const c of licenseCandidates) {
        const key = c.class + '#' + c.method;
        if (!selectedLicense[key]) continue;
        targets.push({ type: 'force_return', class: c.class,
                       method: c.method, dex: c.dex, force_value: true });
      }
      if (applyLogin && loginInfo) {
        targets.push({ type: 'launcher_redirect', class: loginInfo.launcher,
                       dest_class: loginInfo.destination });
      }

      const seen = new Set<string>();
      const uniq = targets.filter(t => {
        const k = t.type + '|' + t.class + '|' + (t.method || t.dest_class || '');
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const out = apkPath.replace(/\.apk$/i, '') + '-bypassed.apk';
      const r = await tool('apk_license_bypass', {
        apk_path: apkPath.trim(), output_path: out, targets: uniq,
      });
      setOutputPath(r.final_apk || out);
      setStatus('done · ' + uniq.length + ' patch(es) applied');
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)).slice(0, 200));
    }
    setBusy(null);
  }, [apkPath, features, licenseCandidates, selectedFeatures, selectedLicense,
      applyLogin, loginInfo, patchCount, busy]);

  const sevColor = (s: string) =>
    s === 'critical' ? '#FF3B30' : s === 'high' ? '#FF9500'
    : s === 'medium' ? '#FFCC00' : s === 'low' ? '#34C759' : '#8E8E93';

  const hasReview = featureTotal > 0 || licenseCandidates.length > 0 || !!loginInfo;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · SURGERY</Text>
      </View>
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

        {hasReview && (
          <View style={[styles.block, styles.gateBlock]}>
            <View style={styles.gateHeader}>
              <Text style={styles.gateLabel}>GATE REVIEW</Text>
              <Text style={styles.gateBadge}>AWAITING DECISION</Text>
            </View>
            <Text style={styles.gateHint}>
              Every detected feature is toggleable. Patchable features carry
              an extracted class + method. Features without a target stay
              visible as informational only.
            </Text>
          </View>
        )}

        {featureTotal > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>
              FEATURES · {featureTotal} ({featurePatchable} patchable)
            </Text>
            {Object.entries(features).map(([cat, hits]) => (
              <View key={cat} style={{ marginTop: 12 }}>
                <Text style={styles.catLabel}>{cat.toUpperCase()} · {hits.length}</Text>
                {hits.map((h, i) => {
                  const key = h.class && h.method ? h.class + '#' + h.method : 'f_' + cat + '_' + i;
                  const on = !!selectedFeatures[key];
                  const disabled = !h.patchable;
                  return (
                    <Pressable key={key}
                      onPress={() => {
                        if (disabled) return;
                        setSelectedFeatures(s => ({ ...s, [key]: !s[key] }));
                      }}
                      style={[styles.featureRow, disabled && styles.featureRowDim]}>
                      <View style={[
                        styles.checkbox,
                        on && styles.checkboxOn,
                        disabled && styles.checkboxDisabled,
                      ]}>
                        {on && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.featTop}>
                          <View style={[styles.sevPill, { backgroundColor: sevColor(h.severity) }]}>
                            <Text style={styles.sevPillText}>
                              {(h.severity || '?').slice(0, 4).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.featTitle}>{h.feature_name}</Text>
                        </View>
                        <Text style={styles.featMeta}>
                          conf {typeof h.confidence === 'number' ? h.confidence.toFixed(2) : '?'} · {h.source || '?'}
                        </Text>
                        {h.patchable && h.class && h.method ? (
                          <Text style={styles.featTarget}>
                            → {h.class}#{h.method}()
                          </Text>
                        ) : (
                          <Text style={styles.featInfo}>informational — no patch target</Text>
                        )}
                        {(h.evidence || []).slice(0, 2).map((e, j) => (
                          <Text key={j} style={styles.featEv} numberOfLines={1}>
                            {String(e?.matched || '').slice(0, 100)}
                          </Text>
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
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
                  style={styles.featureRow}>
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featTitle}>{c.method}()</Text>
                    <Text style={styles.featMeta}>{c.class}</Text>
                    <Text style={styles.featTarget}>→ force-return true ({c.return_type})</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {loginInfo && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>LOGIN SCREEN</Text>
            <Pressable onPress={() => setApplyLogin(v => !v)} style={styles.featureRow}>
              <View style={[styles.checkbox, applyLogin && styles.checkboxOn]}>
                {applyLogin && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featTitle}>Bypass LAUNCHER</Text>
                <Text style={styles.featMeta}>{loginInfo.launcher}</Text>
                <Text style={styles.featTarget}>→ redirect to {loginInfo.destination}</Text>
              </View>
            </Pressable>
          </View>
        )}

        {hasReview && (
          <View style={styles.block}>
            <View style={styles.decisionHeader}>
              <Text style={styles.blockLabel}>DECISION</Text>
              <Text style={styles.decisionCount}>{patchCount} patch(es)</Text>
            </View>
            <Text style={styles.gateHint}>
              APPLY writes one signed APK with every confirmed patch.
              Uninstall the original first — the signature changes.
            </Text>
            <Pressable onPress={apply} disabled={!!busy || patchCount === 0}
              style={[styles.btn, { marginTop: 12 },
                      (busy || patchCount === 0) && styles.btnDisabled]}>
              <Text style={styles.btnText}>
                {busy === 'apply' ? 'BUILDING…' : 'APPLY · BUILD APK (' + patchCount + ')'}
              </Text>
            </Pressable>
            {outputPath && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.blockLabel}>OUTPUT</Text>
                <Text style={styles.outPath}>{outputPath}</Text>
              </View>
            )}
          </View>
        )}

        {busy && <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />}
      </ScrollView>
    </View>
  );
}
