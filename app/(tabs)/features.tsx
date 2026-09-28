import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { TopBar, FeatureCard, SectionHeader, Chip } from '@/components';
import { features } from '@/features/registry';
import { useAppStore } from '@/store/useAppStore';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import type { FeatureCategory } from '@/types';

const CATEGORIES: { label: string; value: FeatureCategory | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Identity', value: 'identity' },
  { label: 'Network', value: 'network' },
  { label: 'Behavior', value: 'behavior' },
  { label: 'Memory', value: 'memory' },
  { label: 'Intel', value: 'intelligence' },
  { label: 'Accounts', value: 'accounts' },
  { label: 'Prediction', value: 'prediction' },
  { label: 'Forensics', value: 'forensics' },
  { label: 'Education', value: 'education' },
];

export default function FeaturesScreen() {
  const router = useRouter();
  const { featureStates } = useAppStore();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<FeatureCategory | 'all'>('all');

  const filtered = features.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase()) || f.shortName.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'all' || f.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <View style={styles.container}>
      <TopBar title="MODULES" subtitle={`${features.length} features`} statusColor={colors.accent} />
      <View style={styles.searchWrap}>
        <View style={styles.searchInput}>
          <Search size={16} color={colors.textTertiary} strokeWidth={2} />
          <TextInput
            style={styles.searchText}
            placeholder="Search modules..."
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} horizontal={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryContent}>
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat.value}
              label={cat.label}
              selected={activeCategory === cat.value}
              onPress={() => setActiveCategory(cat.value)}
              size="sm"
            />
          ))}
        </ScrollView>

        <View style={styles.sectionSpacing} />
        <SectionHeader title={`${filtered.length} Modules`} subtitle={activeCategory !== 'all' ? `filtered: ${activeCategory}` : 'all categories'} />

        <View style={styles.grid}>
          {filtered.map((f) => (
            <FeatureCard
              key={f.id}
              feature={f}
              enabled={featureStates[f.id]?.enabled}
              onPress={() => router.push(`/feature/${f.id}` as never)}
            />
          ))}
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  searchWrap: { padding: spacing.md, paddingBottom: 0 },
  searchInput: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  searchText: { fontFamily: 'Inter-Regular', fontSize: 14, color: colors.textPrimary, flex: 1 },
  categoryScroll: { maxHeight: 40 },
  categoryContent: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl },
  sectionSpacing: { height: spacing.md },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
