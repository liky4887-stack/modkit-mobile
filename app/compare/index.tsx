import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { TopBar, Panel } from '@/components';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { Play, ArrowRight, Plus, Minus, FileCode, FilePlus2, FileMinus2 } from 'lucide-react-native';
import { diffApi, type ApkDiff } from '@/api/factory';

function fmtBytes(n: number): string {
  if (n === 0) return '0 B';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  if (abs < 1024 * 1024 * 1024) return `${sign}${(abs / 1024 / 1024).toFixed(1)} MB`;
  return `${sign}${(abs / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function CompareScreen() {
  const router = useRouter();
  const [pathA, setPathA] = useState('');
  const [pathB, setPathB] = useState('');
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState<ApkDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'summary' | 'classes' | 'files' | 'features'>('summary');

  const run = useCallback(async () => {
    if (!pathA.trim() || !pathB.trim()) {
      setError('Enter both APK paths.');
      return;
    }
    setLoading(true);
    setError(null);
    setDiff(null);
    try {
      const d = await diffApi.compare(pathA.trim(), pathB.trim());
      setDiff(d);
      setTab('summary');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [pathA, pathB]);

  return (
    <View style={styles.container}>
      <TopBar
        title="APK DIFF"
        subtitle="compare two builds"
        showBack
        onLeftPress={() => router.back()}
        statusColor={colors.purple}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        <Panel title="BASELINE (A)">
          <TextInput
            value={pathA}
            onChangeText={setPathA}
            placeholder="/storage/emulated/0/.../app-old.apk"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
        </Panel>

        <View style={styles.gap} />

        <Panel title="TARGET (B)">
          <TextInput
            value={pathB}
            onChangeText={setPathB}
            placeholder="/storage/emulated/0/.../app-new.apk"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
        </Panel>

        <View style={styles.gap} />

        <TouchableOpacity
          onPress={run}
          disabled={loading}
          activeOpacity={0.85}
          style={[styles.runBtn, loading && { opacity: 0.5 }]}
        >
          {loading ? (
            <>
              <ActivityIndicator size="small" color={colors.pureBlack} />
              <Text style={styles.runText}>COMPARING…</Text>
            </>
          ) : (
            <>
              <Play size={14} color={colors.pureBlack} strokeWidth={2.5} />
              <Text style={styles.runText}>RUN DIFF</Text>
            </>
          )}
        </TouchableOpacity>

        {error && (
          <>
            <View style={styles.gap} />
            <Panel title="ERROR">
              <Text style={styles.err}>{error}</Text>
            </Panel>
          </>
        )}

        {diff && (
          <>
            <View style={styles.gap} />
            <Panel title="HEADERS">
              <View style={styles.headerRow}>
                <View style={styles.headerCol}>
                  <Text style={styles.headerLabel}>A</Text>
                  <Text style={styles.headerName} numberOfLines={1}>{diff.apkA.name}</Text>
                  <Text style={styles.headerMeta}>{fmtBytes(diff.apkA.sizeBytes)}</Text>
                </View>
                <ArrowRight size={16} color={colors.textTertiary} strokeWidth={2} />
                <View style={styles.headerCol}>
                  <Text style={styles.headerLabel}>B</Text>
                  <Text style={styles.headerName} numberOfLines={1}>{diff.apkB.name}</Text>
                  <Text style={styles.headerMeta}>{fmtBytes(diff.apkB.sizeBytes)}</Text>
                </View>
              </View>
              <View style={styles.headerStats}>
                <View style={styles.headerStat}>
                  <Text style={styles.statLabel}>DEX</Text>
                  <Text style={styles.statVal}>{diff.apkA.dexCount}</Text>
                  <Text style={styles.statArrow}>→</Text>
                  <Text style={styles.statVal}>{diff.apkB.dexCount}</Text>
                </View>
                <View style={styles.headerStat}>
                  <Text style={styles.statLabel}>CLASSES</Text>
                  <Text style={styles.statVal}>{diff.apkA.classCount}</Text>
                  <Text style={styles.statArrow}>→</Text>
                  <Text style={styles.statVal}>{diff.apkB.classCount}</Text>
                </View>
                <View style={styles.headerStat}>
                  <Text style={styles.statLabel}>FILES</Text>
                  <Text style={styles.statVal}>{diff.apkA.entryCount}</Text>
                  <Text style={styles.statArrow}>→</Text>
                  <Text style={styles.statVal}>{diff.apkB.entryCount}</Text>
                </View>
              </View>
              <Text style={styles.elapsed}>Computed in {diff.elapsedMs} ms</Text>
            </Panel>

            <View style={styles.gap} />

            <View style={styles.tabs}>
              {(['summary','classes','files','features'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                    {t.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.gap} />

            {tab === 'summary' && (
              <Panel title="DELTAS">
                <Row k="Size" v={fmtBytes(diff.summary.sizeDeltaBytes)} diff={diff.summary.sizeDeltaBytes} />
                <Row k="DEX files" v={String(diff.summary.dexDelta)} diff={diff.summary.dexDelta} />
                <Row k="Classes" v={String(diff.summary.classDelta)} diff={diff.summary.classDelta} />
                <Row k="Classes added" v={String(diff.summary.classesAdded)} diff={diff.summary.classesAdded} />
                <Row k="Classes removed" v={String(diff.summary.classesRemoved)} diff={-diff.summary.classesRemoved} />
                <Row k="Files added" v={String(diff.summary.filesAdded)} diff={diff.summary.filesAdded} />
                <Row k="Files removed" v={String(diff.summary.filesRemoved)} diff={-diff.summary.filesRemoved} />
              </Panel>
            )}

            {tab === 'classes' && (
              <>
                <Panel title={`ADDED (${diff.classes.addedTotal})`}>
                  {diff.classes.added.length === 0 ? (
                    <Text style={styles.muted}>(none)</Text>
                  ) : (
                    diff.classes.added.slice(0, 60).map((c, i) => (
                      <View key={i} style={styles.listRow}>
                        <Plus size={11} color={colors.accent} strokeWidth={2.5} />
                        <Text style={styles.listText} numberOfLines={1}>{c}</Text>
                      </View>
                    ))
                  )}
                  {diff.classes.addedTotal > 60 && (
                    <Text style={styles.muted}>…and {diff.classes.addedTotal - 60} more</Text>
                  )}
                </Panel>
                <View style={styles.gap} />
                <Panel title={`REMOVED (${diff.classes.removedTotal})`}>
                  {diff.classes.removed.length === 0 ? (
                    <Text style={styles.muted}>(none)</Text>
                  ) : (
                    diff.classes.removed.slice(0, 60).map((c, i) => (
                      <View key={i} style={styles.listRow}>
                        <Minus size={11} color={colors.danger} strokeWidth={2.5} />
                        <Text style={styles.listText} numberOfLines={1}>{c}</Text>
                      </View>
                    ))
                  )}
                  {diff.classes.removedTotal > 60 && (
                    <Text style={styles.muted}>…and {diff.classes.removedTotal - 60} more</Text>
                  )}
                </Panel>
              </>
            )}

            {tab === 'files' && (
              <>
                <Panel title={`ADDED (${diff.files.addedTotal})`}>
                  {diff.files.added.length === 0 ? (
                    <Text style={styles.muted}>(none)</Text>
                  ) : (
                    diff.files.added.slice(0, 60).map((c, i) => (
                      <View key={i} style={styles.listRow}>
                        <FilePlus2 size={11} color={colors.accent} strokeWidth={2.5} />
                        <Text style={styles.listText} numberOfLines={1}>{c}</Text>
                      </View>
                    ))
                  )}
                </Panel>
                <View style={styles.gap} />
                <Panel title={`REMOVED (${diff.files.removedTotal})`}>
                  {diff.files.removed.length === 0 ? (
                    <Text style={styles.muted}>(none)</Text>
                  ) : (
                    diff.files.removed.slice(0, 60).map((c, i) => (
                      <View key={i} style={styles.listRow}>
                        <FileMinus2 size={11} color={colors.danger} strokeWidth={2.5} />
                        <Text style={styles.listText} numberOfLines={1}>{c}</Text>
                      </View>
                    ))
                  )}
                </Panel>
                <View style={styles.gap} />
                <Panel title="EXTENSION DELTAS">
                  {diff.extensions.length === 0 ? (
                    <Text style={styles.muted}>(none)</Text>
                  ) : (
                    diff.extensions.slice(0, 20).map((e, i) => (
                      <View key={i} style={styles.extRow}>
                        <Text style={styles.extName}>{e.ext}</Text>
                        <Text style={styles.extCount}>{e.a}</Text>
                        <Text style={styles.extArrow}>→</Text>
                        <Text style={styles.extCount}>{e.b}</Text>
                        <Text style={[styles.extDelta, {
                          color: e.delta > 0 ? colors.accent : e.delta < 0 ? colors.danger : colors.textTertiary,
                        }]}>
                          {e.delta > 0 ? '+' : ''}{e.delta}
                        </Text>
                      </View>
                    ))
                  )}
                </Panel>
              </>
            )}

            {tab === 'features' && (
              <Panel title="FEATURE HIT DELTAS">
                {Object.keys(diff.features).length === 0 ? (
                  <Text style={styles.muted}>(no feature-level changes detected)</Text>
                ) : (
                  Object.entries(diff.features).map(([fid, d]) => (
                    <View key={fid} style={styles.featRow}>
                      <View style={styles.featHead}>
                        <Text style={styles.featId}>{fid}</Text>
                        <Text style={[styles.featDelta, {
                          color: d.delta > 0 ? colors.accent : d.delta < 0 ? colors.danger : colors.textTertiary,
                        }]}>
                          {d.delta > 0 ? '+' : ''}{d.delta}
                        </Text>
                      </View>
                      <Text style={styles.featCounts}>
                        A: {d.aHits} DEX · B: {d.bHits} DEX
                      </Text>
                      {d.addedDex.length > 0 && (
                        <Text style={styles.featDex} numberOfLines={2}>
                          + {d.addedDex.slice(0, 3).join(', ')}
                        </Text>
                      )}
                      {d.removedDex.length > 0 && (
                        <Text style={[styles.featDex, { color: colors.danger }]} numberOfLines={2}>
                          − {d.removedDex.slice(0, 3).join(', ')}
                        </Text>
                      )}
                    </View>
                  ))
                )}
              </Panel>
            )}
          </>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

function Row({ k, v, diff = 0 }: { k: string; v: string; diff?: number }) {
  const color =
    diff > 0 ? colors.accent :
    diff < 0 ? colors.danger :
    colors.textPrimary;
  return (
    <View style={styles.row}>
      <Text style={styles.rowK}>{k}</Text>
      <Text style={[styles.rowV, { color }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md },
  gap: { height: spacing.md },
  input: {
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
  runBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.purple,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  runText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12, color: colors.pureBlack, letterSpacing: 1.5 },
  err: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.danger },
  muted: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textTertiary, marginTop: 4 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  headerCol: { flex: 1 },
  headerLabel: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: colors.purple, letterSpacing: 1.5 },
  headerName: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.textPrimary, marginTop: 2 },
  headerMeta: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  headerStats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  headerStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: colors.textTertiary, letterSpacing: 1 },
  statVal: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.textPrimary },
  statArrow: { fontFamily: 'Inter-Regular', fontSize: 10, color: colors.textTertiary },
  elapsed: { fontFamily: 'Inter-Regular', fontSize: 10, color: colors.textTertiary, marginTop: spacing.sm },

  tabs: { flexDirection: 'row', gap: 4 },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  tabLabel: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: colors.textTertiary, letterSpacing: 1 },
  tabLabelActive: { color: colors.pureBlack },

  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: spacing.sm },
  rowK: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary },
  rowV: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12 },

  listRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  listText: { flex: 1, fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textPrimary },

  extRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  extName: { flex: 1, fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textPrimary },
  extCount: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textSecondary, minWidth: 40, textAlign: 'right' },
  extArrow: { fontFamily: 'Inter-Regular', fontSize: 10, color: colors.textTertiary },
  extDelta: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, minWidth: 50, textAlign: 'right' },

  featRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  featHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  featId: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.textPrimary },
  featDelta: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12 },
  featCounts: { fontFamily: 'Inter-Regular', fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  featDex: { fontFamily: 'JetBrainsMono-Regular', fontSize: 9, color: colors.accent, marginTop: 2 },
});
