import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';

interface ToggleProps {
  value: boolean;
  onToggle: () => void;
  label?: string;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Toggle({ value, onToggle, label, disabled = false, style }: ToggleProps) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.wrapper, style]}
    >
      {label !== undefined && <Text style={[styles.label, disabled && styles.disabled]}>{label}</Text>}
      <View style={[styles.track, { backgroundColor: value ? colors.accentDim : colors.surfaceHover, opacity: disabled ? 0.4 : 1 }]}>
        <View style={[styles.thumb, { transform: [{ translateX: value ? 20 : 0 }] }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.sm },
  label: { fontFamily: 'Inter-Regular', fontSize: 14, color: colors.textPrimary, flex: 1 },
  disabled: { color: colors.textTertiary },
  track: { width: 44, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.borderBright, justifyContent: 'center' as const, paddingHorizontal: 2 },
  thumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textPrimary },
});
