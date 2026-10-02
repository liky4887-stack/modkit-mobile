import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { TopBar, Panel } from '@/components';
import { useRouter } from 'expo-router';
import { ShieldCheck, Check, Package, Database, ChevronLeft } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';

type UploadedFile = {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
};

export default function CleanScreen() {
  const router = useRouter();
  const [apkFile, setApkFile] = useState<UploadedFile | null>(null);
  const [obbFile, setObbFile] = useState<UploadedFile | null>(null);

  const pickFile = async (kind: 'apk' | 'obb') => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const uploaded: UploadedFile = {
        uri: asset.uri,
        name: asset.name,
        size: asset.size ?? 0,
        mimeType: asset.mimeType,
      };
      if (kind === 'apk') setApkFile(uploaded);
      else setObbFile(uploaded);
    } catch {
      Alert.alert('Error', 'Could not pick file.');
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleReset = () => {
    setApkFile(null);
    setObbFile(null);
  };

  const hasAny = !!(apkFile || obbFile);
  const hasBoth = !!(apkFile && obbFile);

  return (
    <View style={styles.container}>
      <TopBar
        title="CLEANING WORKFLOW"
        subtitle="upload modified app to inspect"
        onLeftPress={() => router.back()}
        showBack
        statusColor={colors.cyan}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.phaseTitle}>Upload Modified App</Text>
          <Text style={styles.phaseDesc}>
            Select the APK and (optionally) the OBB from a modified app to inspect.
          </Text>

          <View style={styles.sectionSpacing} />

          <Text style={styles.subLabel}>APK File</Text>
          <TouchableOpacity
            style={[styles.uploadCard, apkFile && styles.uploadCardFilled]}
            activeOpacity={0.7}
            onPress={() => pickFile('apk')}
          >
            <View style={styles.uploadIconWrap}>
              <Package size={22} color={apkFile ? colors.accent : colors.textTertiary} strokeWidth={2} />
            </View>
            <View style={styles.uploadInfo}>
              <Text style={styles.uploadName} numberOfLines={1}>
                {apkFile ? apkFile.name : 'Choose APK file'}
              </Text>
              <Text style={styles.uploadMeta}>
                {apkFile ? formatSize(apkFile.size) : 'Tap to browse · .apk'}
              </Text>
            </View>
            {apkFile && <Check size={20} color={colors.accent} strokeWidth={2} />}
          </TouchableOpacity>

          <View style={styles.sectionSpacing} />

          <Text style={styles.subLabel}>OBB File (optional)</Text>
          <TouchableOpacity
            style={[styles.uploadCard, obbFile && styles.uploadCardFilledCyan]}
            activeOpacity={0.7}
            onPress={() => pickFile('obb')}
          >
            <View style={styles.uploadIconWrap}>
              <Database size={22} color={obbFile ? colors.cyan : colors.textTertiary} strokeWidth={2} />
            </View>
            <View style={styles.uploadInfo}>
              <Text style={styles.uploadName} numberOfLines={1}>
                {obbFile ? obbFile.name : 'Choose OBB file'}
              </Text>
              <Text style={styles.uploadMeta}>
                {obbFile ? formatSize(obbFile.size) : 'Tap to browse · .obb'}
              </Text>
            </View>
            {obbFile && <Check size={20} color={colors.cyan} strokeWidth={2} />}
          </TouchableOpacity>

          <View style={styles.sectionSpacing} />

          <Panel title="Inspection Summary">
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>APK</Text>
              <Text style={[styles.statusValue, { color: apkFile ? colors.accent : colors.textTertiary }]}>
                {apkFile ? 'READY' : 'MISSING'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>OBB</Text>
              <Text style={[styles.statusValue, { color: obbFile ? colors.cyan : colors.textTertiary }]}>
                {obbFile ? 'READY' : 'OPTIONAL'}
              </Text>
            </View>
            <View style={[styles.statusRow, styles.statusRowLast]}>
              <Text style={styles.statusLabel}>Status</Text>
              <Text style={styles.statusValue}>
                {hasBoth ? 'FULL' : hasAny ? 'PARTIAL' : 'IDLE'}
              </Text>
            </View>
          </Panel>

          {hasAny && (
            <>
              <View style={styles.sectionSpacing} />
              <TouchableOpacity style={styles.resetBtn} activeOpacity={0.7} onPress={handleReset}>
                <ChevronLeft size={14} color={colors.cyan} strokeWidth={2} />
                <Text style={styles.resetText}>CLEAR FILES</Text>
              </TouchableOpacity>
            </>
          )}

          {!hasAny && (
            <>
              <View style={styles.sectionSpacing} />
              <View style={styles.emptyWrap}>
                <ShieldCheck size={32} color={colors.textTertiary} strokeWidth={1.5} />
                <Text style={styles.emptyText}>
                  Upload an APK to get started. No files are analyzed until you provide them.
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl },
  section: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  sectionSpacing: { height: spacing.md },
  phaseTitle: { fontFamily: 'JetBrainsMono-Bold', fontSize: 14, color: colors.textPrimary, letterSpacing: 0.5, textTransform: 'uppercase' },
  phaseDesc: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  subLabel: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  uploadCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', padding: spacing.md, gap: spacing.sm },
  uploadCardFilled: { borderStyle: 'solid', borderColor: colors.accent },
  uploadCardFilledCyan: { borderStyle: 'solid', borderColor: colors.cyan },
  uploadIconWrap: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  uploadInfo: { flex: 1 },
  uploadName: { fontFamily: 'JetBrainsMono-Bold', fontSize: 13, color: colors.textPrimary },
  uploadMeta: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  statusRowLast: { borderBottomWidth: 0 },
  statusLabel: { fontFamily: 'JetBrainsMono-Regular', fontSize: 12, color: colors.textTertiary },
  statusValue: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12, color: colors.textPrimary },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cyan, paddingVertical: spacing.md },
  resetText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.cyan, letterSpacing: 0.5 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  emptyText: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textTertiary, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
});
