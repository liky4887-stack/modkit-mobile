import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { TopBar, Panel, SovereignLink, PatchPlanPanel } from '@/components';
import { factoryExec } from '@/api/factory';
import { useRouter } from 'expo-router';
import {
  ChevronLeft, ChevronRight, Check, FileUp, Search, GitBranch,
  Eye, Package, Download, AlertTriangle, CircleCheck, CircleX, CircleSlash,
  Upload, X,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';

import { PHASES, PHASE_FEATURES } from '@/engine/phases';
import { runPhase } from '@/engine/runner';
import { loadFeatureData, clearFeatureCache, getLastResponse } from '@/engine/realFeatures';
import { persistScan, attachPlanToScan } from '@/hooks/useScanStore';
import { fingerprintApk } from '@/db/scans';
import { featureMap } from '@/features/registry';
import { runGhostSuiteAnalysis } from '@/engine/ghost-suite';
import type { FeatureResult, HandlerContext, UploadedFile, WorkflowPhase } from '@/engine/types';

type StepId = 'import' | WorkflowPhase;

const STEPS: { id: StepId; label: string; icon: any }[] = [
  { id: 'import', label: 'Import', icon: FileUp },
  { id: 'investigate', label: 'Investigate', icon: Search },
  { id: 'analyze', label: 'Analyze', icon: Search },
  { id: 'edit', label: 'Edit', icon: GitBranch },
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'build', label: 'Build', icon: Package },
  { id: 'export', label: 'Export', icon: Download },
];

type LogLine = { level: string; msg: string; ts: number };

export default function PatchScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [apk, setApk] = useState<UploadedFile | null>(null);
  const [obb, setObb] = useState<UploadedFile | null>(null);
  const [results, setResults] = useState<Record<string, FeatureResult[]>>({});
  const [running, setRunning] = useState(false);
  const [currentFeatureId, setCurrentFeatureId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);

  // ── Real backend state ──────────────────────────────────────────
  const [apkPath, setApkPath] = useState('');
  const [realLoading, setRealLoading] = useState(false);
  const [realError, setRealError] = useState<string | null>(null);
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);

  const currentStepId: StepId = STEPS[step].id;

  // ---------- Multi-file picker: pick APK + OBB in one go ----------
  const pickBoth = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (r.canceled) return;

      let newApk: UploadedFile | null = null;
      let newObb: UploadedFile | null = null;
      const leftovers: string[] = [];

      for (const a of r.assets) {
        const lower = a.name.toLowerCase();
        const uploaded: UploadedFile = {
          uri: a.uri,
          name: a.name,
          size: a.size ?? 0,
          mimeType: a.mimeType,
        };
        if (lower.endsWith('.apk')) newApk = uploaded;
        else if (lower.endsWith('.obb')) newObb = uploaded;
        else leftovers.push(a.name);
      }

      if (newApk) setApk(newApk);
      if (newObb) setObb(newObb);

      if (!newApk && !newObb) {
        Alert.alert(
          'Unrecognized files',
          `Picked ${r.assets.length} file(s) but none ended in .apk or .obb.`,
        );
      } else if (leftovers.length > 0) {
        Alert.alert('Ignored', `Skipped: ${leftovers.join(', ')}`);
      }
    } catch {
      Alert.alert('Error', 'Could not pick files.');
    }
  };

  // ---------- Single-file replace ----------
  const pickOne = async (kind: 'apk' | 'obb') => {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (r.canceled) return;
      const a = r.assets[0];
      const uploaded: UploadedFile = {
        uri: a.uri,
        name: a.name,
        size: a.size ?? 0,
        mimeType: a.mimeType,
      };
      if (kind === 'apk') setApk(uploaded);
      else setObb(uploaded);
    } catch {
      Alert.alert('Error', 'Could not pick file.');
    }
  };

  const clearFile = (kind: 'apk' | 'obb') => {
    if (kind === 'apk') setApk(null);
    else setObb(null);
  };

  const clearAll = () => {
    setApk(null);
    setObb(null);
    setResults({});
    setLogs([]);
    setStep(0);
  };

  const formatSize = (b: number) => {
    if (!b) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
  };

  const runningRef = React.useRef(false);

  const runCurrentPhase = useCallback(async (phase: WorkflowPhase) => {
    setRunning(true);
    setResults((prev) => ({ ...prev, [phase]: [] }));

    // Preload real feature data for this APK
    try {
      await loadFeatureData(apkPath.trim());
    } catch (e) {
      setLogs((l) => [...l, {
        level: 'error',
        msg: 'feature preload failed: ' + (e instanceof Error ? e.message : String(e)),
        ts: Date.now(),
      }]);
    }

    const ctx: HandlerContext = {
      apk: apkPath.trim() ? {
        name: apkPath.split('/').pop() || 'target.apk',
        size: 0,
        uri: apkPath.trim(),
        mimeType: 'application/vnd.android.package-archive',
      } : null,
      obb: null,
      results: {},
      log: (level, msg) => setLogs((l) => [...l, { level, msg, ts: Date.now() }]),
    };

    const phaseResults = await runPhase(phase, ctx, (r) => {
      setCurrentFeatureId(r.featureId);
      setResults((prev) => ({ ...prev, [phase]: [...(prev[phase] ?? []), r] }));
    });

    setRunning(false);
    setCurrentFeatureId(null);
    return phaseResults;
  }, [apkPath]);

  const handleBack = () => {
    if (running) return;
    if (step > 0) setStep(step - 1);
    else router.back();
  };

  const handleNext = async () => {
    if (realLoading || running) return;

    // Step 0 (import) → verify path → move to investigate and run it
    if (step === 0) {
      const path = apkPath.trim();
      if (!path) {
        Alert.alert(
          'No APK path',
          'Enter the absolute path, e.g. /storage/emulated/0/SHAREit Lite/apps/PUBG_MOBILE.apk',
        );
        return;
      }
      setRealError(null);
      setRealLoading(true);
      try {
        const exists = await factoryExec.apkExists(path);
        if (!exists) throw new Error(`File not found or unreadable: ${path}`);
        clearFeatureCache();
        setStep(1);
        setRealLoading(false);
        await runCurrentPhase('investigate');

        // Persist scan to local DB
        const resp = getLastResponse();
        if (resp) {
          const apkName = path.split('/').pop() || 'target.apk';
          const apkHash = await fingerprintApk(path, apkName, resp.apkSize);
          const features = Object.values(resp.features).map((f) => ({
            featureId: f.id,
            status: f.status,
            message: f.message,
            totalHits: f.totalHits,
            dexCount: f.dexCount,
            patterns: f.patterns,
            topSignalClass: f.hits[0]?.signalClasses?.[0] ?? null,
            rawJson: { hits: f.hits.slice(0, 5) },
          }));
          const scanId = await persistScan({
            apkPath: path,
            apkName,
            apkSize: resp.apkSize,
            apkHash,
            elapsedMs: resp.elapsedMs,
            dexTotal: resp.dexTotal,
            dexParsed: resp.dexParsed,
            totalClasses: resp.totalClasses,
            features,
          });
          setCurrentScanId(scanId);
        }
      } catch (e) {
        setRealError(e instanceof Error ? e.message : String(e));
        setRealLoading(false);
      }
      return;
    }

    if (step === STEPS.length - 1) {
      router.push('/(tabs)' as never);
      return;
    }

    const nextStep = step + 1;
    setStep(nextStep);
    const nextPhase = STEPS[nextStep].id as WorkflowPhase;
    await runCurrentPhase(nextPhase);
  };

  const canContinue = !running && !realLoading;
  const bothReady = !!apk; // OBB optional — APK alone is enough

  return (
    <View style={styles.container}>
      <TopBar
        title="PATCH WORKFLOW"
        subtitle={`step ${step + 1} / ${STEPS.length} · ${STEPS[step].label.toLowerCase()}`}
        onLeftPress={handleBack}
        showBack
        statusColor={colors.accent}
      />

      <SovereignLink />

      <View style={styles.stepBar}>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <View key={s.id} style={styles.stepItem}>
              <View style={[styles.stepIcon, isActive && styles.stepIconActive, isDone && styles.stepIconDone]}>
                <Icon size={13} color={isActive ? colors.pureBlack : isDone ? colors.accent : colors.textTertiary} strokeWidth={2} />
              </View>
              {i < STEPS.length - 1 && <View style={[styles.stepConnector, isDone && styles.stepConnectorDone]} />}
            </View>
          );
        })}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
            <Panel title="APK PATH ON DEVICE">
              <Text style={styles.pathHelp}>
                Enter the absolute path. The Termux backend reads the file directly —
                no upload, works for multi-gigabyte APKs.
              </Text>
              <TextInput
                value={apkPath}
                onChangeText={setApkPath}
                placeholder="/storage/emulated/0/SHAREit Lite/apps/PUBG_MOBILE.apk"
                placeholderTextColor={colors.textTertiary}
                style={styles.pathInput}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!realLoading}
              />
            </Panel>
            {realError && (
              <View style={{ marginTop: spacing.sm }}>
                <Panel title="ERROR">
                  <Text style={{ fontFamily: 'Inter-Regular', fontSize: 12, color: colors.danger }}>
                    {realError}
                  </Text>
                </Panel>
              </View>
            )}
          </View>
        )}

        {step > 0 && step !== 5 && (
          <PhaseStep
            phase={currentStepId as WorkflowPhase}
            results={results[currentStepId] ?? []}
            running={running}
            currentFeatureId={currentFeatureId}
            logs={logs}
          />
        )}

        {step === 5 && (
          <View>
            <PhaseStep
              phase={'build' as WorkflowPhase}
              results={results['build'] ?? []}
              running={running}
              currentFeatureId={currentFeatureId}
              logs={logs}
            />
            <View style={{ height: spacing.md }} />
            <PatchPlanPanel
              apkPath={apkPath}
              onPlanReady={(plan, goal) => {
                if (currentScanId) {
                  void attachPlanToScan(currentScanId, plan, goal);
                }
              }}
            />
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.navBtn, running && styles.navBtnDisabled]}
          activeOpacity={0.7}
          onPress={handleBack}
          disabled={running}
        >
          <ChevronLeft size={18} color={colors.textSecondary} strokeWidth={2} />
          <Text style={styles.navBtnText}>{step === 0 ? 'Back' : 'Previous'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnPrimary, !canContinue && styles.navBtnDisabled]}
          activeOpacity={0.7}
          onPress={handleNext}
          disabled={!canContinue}
        >
          {running ? (
            <>
              <ActivityIndicator size="small" color={colors.pureBlack} />
              <Text style={styles.navBtnPrimaryText}>Running…</Text>
            </>
          ) : (
            <>
              <Text style={styles.navBtnPrimaryText}>
                {step === STEPS.length - 1 ? 'Done' : 'Next'}
              </Text>
              {step === STEPS.length - 1
                ? <Check size={18} color={colors.pureBlack} strokeWidth={2} />
                : <ChevronRight size={18} color={colors.pureBlack} strokeWidth={2} />}
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------- Import Step ----------

function ImportStep({
  apk, obb, bothReady, onPickBoth, onReplace, onClear, onClearAll, formatSize,
}: {
  apk: UploadedFile | null;
  obb: UploadedFile | null;
  bothReady: boolean;
  onPickBoth: () => void;
  onReplace: (kind: 'apk' | 'obb') => void;
  onClear: (kind: 'apk' | 'obb') => void;
  onClearAll: () => void;
  formatSize: (b: number) => string;
}) {
  const total = (apk?.size ?? 0) + (obb?.size ?? 0);
  const hasAny = !!(apk || obb);

  return (
    <View style={styles.section}>
      <Text style={styles.stepTitle}>Import</Text>
      <Text style={styles.stepDesc}>
        Pick the modified <Text style={{ color: colors.accent }}>APK</Text> and{' '}
        <Text style={{ color: colors.cyan }}>OBB</Text> together — one trip to the file picker,
        both files loaded at once.
      </Text>

      <View style={styles.sectionSpacing} />

      {/* Main: pick both at once */}
      <TouchableOpacity
        style={[styles.pickBothBtn, bothReady && styles.pickBothBtnReady]}
        activeOpacity={0.8}
        onPress={onPickBoth}
      >
        <View style={styles.pickBothIcon}>
          <Upload size={22} color={bothReady ? colors.accent : colors.pureBlack} strokeWidth={2.2} />
        </View>
        <View style={styles.pickBothText}>
          <Text style={[styles.pickBothTitle, bothReady && { color: colors.accent }]}>
            {bothReady ? 'Replace APK + OBB' : 'Select APK + OBB'}
          </Text>
          <Text style={[styles.pickBothSub, bothReady && { color: colors.textSecondary }]}>
            {bothReady
              ? 'Both files loaded — tap to change'
              : 'Long-press to select both files in one picker session'}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.sectionSpacing} />

      {/* Individual file slots */}
      <FileSlot
        label="APK"
        accent={colors.accent}
        file={apk}
        onReplace={() => onReplace('apk')}
        onClear={() => onClear('apk')}
        formatSize={formatSize}
        hint="Tap to pick just the APK"
      />

      <View style={styles.sectionSpacing} />

      <FileSlot
        label="OBB"
        accent={colors.cyan}
        file={obb}
        onReplace={() => onReplace('obb')}
        onClear={() => onClear('obb')}
        formatSize={formatSize}
        hint="Tap to pick just the OBB"
      />

      <View style={styles.obbHint}>
        <Text style={styles.obbHintTitle}>OBB IS OPTIONAL</Text>
        <Text style={styles.obbHintBody}>
          If the OBB is packed inside your APK (common for modified builds), skip this
          slot and just tap Next. The builder reads the APK end-to-end on the Termux
          backend — no on-device scan, no size limit, works for multi-gigabyte APKs.
        </Text>
      </View>





      <View style={styles.sectionSpacing} />

      <Panel title="Status">
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>APK</Text>
          <Text style={[styles.statusValue, { color: apk ? colors.accent : colors.textTertiary }]}>
            {apk ? 'READY' : 'MISSING'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>OBB</Text>
          <Text style={[styles.statusValue, { color: obb ? colors.cyan : colors.textTertiary }]}>
            {obb ? 'READY' : 'MISSING'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Total</Text>
          <Text style={styles.statusValue}>{total ? formatSize(total) : '—'}</Text>
        </View>
        <View style={[styles.statusRow, styles.statusRowLast]}>
          <Text style={styles.statusLabel}>Pipeline</Text>
          <Text style={[styles.statusValue, { color: bothReady ? colors.accent : colors.warning }]}>
            {bothReady ? 'FULL' : hasAny ? 'PARTIAL' : 'IDLE'}
          </Text>
        </View>
      </Panel>

      {hasAny && (
        <>
          <View style={styles.sectionSpacing} />
          <TouchableOpacity style={styles.clearAllBtn} activeOpacity={0.7} onPress={onClearAll}>
            <X size={14} color={colors.textSecondary} strokeWidth={2} />
            <Text style={styles.clearAllText}>CLEAR ALL FILES</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function FileSlot({
  label, accent, file, onReplace, onClear, formatSize, hint,
}: {
  label: string;
  accent: string;
  file: UploadedFile | null;
  onReplace: () => void;
  onClear: () => void;
  formatSize: (b: number) => string;
  hint: string;
}) {
  const filled = !!file;
  return (
    <View>
      <Text style={styles.subLabel}>{label} File</Text>
      <TouchableOpacity
        style={[styles.uploadCard, filled && { borderStyle: 'solid', borderColor: accent }]}
        activeOpacity={0.7}
        onPress={onReplace}
      >
        <View style={styles.uploadIconWrap}>
          <Package size={22} color={filled ? accent : colors.textTertiary} strokeWidth={2} />
        </View>
        <View style={styles.uploadInfo}>
          <Text style={styles.uploadName} numberOfLines={1}>
            {file ? file.name : `Choose ${label} file`}
          </Text>
          <Text style={styles.uploadMeta}>
            {file ? `${formatSize(file.size)} · tap to replace` : hint}
          </Text>
        </View>
        {filled && (
          <TouchableOpacity onPress={onClear} hitSlop={10} style={styles.clearIconBtn}>
            <X size={16} color={colors.textTertiary} strokeWidth={2} />
          </TouchableOpacity>
        )}
        {filled && <Check size={20} color={accent} strokeWidth={2} />}
      </TouchableOpacity>
    </View>
  );
}

// ---------- Phase Step ----------

function PhaseStep({
  phase, results, running, currentFeatureId, logs,
}: {
  phase: WorkflowPhase;
  results: FeatureResult[];
  running: boolean;
  currentFeatureId: string | null;
  logs: LogLine[];
}) {
  const meta = PHASES.find((p) => p.id === phase)!;
  const ids = PHASE_FEATURES[phase] ?? [];
  const byId = new Map(results.map((r) => [r.featureId, r]));
  const doneCount = results.length;
  const hasErrors = results.some((r) => r.status === 'error');
  const hasWarnings = results.some((r) => r.status === 'warn');

  return (
    <View style={styles.section}>
      <Text style={styles.stepTitle}>{meta.label}</Text>
      <Text style={styles.stepDesc}>{meta.description}</Text>

      <View style={styles.sectionSpacing} />
      <Panel title={`${doneCount} / ${ids.length} features`} noPadding>
        {ids.map((id) => {
          const feature = featureMap[id];
          const r = byId.get(id);
          const isRunning = running && currentFeatureId === id;
          const isPending = !r && !isRunning;
          return (
            <View key={id} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                {isRunning ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : r?.status === 'ok' ? (
                  <CircleCheck size={16} color={colors.accent} strokeWidth={2} />
                ) : r?.status === 'warn' ? (
                  <AlertTriangle size={16} color={colors.warning} strokeWidth={2} />
                ) : r?.status === 'error' ? (
                  <CircleX size={16} color={colors.danger} strokeWidth={2} />
                ) : r?.status === 'skipped' ? (
                  <CircleSlash size={16} color={colors.textTertiary} strokeWidth={2} />
                ) : (
                  <View style={styles.pendingDot} />
                )}
              </View>
              <View style={styles.featureInfo}>
                <Text style={[styles.featureName, isPending && styles.featureNamePending]}>
                  {feature?.shortName ?? id}
                </Text>
                <Text style={styles.featureMsg} numberOfLines={2}>
                  {r?.message ?? (isRunning ? 'Running…' : 'Pending')}
                </Text>
                {r?.data && (
                  <View style={styles.dataRow}>
                    {Object.entries(r.data).slice(0, 3).map(([k, v]) => (
                      <View key={k} style={styles.dataChip}>
                        <Text style={styles.dataChipKey}>{k}</Text>
                        <Text style={styles.dataChipVal}>{String(v)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              {r && <Text style={styles.duration}>{r.durationMs}ms</Text>}
            </View>
          );
        })}
      </Panel>

      {(hasErrors || hasWarnings) && (
        <>
          <View style={styles.sectionSpacing} />
          <Panel title="Summary">
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Errors</Text>
              <Text style={[styles.statusValue, { color: hasErrors ? colors.danger : colors.textTertiary }]}>
                {results.filter((r) => r.status === 'error').length}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Warnings</Text>
              <Text style={[styles.statusValue, { color: hasWarnings ? colors.warning : colors.textTertiary }]}>
                {results.filter((r) => r.status === 'warn').length}
              </Text>
            </View>
            <View style={[styles.statusRow, styles.statusRowLast]}>
              <Text style={styles.statusLabel}>OK</Text>
              <Text style={[styles.statusValue, { color: colors.accent }]}>
                {results.filter((r) => r.status === 'ok').length}
              </Text>
            </View>
          </Panel>
        </>
      )}

      {logs.length > 0 && (
        <>
          <View style={styles.sectionSpacing} />
          <Panel title="Log Stream" noPadding>
            <ScrollView style={styles.logScroll} nestedScrollEnabled>
              {logs.slice(0, 30).map((l, i) => (
                <View key={`${l.ts}-${i}`} style={styles.logRow}>
                  <View style={[styles.logDot, { backgroundColor: levelColor(l.level) }]} />
                  <Text style={styles.logText} numberOfLines={1}>{l.msg}</Text>
                </View>
              ))}
            </ScrollView>
          </Panel>
        </>
      )}
    </View>
  );
}

function levelColor(level: string): string {
  switch (level) {
    case 'error': return colors.danger;
    case 'warn': return colors.warning;
    case 'success': return colors.accent;
    case 'debug': return colors.textTertiary;
    default: return colors.cyan;
  }
}

const styles = StyleSheet.create({
  pathHelp: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  pathInput: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: colors.textPrimary,
    backgroundColor: colors.pureBlack,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  obbHint: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  obbHintTitle: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: colors.cyan,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  obbHintBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  embeddedBanner: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accentDim ?? 'rgba(0,255,136,0.35)',
    backgroundColor: colors.accentGlow ?? 'rgba(0,255,136,0.10)',
  },
  embeddedTitle: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  embeddedBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginBottom: 4,
  },
  embeddedEntry: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: colors.textTertiary,
    lineHeight: 15,
  },
  embeddedWarn: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.35)',
    backgroundColor: 'rgba(255,184,0,0.10)',
  },
  embeddedWarnText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: colors.warning,
  },
  container: { flex: 1, backgroundColor: colors.pureBlack },
  stepBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepIconActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepIconDone: { backgroundColor: colors.accentGlow, borderColor: colors.accent },
  stepConnector: { width: 10, height: 1, backgroundColor: colors.border, marginHorizontal: 2 },
  stepConnectorDone: { backgroundColor: colors.accent },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md },
  section: { marginTop: spacing.sm },
  sectionSpacing: { height: spacing.md },
  stepTitle: { fontFamily: 'Inter-Bold', fontSize: 18, color: colors.textPrimary, letterSpacing: -0.3 },
  stepDesc: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.textTertiary, marginTop: 4, lineHeight: 18 },
  subLabel: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },

  // Big pick-both button
  pickBothBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
  },
  pickBothBtnReady: {
    backgroundColor: colors.accentGlow,
    borderWidth: 1, borderColor: colors.accent,
  },
  pickBothIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  pickBothText: { flex: 1 },
  pickBothTitle: { fontFamily: 'Inter-Bold', fontSize: 15, color: colors.pureBlack, letterSpacing: -0.2 },
  pickBothSub: { fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(0,0,0,0.6)', marginTop: 2 },

  uploadCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', padding: spacing.md, gap: spacing.sm },
  uploadIconWrap: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  uploadInfo: { flex: 1 },
  uploadName: { fontFamily: 'JetBrainsMono-Bold', fontSize: 13, color: colors.textPrimary },
  uploadMeta: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  clearIconBtn: { padding: 4 },

  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  statusRowLast: { borderBottomWidth: 0 },
  statusLabel: { fontFamily: 'JetBrainsMono-Regular', fontSize: 12, color: colors.textTertiary },
  statusValue: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12, color: colors.textPrimary },

  clearAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm + 2 },
  clearAllText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.textSecondary, letterSpacing: 0.5 },

  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  featureIconWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  pendingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  featureInfo: { flex: 1 },
  featureName: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12, color: colors.textPrimary },
  featureNamePending: { color: colors.textTertiary },
  featureMsg: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
  dataRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  dataChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceElevated, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  dataChipKey: { fontFamily: 'JetBrainsMono-Regular', fontSize: 9, color: colors.textTertiary },
  dataChipVal: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: colors.cyan },
  duration: { fontFamily: 'JetBrainsMono-Regular', fontSize: 9, color: colors.textTertiary, marginTop: 4 },

  logScroll: { maxHeight: 180 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  logDot: { width: 6, height: 6, borderRadius: 3 },
  logText: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textSecondary, flex: 1 },

  bottomBar: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  navBtnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 13, color: colors.textSecondary },
  navBtnPrimaryText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 13, color: colors.pureBlack },
});

// ---------- Route-level error boundary ----------
// If anything in this screen throws, we show a recovery screen
// instead of crashing the whole app.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.pureBlack, padding: spacing.lg, justifyContent: 'center' }}>
      <Text style={{ color: colors.danger, fontFamily: 'JetBrainsMono-Bold', fontSize: 16, letterSpacing: 0.5, marginBottom: spacing.sm }}>
        PATCH SCREEN ERROR
      </Text>
      <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 13, marginBottom: spacing.lg, lineHeight: 18 }}>
        {error.message || 'Something went wrong.'}
      </Text>
      <TouchableOpacity
        onPress={retry}
        style={{
          backgroundColor: colors.accent,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: colors.pureBlack, fontFamily: 'Inter-Bold', fontSize: 14 }}>
          Reload Workflow
        </Text>
      </TouchableOpacity>
    </View>
  );
}
