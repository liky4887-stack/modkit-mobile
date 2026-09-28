import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { FeatureIcon } from './FeatureIcon';
import { StatusBadge } from './StatusBadge';
import { ChevronRight } from 'lucide-react-native';
import type { Feature } from '@/types';

interface FeatureListItemProps {
  feature: Feature;
  onPress: () => void;
  enabled?: boolean;
  compact?: boolean;
}

export function FeatureListItem({ feature, onPress, enabled, compact = false }: FeatureListItemProps) {
  const iconColor = feature.riskLevel === 'critical' ? colors.danger
    : feature.riskLevel === 'high' ? colors.warning
    : colors.accent;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.container}>
      <View style={[styles.iconWrap, compact && { width: 32, height: 32 }]}>
        <FeatureIcon name={feature.icon} size={compact ? 16 : 18} color={iconColor} />
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.index}>{String(feature.index).padStart(2, '0')}</Text>
          <Text style={styles.name} numberOfLines={1}>{feature.name}</Text>
        </View>
        <Text style={styles.category}>{feature.category} · {feature.riskLevel} risk</Text>
      </View>
      <StatusBadge status={enabled ? 'active' : feature.status} size="sm" />
      <ChevronRight size={16} color={colors.textTertiary} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconWrap: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  info: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  index: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.textTertiary },
  name: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.textPrimary, flex: 1, flexShrink: 1 },
  category: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary, marginTop: 2, textTransform: 'capitalize' as const },
});
