import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

export function Chip({ label, selected = false, onPress, color = colors.accent, style, size = 'md' }: ChipProps) {
  const isSm = size === 'sm';
  const content = (
    <View style={[
      styles.container,
      {
        backgroundColor: selected ? color + '20' : colors.surface,
        borderColor: selected ? color : colors.border,
        paddingVertical: isSm ? 4 : 6,
        paddingHorizontal: isSm ? 8 : 12,
      },
      style,
    ]}>
      <Text style={[styles.label, { color: selected ? color : colors.textSecondary, fontSize: isSm ? 10 : 12 }]}>
        {label}
      </Text>
    </View>
  );

  if (onPress !== undefined) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start' as const,
  },
  label: {
    fontFamily: 'JetBrainsMono-Bold',
    letterSpacing: 0.3,
  },
});
