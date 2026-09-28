import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  unit?: string;
  displayValue?: string;
}

export function Slider({ label, value, min, max, step = 0.01, onChange, unit, displayValue }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {displayValue ?? value.toFixed(2)}
          {unit !== undefined ? ` ${unit}` : ''}
        </Text>
      </View>
      <View style={styles.trackWrapper}>
        <View style={styles.track} />
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
        <View style={[styles.thumb, { left: `${Math.max(0, Math.min(100, pct))}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' as unknown as number, alignSelf: 'stretch' as const, marginBottom: spacing.md },
  labelRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginBottom: 8 },
  label: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.textSecondary },
  value: { fontFamily: 'JetBrainsMono-Bold', fontSize: 13, color: colors.accent },
  trackWrapper: { height: 28, justifyContent: 'center' as const, position: 'relative' as const },
  track: { position: 'absolute' as const, left: 0, right: 0, height: 4, backgroundColor: colors.surfaceElevated, borderRadius: 2 },
  fill: { position: 'absolute' as const, left: 0, height: 4, backgroundColor: colors.accent, borderRadius: 2 },
  thumb: { position: 'absolute' as const, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.textPrimary, marginLeft: -8, top: 6, borderWidth: 2, borderColor: colors.accent },
});
