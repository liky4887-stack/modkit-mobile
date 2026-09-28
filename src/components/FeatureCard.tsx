import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { FeatureIcon } from './FeatureIcon';
import { StatusBadge } from './StatusBadge';
import type { Feature } from '@/types';
import { ChevronRight } from 'lucide-react-native';

interface FeatureCardProps {
  feature: Feature;
  onPress: () => void;
  enabled?: boolean;
}

export function FeatureCard({ feature, onPress, enabled }: FeatureCardProps) {
  const isAbstract = feature.isAbstract || feature.isEducational;
  const iconColor = feature.riskLevel === 'critical' ? colors.danger
    : feature.riskLevel === 'high' ? colors.warning
    : feature.riskLevel === 'none' ? colors.accent
    : colors.accent;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.container}>
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { borderColor: iconColor + '30' }]}>
          <FeatureIcon name={feature.icon} size={20} color={iconColor} />
        </View>
        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.index}>{String(feature.index).padStart(2, '0')}</Text>
            <Text style={styles.name} numberOfLines={1}>{feature.shortName}</Text>
          </View>
          <Text style={styles.category}>{feature.category}</Text>
        </View>
        <StatusBadge status={enabled ? 'active' : feature.status} size="sm" />
      </View>
      <Text style={styles.description} numberOfLines={2}>{feature.description}</Text>
      <View style={styles.footer}>
        <View style={styles.tagRow}>
          {feature.isSimulated && <View style={[styles.tag, { backgroundColor: colors.infoGlow }]}><Text style={[styles.tagText, { color: colors.info }]}>SIM</Text></View>}
          {isAbstract && <View style={[styles.tag, { backgroundColor: colors.purpleGlow }]}><Text style={[styles.tagText, { color: colors.purple }]}>EDU</Text></View>}
          {feature.riskLevel === 'critical' && <View style={[styles.tag, { backgroundColor: colors.dangerGlow }]}><Text style={[styles.tagText, { color: colors.danger }]}>CRIT</Text></View>}
        </View>
        <ChevronRight size={16} color={colors.textTertiary} strokeWidth={2} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  iconWrap: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  index: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.textTertiary, letterSpacing: 1 },
  name: { fontFamily: 'Inter-Bold', fontSize: 14, color: colors.textPrimary, flex: 1, flexShrink: 1 },
  category: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 2 },
  description: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginTop: spacing.sm, flex: 1 },
  footer: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: spacing.sm },
  tagRow: { flexDirection: 'row' as const, gap: 4 },
  tag: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: radius.sm },
  tagText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 8, letterSpacing: 0.5 },
});
