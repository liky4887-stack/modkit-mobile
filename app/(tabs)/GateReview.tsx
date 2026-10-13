// GATE REVIEW — the decision surface.
//
// Renders everything the pipeline found (mod signals, defenses,
// framework markers, nested container) plus every patchable target
// (license gates, login redirect, feature-based patches). The user
// toggles targets and either APPLIES (build signed APK) or EXPORTS
// (report only).
import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { colors } from '@/theme/colors';
import { styles } from './workflow.styles';

const SEV_COLOR: Record<string, string> = {
  critical: '#FF3B30', high: '#FF9500', medium: '#FFCC00',
  low: '#34C759', info: '#8E8E93',
};

export interface GateReviewProps {
  preGate: any;
  gates: any;
  selectedLicense: Record<string, boolean>;
  onToggleLicense: (key: string) => void;
  applyLogin: boolean;
  onToggleLogin: () => void;
  selectedFeatures: Record<string, boolean>;
  onToggleFeature: (key: string) => void;
  patchCount: number;
  busy: string | null;
  onApply: () => void;
  onExport: () => void;
}

export function GateReview(props: GateReviewProps) {
  const {
    preGate, gates, selectedLicense, onToggleLicense,
    applyLogin, onToggleLogin, selectedFeatures, onToggleFeature,
    patchCount, busy, onApply, onExport,
  } = props;

  const licenseGates = (gates && gates.license_gates) || [];
  const loginRedirect = (gates && gates.login_redirect) || null;
  const patchableFeatures = (gates && gates.patchable_features) || [];
  const modSignals = (preGate && preGate.mod_signals) || [];
  const defenseSignals = (preGate && preGate.defense_signals) || [];
  const frameworkSignals = (preGate && preGate.framework_signals) || [];
  const nestedSignals = (preGate && preGate.nested_signals) || [];
  const bySev = (preGate && preGate.findings_by_severity) || {};
  const totalFindings = (preGate && preGate.findings_total) || 0;

  const hasTargets =
    licenseGates.length > 0 || loginRedirect || patchableFeatures.length > 0;

  return (
    <View style={[styles.block, styles.gateBlock]}>
      <View style={styles.gateHeader}>
        <Text style={styles.gateLabel}>GATE REVIEW</Text>
        <Text style={styles.gateBadge}>AWAITING DECISION</Text>
      </View>
      <Text style={styles.gateHint}>
        Everything below was found in this APK. Toggle patchable
        targets, then APPLY to build a signed APK or EXPORT for the
        report only.
      </Text>

      <Text style={styles.sectionHeader}>
        FINDINGS · {totalFindings}
      </Text>
      <View style={styles.sevGrid}>
        {['critical', 'high', 'medium', 'low', 'info'].map(sev => (
          <View key={sev} style={styles.sevCell}>
            <Text style={[styles.sevNum, { color: SEV_COLOR[sev] }]}>
              {bySev[sev] || 0}
            </Text>
            <Text style={styles.sevLabel}>{sev.slice(0, 4).toUpperCase()}</Text>
          </View>
        ))}
      </View>

      {modSignals.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>
            MOD SIGNALS · {modSignals.length}
          </Text>
          {modSignals.map((m: any, i: number) => (
            <View key={i} style={styles.signalRow}>
              <View style={[styles.sevPill, { backgroundColor: '#FF3B30' }]}>
                <Text style={styles.sevPillText}>MOD</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.signalTitle}>{m.title}</Text>
                <Text style={styles.signalMeta}>
                  {m.category} ·{' '}
                  {typeof m.confidence === 'number' ? m.confidence.toFixed(2) : '?'}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}

      {defenseSignals.length > 0 && (
        <Text style={styles.blockMeta}>
          ANTI-TAMPER SURFACE · {defenseSignals.length}
        </Text>
      )}
      {frameworkSignals.length > 0 && (
        <Text style={styles.blockMeta}>
          FRAMEWORK MARKERS · {frameworkSignals.length}
        </Text>
      )}
      {nestedSignals.length > 0 && (
        <Text style={styles.blockMeta}>
          NESTED CONTAINER · {nestedSignals.length}
        </Text>
      )}

      <Text style={styles.sectionHeader}>PATCHABLE TARGETS</Text>

      {licenseGates.length > 0 && (
        <>
          <Text style={styles.blockMeta}>
            LICENSE GATES · {licenseGates.length}
          </Text>
          {licenseGates.map((g: any) => {
            const key = g.class + '#' + g.method;
            const on = !!selectedLicense[key];
            return (
              <Pressable key={key} onPress={() => onToggleLicense(key)}
                style={styles.patchRow}>
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.patchTitle}>{g.method}()</Text>
                  <Text style={styles.patchSub}>{g.class}</Text>
                  <Text style={styles.patchMeta}>
                    → force-return true ({g.return_type || 'Z'})
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </>
      )}

      {loginRedirect && (
        <>
          <Text style={styles.blockMeta}>LOGIN REDIRECT</Text>
          <Pressable onPress={onToggleLogin} style={styles.patchRow}>
            <View style={[styles.checkbox, applyLogin && styles.checkboxOn]}>
              {applyLogin && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.patchTitle}>Bypass LAUNCHER</Text>
              <Text style={styles.patchSub}>{loginRedirect.launcher}</Text>
              <Text style={styles.patchMeta}>
                → redirect to {loginRedirect.destination}
              </Text>
            </View>
          </Pressable>
        </>
      )}

      {patchableFeatures.length > 0 && (
        <>
          <Text style={styles.blockMeta}>
            FEATURE PATCHES · {patchableFeatures.length}
          </Text>
          {patchableFeatures.map((f: any) => {
            const key = f.class + '#' + f.method;
            const on = !!selectedFeatures[key];
            return (
              <Pressable key={key} onPress={() => onToggleFeature(key)}
                style={styles.patchRow}>
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.patchTitle}>{f.feature_name}</Text>
                  <Text style={styles.patchSub}>
                    {f.class}#{f.method}()
                  </Text>
                  <Text style={styles.patchMeta}>
                    severity {f.severity || '?'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </>
      )}

      {!hasTargets && (
        <Text style={styles.gateHint}>
          No patchable targets in this APK. EXPORT saves the report.
        </Text>
      )}

      <Text style={styles.sectionHeader}>DECISION</Text>
      <Text style={styles.gateHint}>
        {patchCount > 0
          ? patchCount + ' patch(es) selected. APPLY builds one signed APK.'
          : 'No patches selected. EXPORT saves the report only.'}
      </Text>
      <View style={styles.btnRow}>
        <Pressable onPress={onApply} disabled={!!busy || patchCount === 0}
          style={[styles.btn, { flex: 1 },
                  (busy || patchCount === 0) && styles.btnDisabled]}>
          <Text style={styles.btnText}>
            {busy === 'apply' ? 'BUILDING…' : 'APPLY (' + patchCount + ')'}
          </Text>
        </Pressable>
        <Pressable onPress={onExport} disabled={!!busy}
          style={[styles.btnAlt, { flex: 1 }, busy && styles.btnDisabled]}>
          <Text style={styles.btnAltText}>
            {busy === 'export' ? 'EXPORTING…' : 'EXPORT ONLY'}
          </Text>
        </Pressable>
      </View>
      {busy && <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />}
    </View>
  );
}
