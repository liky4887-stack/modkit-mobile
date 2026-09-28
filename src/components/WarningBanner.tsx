import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { ShieldAlert } from 'lucide-react-native';

interface WarningBannerProps {
  message: string;
  type?: 'warning' | 'danger' | 'info' | 'educational';
}

export function WarningBanner({ message, type = 'warning' }: WarningBannerProps) {
  const config = {
    warning: { bg: colors.warningGlow, border: colors.warning, text: colors.warning },
    danger: { bg: colors.dangerGlow, border: colors.danger, text: colors.danger },
    info: { bg: colors.infoGlow, border: colors.info, text: colors.info },
    educational: { bg: colors.purpleGlow, border: colors.purple, text: colors.purple },
  }[type];

  return (
    <View style={[styles.container, { backgroundColor: config.bg, borderColor: config.border }]}>
      <ShieldAlert size={16} color={config.text} strokeWidth={2} />
      <Text style={[styles.message, { color: config.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.sm, padding: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1 },
  message: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18, flex: 1 },
});
