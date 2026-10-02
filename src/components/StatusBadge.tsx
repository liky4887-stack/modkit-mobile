import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { radius } from '@/theme';
import type { FeatureStatus } from '@/types';

interface StatusBadgeProps {
  status?: FeatureStatus;
  label?: string;
  color?: string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<FeatureStatus, { color: string; bg: string; text: string }> = {
  active: { color: colors.accent, bg: colors.accentGlow, text: 'ACTIVE' },
  standby: { color: colors.textSecondary, bg: colors.surfaceHover, text: 'STANDBY' },
  warning: { color: colors.warning, bg: colors.warningGlow, text: 'WARNING' },
  disabled: { color: colors.danger, bg: colors.dangerGlow, text: 'DISABLED' },
};

export function StatusBadge({ status, label, color, size = 'sm' }: StatusBadgeProps) {
  const base = status ? statusConfig[status] : { color: colors.textSecondary, bg: colors.surfaceAlt, text: '' };
  const finalColor = color ?? base.color;
  const finalBg = color ? `${color}22` : base.bg;
  const isSm = size === 'sm';

  return (
    <View style={[styles.container, { backgroundColor: finalBg, paddingVertical: isSm ? 2 : 4, paddingHorizontal: isSm ? 6 : 10 }]}>
      <View style={[styles.dot, { backgroundColor: finalColor, width: isSm ? 6 : 8, height: isSm ? 6 : 8, borderRadius: isSm ? 3 : 4 }]} />
      <Text style={[styles.text, { color: finalColor, fontSize: isSm ? 9 : 11 }]}>
        {label ?? base.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, borderRadius: radius.sm, alignSelf: 'flex-start' as const },
  dot: {},
  text: { fontFamily: 'JetBrainsMono-Bold', letterSpacing: 0.5 },
});
