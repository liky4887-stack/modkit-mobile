import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';

export default function ChatsTab() {
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · CHATS</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>NO ACTIVE CHATS</Text>
          <Text style={styles.emptySub}>
            Chat lifecycle manager wires in Session 03.{'\n'}
            This screen will show every DeepSeek session with turns, tokens, and transcripts.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBarTitle: {
    color: colors.accent,
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 2,
  },
  content: { padding: spacing.md },
  empty: { marginTop: 80, alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: {
    color: colors.textTertiary,
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    letterSpacing: 3,
    marginBottom: spacing.sm,
  },
  emptySub: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'center',
    opacity: 0.7,
  },
});
