import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopBar, Panel, FindingChat } from '@/components';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { Share2, FileText, ChevronLeft } from 'lucide-react-native';
import { useScanDetail } from '@/hooks/useScanStore';
import { shareScanMarkdown, shareScanPdf } from '@/utils/report';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

export default function ScanDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { scan, features, loading } = useScanDetail(id ?? null);
  const [openChat, setOpenChat] = useState<string | null>(null);

  const onShareMd = useCallback(async () => {
    if (!scan) return;
    try { await shareScanMarkdown(scan, features); }
    catch (e) { Alert.alert('Share failed', e instanceof Error ? e.message : String(e)); }
  }, [scan, features]);

  const onSharePdf = useCallback(async () => {
    if (!scan) return;
    try { await shareScanPdf(scan, features); }
    catch (e) { Alert.alert('PDF failed', e instanceof Error ? e.message : String(e)); }
  }, [scan, features]);

  if (loading || !scan) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const sorted = [...features].sort((a, b) => b.totalHits - a.totalHits);

  return (
    <View style={styles.container}>
      <TopBar
        title={scan.apkName}
        subtitle={`${features.length} features · ${fmtDate(scan.scannedAt)}`}
        showBack
        onLeftPress={() => router.back()}
        statusColor={colors.accent}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={onShareMd} activeOpacity={0.8} style={styles.shareBtn}>
            <Share2 size={13} color={colors.pureBlack} strokeWidth={2.5} />
            <Text style={styles.shareText}>SHARE MD</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onSharePdf} activeOpacity={0.8} style={[styles.shareBtn, { backgroundColor: colors.cyan }]}>
            <FileText size={13} color={colors.pureBlack} strokeWidth={2.5} />
            <Text style={styles.shareText}>SHARE PDF</Text>
          </TouchableOpacity>
        </View>

        <Panel title="APK">
          <Row k="Name" v={scan.apkName} />
          <Row k="Path" v={scan.apkPath} />
          <Row k="Size" v={fmtBytes(scan.apkSize)} />
          <Row k="SHA256" v={scan.apkHash.slice(0, 24) + '…'} />
          <Row k="Scanned" v={fmtDate(scan.scannedAt)} />
          <Row k="Duration" v={`${(scan.elapsedMs / 1000).toFixed(2)}s`} />
        </Panel>

        <View style={styles.gap} />

        <Panel title="ARCHIVE">
          <Row k="DEX parsed" v={`${scan.dexParsed} / ${scan.dexTotal}`} />
          <Row k="Classes" v={String(scan.totalClasses)} />
          <Row k="Features scanned" v={String(scan.featureCount)} />
          <Row k="Features with hits" v={String(scan.hitFeatureCount)} />
        </Panel>

        <View style={styles.gap} />

        <Panel title={`FINDINGS (${sorted.length})`}>
          {sorted.map((f) => {
            const patterns: string[] = JSON.parse(f.patterns || '[]');
            const open = openChat === f.featureId;
            return (
              <View key={f.id} style={styles.findingRow}>
                <TouchableOpacity
                  onPress={() => setOpenChat(open ? null : f.featureId)}
                  activeOpacity={0.75}
                >
                  <View style={styles.findingHead}>
                    <Text style={styles.findingId}>{f.featureId}</Text>
                    <Text style={[styles.findingHits, {
                      color: f.totalHits > 0 ? colors.accent : colors.textTertiary,
                    }]}>{f.totalHits}</Text>
                  </View>
                  <Text style={styles.findingMsg}>{f.message}</Text>
                  {f.topSignalClass && (
                    <Text style={styles.findingClass} numberOfLines={1}>
                      → {f.topSignalClass}
                    </Text>
                  )}
                  {patterns.length > 0 && (
                    <Text style={styles.findingPatterns} numberOfLines={2}>
                      {patterns.slice(0, 4).join(' · ')}
                    </Text>
                  )}
                  <Text style={styles.askHint}>
                    {open ? '− hide chat' : '+ ask DeepSeek about this finding'}
                  </Text>
                </TouchableOpacity>
                {open && scan && (
                  <View style={{ marginTop: spacing.sm }}>
                    <FindingChat scan={scan} feature={f} />
                  </View>
                )}
              </View>
            );
          })}
        </Panel>

        {scan.patchPlan && (
          <>
            <View style={styles.gap} />
            <Panel title={`PATCH PLAN (${scan.reportGoal ?? 'unknown'})`}>
              <Text style={styles.planText} numberOfLines={60}>
                {scan.patchPlan.slice(0, 4000)}
              </Text>
            </Panel>
          </>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v} numberOfLines={1}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  center: { flex: 1, backgroundColor: colors.pureBlack, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md },
  gap: { height: spacing.md },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  shareBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  shareText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: colors.pureBlack,
    letterSpacing: 1.2,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: spacing.sm },
  k: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary },
  v: { flex: 1, textAlign: 'right', fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textPrimary },
  findingRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  findingHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  findingId: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.textPrimary },
  findingHits: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11 },
  findingMsg: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textSecondary },
  findingClass: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.accent, marginTop: 2 },
  findingPatterns: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  planText: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textPrimary, lineHeight: 14 },
  askHint: { fontFamily: 'JetBrainsMono-Regular', fontSize: 9, color: colors.accent, marginTop: 4, letterSpacing: 0.5 },
});
