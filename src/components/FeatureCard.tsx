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
    : colors.accent;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.container}>
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { borderColor: iconColor + '30' }]}>
          <FeatureIcon name={feature.icon} size={18} color={iconColor} />
        </View>
        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.index}>{String(feature.index).padStart(2, '0')}</Text>
            <Text style={styles.name} numberOfLines={1}>{feature.shortName}</Text>
          </View>
          <Text style={styles.category} numberOfLines={1}>{feature.category}</Text>
        </View>
      </View>

      <Text style={styles.description} numberOfLines={3}>{feature.description}</Text>

      <View style={styles.footer}>
        <View style={styles.tagRow}>
          {feature.isSimulated && (
            <View style={[styles.tag, { backgroundColor: colors.infoGlow }]}>
              <Text style={[styles.tagText, { color: colors.info }]}>SIM</Text>
            </View>
          )}
          {isAbstract && (
            <View style={[styles.tag, { backgroundColor: colors.purpleGlow }]}>
              <Text style={[styles.tagText, { color: colors.purple }]}>EDU</Text>
            </View>
          )}
          {feature.riskLevel === 'critical' && (
            <View style={[styles.tag, { backgroundColor: colors.dangerGlow }]}>
              <Text style={[styles.tagText, { color: colors.danger }]}>CRIT</Text>
            </View>
          )}
        </View>
        <StatusBadge status={enabled ? 'active' : feature.status} size="sm" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    width: '31.5%',
    minHeight: 150,
    justifyContent: 'space-between',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconWrap: {
    width: 32, height: 32, borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  index: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: colors.textTertiary },
  name: { fontFamily: 'Inter-Bold', fontSize: 12, color: colors.textPrimary, flex: 1 },
  category: {
    fontFamily: 'JetBrainsMono-Regular', fontSize: 9,
    color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2,
  },
  description: {
    fontFamily: 'Inter-Regular', fontSize: 11,
    color: colors.textSecondary, lineHeight: 15,
    marginTop: spacing.sm, marginBottom: spacing.sm,
  },
  footer: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 4,
  },
  tagRow: { flexDirection: 'row', gap: 3, flexShrink: 1 },
  tag: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: radius.sm },
  tagText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 7, letterSpacing: 0.5 },
});
