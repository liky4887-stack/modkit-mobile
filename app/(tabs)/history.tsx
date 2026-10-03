import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { TopBar, Panel, SovereignLink } from '@/components';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { useRouter } from 'expo-router';
import { History, ChevronRight, Trash2, FileCode, GitCompare } from 'lucide-react-native';
import { useScanList } from '@/hooks/useScanStore';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtWhen(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const { scans, total, loading, error, refresh, remove } = useScanList();

  return (
    <View style={styles.container}>
      <TopBar
        title="SCAN HISTORY"
        subtitle={loading ? 'loading…' : `${total} scan${total === 1 ? '' : 's'}`}
        statusColor={colors.cyan}
      />
      <SovereignLink />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <TouchableOpacity
          onPress={() => router.push('/compare' as never)}
          activeOpacity={0.8}
          style={styles.compareBtn}
        >
          <GitCompare size={14} color={colors.pureBlack} strokeWidth={2.5} />
          <Text style={styles.compareText}>COMPARE TWO APKs</Text>
        </TouchableOpacity>

        {error && (
          <Panel title="ERROR">
            <Text style={styles.err}>{error}</Text>
          </Panel>
        )}

        {!loading && scans.length === 0 && (
          <Panel title="NO SCANS YET">
            <Text style={styles.muted}>
              Run a scan from the Patch tab. Every scan is saved locally with a SHA256
              fingerprint of the APK, all feature hits, and any patch plan produced.
            </Text>
          </Panel>
        )}

        {scans.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => router.push({ pathname: '/scan/[id]', params: { id: s.id } } as never)}
            activeOpacity={0.75}
            style={styles.card}
          >
            <View style={styles.cardHead}>
              <FileCode size={14} color={colors.accent} strokeWidth={2} />
              <Text style={styles.apkName} numberOfLines={1}>{s.apkName}</Text>
              <Text style={styles.when}>{fmtWhen(s.scannedAt)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{fmtBytes(s.apkSize)}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.meta}>{s.hitFeatureCount} hit / {s.featureCount} features</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.meta}>{(s.elapsedMs / 1000).toFixed(1)}s</Text>
            </View>
            <Text style={styles.hash} numberOfLines={1}>{s.apkHash.slice(0, 32)}…</Text>
            <View style={styles.actions}>
              {s.patchPlan && (
                <Text style={styles.planBadge}>PLAN SAVED</Text>
              )}
              <TouchableOpacity
                onPress={() => void remove(s.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Trash2 size={13} color={colors.textTertiary} strokeWidth={2} />
              </TouchableOpacity>
              <ChevronRight size={14} color={colors.textTertiary} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  compareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.purple,
    borderRadius: radius.md,
    paddingVertical: 12,
    marginBottom: spacing.sm,
  },
  compareText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: colors.pureBlack,
    letterSpacing: 1.5,
  },
  container: { flex: 1, backgroundColor: colors.pureBlack },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  apkName: {
    flex: 1,
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 12,
    color: colors.textPrimary,
  },
  when: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: colors.textTertiary,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  meta: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textSecondary },
  metaDot: { color: colors.textTertiary, fontSize: 11 },
  hash: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: colors.textTertiary,
    marginBottom: 6,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planBadge: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 9,
    color: colors.accent,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: colors.accentDim ?? colors.border,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  muted: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  err: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.danger },
});
