import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius, layout } from '@/theme';
import { Menu, ChevronLeft } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

interface TopBarProps {
  title: string;
  subtitle?: string;
  rightIcon?: LucideIcon;
  onRightPress?: () => void;
  onLeftPress?: () => void;
  showBack?: boolean;
  statusColor?: string;
}

export function TopBar({ title, subtitle, rightIcon: RightIcon, onRightPress, onLeftPress, showBack = false, statusColor = colors.accent }: TopBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        {showBack && onLeftPress !== undefined ? (
          <TouchableOpacity onPress={onLeftPress} activeOpacity={0.7} style={styles.iconButton}>
            <ChevronLeft size={20} color={colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
        ) : onLeftPress !== undefined ? (
          <TouchableOpacity onPress={onLeftPress} activeOpacity={0.7} style={styles.iconButton}>
            <Menu size={20} color={colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.titleSection}>
          <View style={styles.titleRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </View>
          {subtitle !== undefined && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>
      </View>
      {RightIcon !== undefined && onRightPress !== undefined && (
        <TouchableOpacity onPress={onRightPress} activeOpacity={0.7} style={styles.iconButton}>
          <RightIcon size={20} color={colors.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, height: layout.topBarHeight, paddingHorizontal: spacing.md, backgroundColor: colors.pureBlack, borderBottomWidth: 1, borderBottomColor: colors.border },
  leftSection: { flexDirection: 'row' as const, alignItems: 'center' as const, flex: 1, gap: spacing.sm },
  iconButton: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  titleSection: { flex: 1, marginLeft: spacing.xs },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  title: { fontFamily: 'JetBrainsMono-Bold', fontSize: 14, color: colors.textPrimary, letterSpacing: 0.3 },
  subtitle: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary, marginTop: 1 },
});
