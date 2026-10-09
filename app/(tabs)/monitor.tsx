// MONITOR — live task view of the current pipeline run.
// Reads from pipelineStore every second, shows each phase in plain
// language, tracks progress, surfaces findings + the enhanced APK.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  Pressable, Linking,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';
import {
  pipelineStore,
  PHASES_ORDER,
  type JobRecord,
  type PhaseRecord,
  type UnitRecord,
  type FindingRecord,
} from '@/pipeline/pipelineStore';

// ─── Plain language for each phase ───────────────────────────────
const PHASE_INFO: Record<string, { label: string; hint: string; estimateMs: number }> = {
  import:      { label: 'Load the app',         hint: 'Reading the APK file into memory', estimateMs: 8_000 },
  partition:   { label: 'Split into work',      hint: 'Finding SDKs and modules to inspect', estimateMs: 25_000 },
  dispatch:    { label: 'Queue the work',       hint: 'Assigning each unit a slot',         estimateMs: 1_000 },
  investigate: { label: 'Investigate each unit', hint: 'Deep dive — classes, SDKs, data flows', estimateMs: 1_800_000 },
  coordinate:  { label: 'Combine findings',     hint: 'Merging every report into one plan', estimateMs: 30_000 },
  findings:    { label: 'Write task list',      hint: 'Turning notes into actionable tasks', estimateMs: 90_000 },
  propose:     { label: 'Draft the fixes',      hint: 'Writing what each fix should be',    estimateMs: 300_000 },
  verify:      { label: 'Verify the fixes',     hint: 'Checking each fix is valid',         estimateMs: 90_000 },
  apply:       { label: 'Build enhanced APK',   hint: 'Patching, re-signing the app',       estimateMs: 120_000 },
  export:      { label: 'Save the results',     hint: 'Writing reports and artifacts',      estimateMs: 45_000 },
  audit:       { label: 'Final check',          hint: 'Summary of the run',                 estimateMs: 2_000 },
};

function phaseIcon(state: string): string {
  if (state === 'done') return '✓';
  if (state === 'running') return '◐';
  if (state === 'failed') return '✕';
  return '○';
}

function phaseColor(state: string): string {
  if (state === 'done') return '#34C759';
  if (state === 'running') return colors.accent;
  if (state === 'failed') return '#FF3B30';
  return colors.textTertiary;
}

function shortDuration(ms: number | null | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60_000) return (ms / 1000).toFixed(1) + 's';
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return min + 'm ' + sec + 's';
}

export default function MonitorTab() {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [phases, setPhases] = useState<PhaseRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tickNow, setTickNow] = useState(Date.now());
  const lastJobId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const jobs = await pipelineStore.listJobs(5);
    if (!jobs.length) {
      setJob(null); setPhases([]); setUnits([]); setFindings([]); setPlan(null);
      return;
    }
    const j = jobs[0];
    setJob(j);
    const [ph, un, fn, pl] = await Promise.all([
      pipelineStore.getPhases(j.id),
      pipelineStore.listUnits(j.id),
      pipelineStore.listFindings(j.id),
      pipelineStore.getJobPlan(j.id),
    ]);
    setPhases(ph);
    setUnits(un);
    setFindings(fn);
    setPlan(pl);
    lastJobId.current = j.id;
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      setTickNow(Date.now());
      void load();
    }, 1000);
    return () => clearInterval(t);
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ─── Derived progress ────────────────────────────────────────
  const derived = useMemo(() => {
    if (!job || !phases.length) return null;

    const byName: Record<string, PhaseRecord> = {};
    for (const p of phases) byName[p.phase] = p;

    const totalEstimated = PHASES_ORDER.reduce(
      (acc, ph) => acc + (PHASE_INFO[ph]?.estimateMs || 10_000), 0,
    );

    let completedMs = 0;
    let currentPhase: string | null = null;
    let currentProgress = 0; // 0..1 within current phase
    let elapsedTotal = 0;

    for (const ph of PHASES_ORDER) {
      const rec = byName[ph];
      const est = PHASE_INFO[ph]?.estimateMs || 10_000;
      if (rec?.state === 'done') {
        completedMs += est;
      } else if (rec?.state === 'failed') {
        // stop accounting here
        currentPhase = ph;
        break;
      } else if (rec?.state === 'running' || (!currentPhase && rec)) {
        currentPhase = ph;
        // If investigate, use unit progress
        if (ph === 'investigate' && units.length > 0) {
          const doneCount = units.filter(u => u.state === 'done' || u.state === 'failed').length;
          currentProgress = doneCount / units.length;
          completedMs += est * currentProgress;
        } else {
          // fallback: time within estimate
          const started = rec?.startedAt ?? job.startedAt;
          const inPhase = Date.now() - started;
          currentProgress = Math.min(1, inPhase / est);
          completedMs += est * currentProgress;
        }
        break;
      } else {
        currentPhase = ph;
        break;
      }
    }

    elapsedTotal = job.startedAt ? Date.now() - job.startedAt : 0;
    const pct = job.state === 'done' ? 1 : Math.min(0.99, completedMs / totalEstimated);
    const remainingMs = Math.max(0, totalEstimated - completedMs);

    return { byName, currentPhase, currentProgress, pct, remainingMs, elapsedTotal };
  }, [job, phases, units, tickNow]);

  const enhancedApk = plan?.enhanced_apk || plan?.recombination?.final_apk || null;

  if (!job) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}><Text style={styles.topBarTitle}>MODKIT · MONITOR</Text></View>
        <View style={{ padding: spacing.md }}>
          <Text style={styles.emptyText}>No job yet. Open JOBS and tap RUN PIPELINE.</Text>
        </View>
      </View>
    );
  }

  const info = derived?.currentPhase ? PHASE_INFO[derived.currentPhase] : null;
  const isRunning = job.state !== 'done' && job.state !== 'failed';

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · MONITOR</Text>
        <Text style={styles.topBarSub}>{job.apkName || job.id.slice(0, 8)}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        {/* Big status card */}
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>
            {job.state === 'done' ? 'DONE' : job.state === 'failed' ? 'FAILED' : 'RUNNING'}
          </Text>
          {info && isRunning && (
            <>
              <Text style={styles.statusTitle}>{info.label}</Text>
              <Text style={styles.statusHint}>{info.hint}</Text>
            </>
          )}
          {job.state === 'done' && (
            <>
              <Text style={styles.statusTitle}>Everything finished</Text>
              <Text style={styles.statusHint}>
                Took {shortDuration(derived?.elapsedTotal)}
              </Text>
            </>
          )}
          {job.state === 'failed' && (
            <>
              <Text style={styles.statusTitle}>Stopped at {info?.label}</Text>
              <Text style={styles.statusHint}>{job.error || 'unknown error'}</Text>
            </>
          )}

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[
              styles.progressFill,
              { width: `${((derived?.pct || 0) * 100).toFixed(1)}%` as any },
              job.state === 'failed' && { backgroundColor: '#FF3B30' },
            ]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.progressText}>
              {((derived?.pct || 0) * 100).toFixed(0)}%
            </Text>
            <Text style={styles.progressText}>
              {isRunning
                ? `about ${shortDuration(derived?.remainingMs)} left`
                : `elapsed ${shortDuration(derived?.elapsedTotal)}`}
            </Text>
          </View>
        </View>

        {/* Task bullet list */}
        <View style={styles.block}>
          <Text style={styles.blockLabel}>TASKS</Text>
          {PHASES_ORDER.map((ph) => {
            const rec = derived?.byName[ph];
            const state = rec?.state || 'pending';
            const info = PHASE_INFO[ph];
            const isCurrent = derived?.currentPhase === ph && isRunning;
            const detail: string[] = [];
            if (state === 'done' && rec?.finishedAt && rec?.startedAt) {
              detail.push(shortDuration(rec.finishedAt - rec.startedAt));
            }
            if (state === 'done' && rec?.summary) {
              detail.push(rec.summary.length > 100 ? rec.summary.slice(0, 100) + '…' : rec.summary);
            }
            if (ph === 'investigate' && isCurrent && units.length > 0) {
              const done = units.filter(u => u.state === 'done' || u.state === 'failed').length;
              const runningAll = units.filter(u => u.state === 'running').map(u => u.name);
              detail.push(`${done} of ${units.length} units · ${runningAll.length} running now`);
              const runningNames = runningAll.slice(0, 3);
              if (runningNames.length > 0) {
                const overflow = runningAll.length > runningNames.length
                  ? ` +${runningAll.length - runningNames.length} more`
                  : '';
                detail.push('now: ' + runningNames.join(', ') + overflow);
              }
            }
            if (ph === 'findings' && findings.length > 0) {
              const sevCounts = findings.reduce<Record<string, number>>((a, x) => {
                a[x.severity] = (a[x.severity] || 0) + 1; return a;
              }, {});
              const s = ['critical','high','medium','low','info']
                .filter(k => sevCounts[k])
                .map(k => `${sevCounts[k]} ${k}`).join(', ');
              detail.push(`${findings.length} total (${s})`);
            }
            if (ph === 'apply' && state === 'running') {
              const approved = findings.filter(x => x.appliedState === 'approved').length;
              detail.push(approved ? `${approved} approved finding(s) queued` : 'waiting for approved findings');
            }
            return (
              <View key={ph} style={styles.taskRow}>
                <Text style={[styles.taskIcon, { color: phaseColor(state) }]}>
                  {phaseIcon(state)}
                </Text>
                <View style={styles.taskBody}>
                  <Text style={[
                    styles.taskLabel,
                    state === 'done' && styles.taskLabelDone,
                    isCurrent && styles.taskLabelActive,
                  ]}>
                    {info?.label || ph}
                  </Text>
                  {isCurrent && (
                    <Text style={styles.taskHint}>{info?.hint}</Text>
                  )}
                  {detail.length > 0 && (
                    <Text style={styles.taskDetail}>{detail.join(' · ')}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Findings summary during the run */}
        {findings.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>WHAT WE FOUND ({findings.length})</Text>
            {['critical', 'high', 'medium', 'low', 'info'].map(sev => {
              const n = findings.filter(f => f.severity === sev).length;
              if (!n) return null;
              const color =
                sev === 'critical' ? '#FF3B30' :
                sev === 'high' ? '#FF9500' :
                sev === 'medium' ? '#FFCC00' :
                sev === 'low' ? '#34C759' : '#8E8E93';
              return (
                <View key={sev} style={styles.findingRow}>
                  <View style={[styles.sevDot, { backgroundColor: color }]} />
                  <Text style={styles.findingCount}>{n}</Text>
                  <Text style={styles.findingLabel}>{sev}</Text>
                </View>
              );
            })}
            <Text style={styles.smallHint}>Open FINDINGS tab for details.</Text>
          </View>
        )}

        {/* Enhanced APK download */}
        {enhancedApk && (
          <Pressable
            onPress={() => { try { Linking.openURL('file://' + enhancedApk); } catch {} }}
            style={styles.downloadCard}
          >
            <Text style={styles.downloadTitle}>ENHANCED APK READY</Text>
            <Text style={styles.downloadPath} numberOfLines={2}>{enhancedApk}</Text>
            {plan?.final_size && (
              <Text style={styles.downloadMeta}>
                {(plan.final_size / 1e9).toFixed(2)} GB · tap to open
              </Text>
            )}
            {plan?.orchestration_verdict && (
              <Text style={styles.downloadMeta}>verdict: {plan.orchestration_verdict}</Text>
            )}
          </Pressable>
        )}

        {/* Audit block when done */}
        {job.state === 'done' && plan && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>AUDIT</Text>
            {plan.integrity && (
              <>
                <Text style={styles.auditLine}>
                  dex count: {plan.integrity.orig_dex_count} → {plan.integrity.new_dex_count}
                  {plan.integrity.dex_count_preserved ? ' ✓' : ' ✕'}
                </Text>
                <Text style={styles.auditLine}>
                  other files intact: {plan.integrity.non_target_dexes_intact ? 'yes ✓' : 'no ✕'}
                </Text>
              </>
            )}
            {plan.signature && (
              <Text style={styles.auditLine}>
                signature: {plan.signature.ok ? 'verified ✓' : 'failed ✕'}
              </Text>
            )}
            {plan.follow_back && plan.follow_back.length > 0 && (
              <Text style={styles.auditLine}>
                follow-back: {plan.follow_back.every((f: any) => f.checks?.every((c: any) => c.postcondition_in_final_apk))
                  ? 'all patches present ✓' : 'some missing ✕'}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBarTitle: {
    color: colors.accent,
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 2,
  },
  topBarSub: {
    color: colors.textTertiary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    marginTop: 3,
  },
  content: { padding: spacing.md, paddingBottom: 40 },
  emptyText: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 12 },

  statusCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  statusLabel: {
    color: colors.accent,
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 6,
  },
  statusTitle: {
    color: colors.textPrimary,
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    marginBottom: 4,
  },
  statusHint: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    marginBottom: 12,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.pureBlack,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 6,
  },
  progressFill: {
    height: 6,
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    color: colors.textTertiary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
  },

  block: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  blockLabel: {
    color: colors.accent,
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 10,
  },

  taskRow: { flexDirection: 'row', marginBottom: 10 },
  taskIcon: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 14,
    width: 22,
    marginTop: -2,
  },
  taskBody: { flex: 1 },
  taskLabel: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 12,
  },
  taskLabelDone: { color: colors.textPrimary },
  taskLabelActive: { color: colors.accent, fontFamily: 'Inter-SemiBold' },
  taskHint: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    marginTop: 2,
  },
  taskDetail: {
    color: colors.textTertiary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    marginTop: 3,
    opacity: 0.7,
  },

  findingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sevDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  findingCount: {
    color: colors.textPrimary,
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    width: 32,
  },
  findingLabel: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
  },
  smallHint: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    marginTop: 8,
  },

  downloadCard: {
    padding: spacing.md,
    backgroundColor: '#0A2A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#34C759',
    marginBottom: spacing.md,
  },
  downloadTitle: {
    color: '#34C759',
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 6,
  },
  downloadPath: {
    color: colors.textPrimary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  downloadMeta: {
    color: '#34C759',
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    marginTop: 4,
  },

  auditLine: {
    color: colors.textPrimary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    lineHeight: 17,
  },
});
