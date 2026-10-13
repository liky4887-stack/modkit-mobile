import { StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  topBar: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  topBarTitle: {
    color: colors.accent, fontFamily: 'Inter-SemiBold',
    fontSize: 12, letterSpacing: 2,
  },
  topBarBadge: {
    color: colors.accent, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3,
    backgroundColor: 'rgba(0,255,136,0.12)',
  },
  content: { padding: spacing.md, paddingBottom: 60 },

  block: {
    marginBottom: spacing.md, padding: spacing.md,
    backgroundColor: colors.surface, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  gateBlock: { borderColor: colors.accent, borderWidth: 2 },
  blockLabel: {
    color: colors.accent, fontFamily: 'Inter-SemiBold',
    fontSize: 10, letterSpacing: 2, marginBottom: 8,
  },
  blockMeta: {
    color: colors.textTertiary, fontFamily: 'Inter-Regular',
    fontSize: 10, marginTop: 6, lineHeight: 15,
  },

  input: {
    color: colors.textPrimary, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10, backgroundColor: colors.pureBlack, borderRadius: 6,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 8, paddingVertical: 8,
  },

  btn: {
    backgroundColor: colors.accent, borderRadius: 6,
    paddingVertical: 12, alignItems: 'center',
  },
  btnAlt: {
    backgroundColor: '#1A3A5C', borderRadius: 6,
    paddingVertical: 10, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: colors.pureBlack, fontFamily: 'Inter-SemiBold',
    fontSize: 11, letterSpacing: 1,
  },
  btnAltText: {
    color: colors.accent, fontFamily: 'Inter-SemiBold',
    fontSize: 10, letterSpacing: 1,
  },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },

  status: {
    color: colors.accent, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10, marginTop: 10, lineHeight: 15,
  },
  phaseLine: {
    color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10, lineHeight: 15,
  },

  gateHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  gateLabel: {
    color: colors.accent, fontFamily: 'Inter-SemiBold',
    fontSize: 11, letterSpacing: 2,
  },
  gateBadge: {
    color: colors.accent, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
    backgroundColor: 'rgba(0,255,136,0.12)',
  },
  gateHint: {
    color: colors.textTertiary, fontFamily: 'Inter-Regular',
    fontSize: 10, lineHeight: 15,
  },

  sectionHeader: {
    color: colors.accent, fontFamily: 'Inter-SemiBold',
    fontSize: 10, letterSpacing: 2, marginTop: 16, marginBottom: 8,
  },

  sevGrid: { flexDirection: 'row', marginTop: 8, marginBottom: 4 },
  sevCell: { flex: 1, alignItems: 'center' },
  sevNum: { fontFamily: 'Inter-SemiBold', fontSize: 16 },
  sevLabel: {
    color: colors.textTertiary, fontFamily: 'Inter-Regular',
    fontSize: 8, letterSpacing: 1, marginTop: 2,
  },

  signalRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border,
  },
  sevPill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginTop: 2,
  },
  sevPillText: {
    color: colors.pureBlack, fontFamily: 'Inter-SemiBold',
    fontSize: 8, letterSpacing: 0.5,
  },
  signalTitle: {
    color: colors.textPrimary, fontFamily: 'Inter-Regular',
    fontSize: 12, lineHeight: 16,
  },
  signalMeta: {
    color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9, marginTop: 2,
  },

  patchRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.pureBlack, fontFamily: 'Inter-Bold', fontSize: 12 },
  patchTitle: {
    color: colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12,
  },
  patchSub: {
    color: colors.textSecondary, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10, marginTop: 2,
  },
  patchMeta: {
    color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9, marginTop: 2,
  },

  outPath: {
    color: colors.textPrimary, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10, lineHeight: 16, marginTop: 4,
  },
  hint: {
    color: colors.textTertiary, fontFamily: 'Inter-Regular',
    fontSize: 10, marginTop: 8,
  },

  jobRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
  },
  jobName: {
    color: colors.textPrimary, fontFamily: 'Inter-Regular',
    fontSize: 11, flex: 1,
  },
  jobState: {
    color: colors.textTertiary, fontFamily: 'Inter-Regular',
    fontSize: 10, marginLeft: 8,
  },
});
