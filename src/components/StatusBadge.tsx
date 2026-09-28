import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import type { FeatureStatus } from '@/types';

interface StatusBadgeProps {
  status: FeatureStatus;
  label?: string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<FeatureStatus, { color: string; bg: string; text: string }> = {
  active: { color: colors.accent, bg: colors.accentGlow, text: 'ACTIVE' },
  standby: { color: colors.textSecondary, bg: colors.surfaceHover, text: 'STANDBY' },
  warning: { color: colors.warning, bg: colors.warningGlow, text: 'WARNING' },
  disabled: { color: colors.danger, bg: colors.dangerGlow, text: 'DISABLED' },
};

export function StatusBadge({ status, label, size = 'sm' }: StatusBadgeProps) {
  const cfg = statusConfig[status];
  const isSm = size === 'sm';

  return (
    <View style={[styles.container, { backgroundColor: cfg.bg, paddingVertical: isSm ? 2 : 4, paddingHorizontal: isSm ? 6 : 10 }]}>
      <View style={[styles.dot, { backgroundColor: cfg.color, width: isSm ? 6 : 8, height: isSm ? 6 : 8, borderRadius: isSm ? 3 : 4 }]} />
      <Text style={[styles.text, { color: cfg.color, fontSize: isSm ? 9 : 11 }]}>{label ?? cfg.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, borderRadius: radius.sm, alignSelf: 'flex-start' as const },
  dot: {},
  text: { fontFamily: 'JetBrainsMono-Bold', letterSpacing: 0.5 },
});
