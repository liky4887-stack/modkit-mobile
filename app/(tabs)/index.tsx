// JOBS — the unified workflow page.
//
// One target. One scan. One gate review. One decision. That decision
// is either APPLY (build a signed APK with the selected patches) or
// EXPORT (write the report only).
//
// All the pipeline phases still run server-side (import → bots →
// features → nested → structural → anticheat → gates → review_gate).
// The review_gate pauses here, and this page renders the decision.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Alert, ActivityIndicator,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';
import { apkPicker } from '@/upload/apkPicker';
import { pipelineStore, JobRecord } from '@/pipeline/pipelineStore';
import { pipelineRunner } from '@/pipeline/pipelineRunner';
import { GateReview } from './GateReview';
import { styles } from './workflow.styles';

const BACKEND = 'http://127.0.0.1:8792';
const DEFAULT_APK = '/storage/emulated/0/Download/DxCheat.apk';

export default function WorkflowTab() {
  const [targetPath, setTargetPath] = useState(DEFAULT_APK);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [preGate, setPreGate] = useState<any>(null);
  const [gates, setGates] = useState<any>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  const [selectedLicense, setSelectedLicense] = useState<Record<string, boolean>>({});
  const [applyLogin, setApplyLogin] = useState(false);
  const [selectedFeatures, setSelectedFeatures] = useState<Record<string, boolean>>({});

  const loadJob = useCallback(async (jobId: string) => {
    const j = await pipelineStore.getJob(jobId);
    setCurrentJob(j);
    if (!j) return;
    const phases = await pipelineStore.getPhases(jobId);
    setSteps(phases.map((p: any) =>
      '[' + p.phase + '] ' + p.state + (p.summary ? ' — ' + p.summary : '')));

    try {
      const plan = await pipelineStore.getJobPlan(jobId);
      setPreGate((plan as any)?.pre_gate_summary || null);
      const g = (plan as any)?.gates || null;
      setGates(g);

      if (g) {
        const lic: Record<string, boolean> = {};
        for (const c of (g.license_gates || [])) {
          lic[c.class + '#' + c.method] = true;
        }
        setSelectedLicense(lic);
        setApplyLogin(!!g.login_redirect);
        const ft: Record<string, boolean> = {};
        for (const f of (g.patchable_features || [])) {
          ft[f.class + '#' + f.method] = true;
        }
        setSelectedFeatures(ft);
      }
    } catch {
      setPreGate(null);
      setGates(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const jobs = await pipelineStore.listJobs(1);
        if (jobs.length) await loadJob(jobs[0].id);
      } catch {}
    })();
  }, [loadJob]);

  const pickTarget = useCallback(async () => {
    try {
      const p = await apkPicker.pick();
      const target = p?.stagedPath || p?.sourceUri || null;
      if (target) setTargetPath(String(target));
    } catch (e) {
      Alert.alert('Pick failed', (e as Error).message);
    }
  }, []);

  const runPipeline = useCallback(async () => {
    if (running) return;
    if (!targetPath.trim()) { Alert.alert('No TARGET APK'); return; }

    setRunning(true);
    setSteps([]);
    setStatus('creating job…');
    setOutputPath(null);
    setPreGate(null);
    setGates(null);

    try {
      const name = targetPath.split('/').pop() || 'target.apk';
      const job = await pipelineStore.createJob({
        scanId: 'pipe-' + Date.now(),
        apkPath: targetPath.trim(),
        apkName: name,
        apkSize: 0,
      });
      await pipelineStore.createPhasesForJob(job.id);

      const startedAt = Date.now();
      const result = await pipelineRunner.run(job.id, {
        onPhase: (phase, state, summary) => {
          setSteps(prev => [...prev,
            '[' + phase + '] ' + state + (summary ? ' — ' + summary : '')]);
          const el = ((Date.now() - startedAt) / 1000).toFixed(1);
          setStatus('RUNNING · ' + phase + ' · ' + state + ' · ' + el + 's');
        },
      });

      const elapsed = result.finishedAt - result.startedAt;
      setStatus(result.finalState + ' · ' + result.outcomes.length +
        ' phases · ' + elapsed + 'ms');
      await loadJob(job.id);
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)));
    }
    setRunning(false);
  }, [running, targetPath, loadJob]);

  const patchCount = useMemo(() => {
    const fromLic = Object.values(selectedLicense).filter(Boolean).length;
    const fromFeat = Object.values(selectedFeatures).filter(Boolean).length;
    return fromLic + fromFeat + (applyLogin ? 1 : 0);
  }, [selectedLicense, selectedFeatures, applyLogin]);

  const buildTargets = useCallback(() => {
    const targets: any[] = [];
    if (gates?.license_gates) {
      for (const g of gates.license_gates) {
        if (!selectedLicense[g.class + '#' + g.method]) continue;
        targets.push({
          type: 'force_return', class: g.class, method: g.method,
          dex: g.dex, force_value: true,
        });
      }
    }
    if (gates?.patchable_features) {
      for (const f of gates.patchable_features) {
        if (!selectedFeatures[f.class + '#' + f.method]) continue;
        targets.push({
          type: 'force_return', class: f.class, method: f.method,
          force_value: true,
        });
      }
    }
    if (applyLogin && gates?.login_redirect) {
      targets.push({
        type: 'launcher_redirect',
        class: gates.login_redirect.launcher,
        dest_class: gates.login_redirect.destination,
      });
    }
    const seen = new Set<string>();
    return targets.filter(t => {
      const k = t.type + '|' + t.class + '|' + (t.method || t.dest_class || '');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [gates, selectedLicense, selectedFeatures, applyLogin]);

  const onApply = useCallback(async () => {
    if (!currentJob || busy) return;
    const targets = buildTargets();
    if (targets.length === 0) {
      Alert.alert('Nothing selected', 'Pick at least one patch target.');
      return;
    }
    setBusy('apply');
    setStatus('building signed APK (' + targets.length + ' patches)…');
    try {
      const out = currentJob.apkPath.replace(/\.apk$/i, '') + '-bypassed.apk';
      const r = await fetch(BACKEND + '/tool/apk_license_bypass', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apk_path: currentJob.apkPath,
          output_path: out,
          targets,
        }),
      }).then(x => x.json());
      if (!r.ok) throw new Error(r.error || 'apply failed');
      setOutputPath(r.final_apk || out);
      await pipelineStore.setReviewState(currentJob.id, 'decided');
      setStatus('patched → running export…');
      const pr = await pipelineRunner.run(currentJob.id, {
        fromPhase: 'export' as any,
      });
      setStatus('done · ' + targets.length + ' patches · ' + pr.finalState);
      await loadJob(currentJob.id);
    } catch (e) {
      setStatus('FAIL · ' +
        (e instanceof Error ? e.message : String(e)).slice(0, 200));
    }
    setBusy(null);
  }, [currentJob, busy, buildTargets, loadJob]);

  const onExport = useCallback(async () => {
    if (!currentJob || busy) return;
    setBusy('export');
    setStatus('exporting report…');
    try {
      await pipelineStore.setReviewState(currentJob.id, 'decided');
      const r = await pipelineRunner.run(currentJob.id, {
        fromPhase: 'export' as any,
      });
      setStatus('done · ' + r.finalState);
      await loadJob(currentJob.id);
    } catch (e) {
      setStatus('FAIL · ' +
        (e instanceof Error ? e.message : String(e)).slice(0, 200));
    }
    setBusy(null);
  }, [currentJob, busy, loadJob]);

  const showReview =
    currentJob?.state === 'awaiting_user' && preGate && gates !== undefined;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · WORKFLOW</Text>
        {currentJob && (
          <Text style={styles.topBarBadge}>
            {String(currentJob.state).toUpperCase()}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.block}>
          <Text style={styles.blockLabel}>TARGET APK</Text>
          <TextInput
            value={targetPath}
            onChangeText={setTargetPath}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!running}
            placeholder="/storage/emulated/0/.../your.apk"
            placeholderTextColor={colors.textTertiary}
          />
          <Pressable onPress={pickTarget} disabled={running}
            style={[styles.btnAlt, { marginTop: 8 }]}>
            <Text style={styles.btnAltText}>PICK FROM FILES</Text>
          </Pressable>
          <Pressable onPress={runPipeline}
            disabled={running || currentJob?.state === 'awaiting_user'}
            style={[styles.btn, { marginTop: 8 },
              (running || currentJob?.state === 'awaiting_user') && styles.btnDisabled]}>
            <Text style={styles.btnText}>
              {running ? 'RUNNING…'
                : currentJob?.state === 'awaiting_user' ? 'PAUSED — SEE GATE REVIEW'
                : 'RUN FULL ANALYSIS'}
            </Text>
          </Pressable>
          {status && (
            <Text style={[styles.status,
              status.startsWith('FAIL') && { color: '#FF3B30' }]}>
              {status}
            </Text>
          )}
        </View>

        {steps.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>PHASES</Text>
            {steps.map((s, i) => (
              <Text key={i} style={styles.phaseLine}>{s}</Text>
            ))}
          </View>
        )}

        {showReview && (
          <GateReview
            preGate={preGate}
            gates={gates}
            selectedLicense={selectedLicense}
            onToggleLicense={(key) =>
              setSelectedLicense(s => ({ ...s, [key]: !s[key] }))}
            applyLogin={applyLogin}
            onToggleLogin={() => setApplyLogin(v => !v)}
            selectedFeatures={selectedFeatures}
            onToggleFeature={(key) =>
              setSelectedFeatures(s => ({ ...s, [key]: !s[key] }))}
            patchCount={patchCount}
            busy={busy}
            onApply={onApply}
            onExport={onExport}
          />
        )}

        {outputPath && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>OUTPUT</Text>
            <Text style={styles.outPath}>{outputPath}</Text>
            <Text style={styles.hint}>
              Uninstall the original, then install from Files.
            </Text>
          </View>
        )}

        <View style={styles.block}>
          <Text style={styles.blockLabel}>RECENT</Text>
          <RecentJobs onPick={(id) => loadJob(id)} />
        </View>

        {busy && (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
        )}
      </ScrollView>
    </View>
  );
}

function RecentJobs({ onPick }: { onPick: (id: string) => void }) {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  useEffect(() => {
    (async () => {
      const list = await pipelineStore.listJobs(5);
      setJobs(list);
    })();
  }, []);
  return (
    <>
      {jobs.map(j => (
        <Pressable key={j.id} onPress={() => onPick(j.id)} style={styles.jobRow}>
          <Text style={styles.jobName} numberOfLines={1}>
            {j.apkName || j.id.slice(0, 12)}
          </Text>
          <Text style={styles.jobState}>{j.state}</Text>
        </Pressable>
      ))}
    </>
  );
}
