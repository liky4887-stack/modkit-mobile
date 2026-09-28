import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';

interface RiskMeterProps {
  value: number;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

function getColor(value: number): string {
  if (value < 0.3) return colors.success;
  if (value < 0.5) return colors.warning;
  if (value < 0.75) return colors.warning;
  return colors.danger;
}

function getHeight(size: 'sm' | 'md' | 'lg'): number {
  switch (size) {
    case 'sm': return 4;
    case 'md': return 6;
    case 'lg': return 10;
  }
}

export function RiskMeter({ value, label, showValue = true, size = 'md', style }: RiskMeterProps) {
  const pct = Math.max(0, Math.min(1, value));
  const color = getColor(pct);
  const height = getHeight(size);

  return (
    <View style={[styles.container, style]}>
      {label !== undefined && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {showValue && <Text style={[styles.value, { color }]}>{(pct * 100).toFixed(0)}%</Text>}
        </View>
      )}
      <View style={[styles.track, { height }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color, height }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' as unknown as number, alignSelf: 'stretch' as const },
  labelRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginBottom: 4 },
  label: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textSecondary, letterSpacing: 0.5 },
  value: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11 },
  track: { backgroundColor: colors.surfaceElevated, borderRadius: radius.sm, overflow: 'hidden' as const, width: '100%' as unknown as number },
  fill: { borderRadius: radius.sm },
});
