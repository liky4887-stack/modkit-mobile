import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Send, Trash2, Sparkles } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { Panel } from './Panel';
import { chatApi } from '@/api/factory';
import { appendChat, getChat, clearChat } from '@/db/chats';
import { buildFindingPrompt } from '@/utils/chatPrompt';
import type { ChatRecord, FeatureRecord, ScanRecord } from '@/db/schema';

const SUGGESTIONS: Record<string, string[]> = {
  'device-fingerprint': [
    'Which of these fingerprint signals are most identifying?',
    'How would I neutralize the strongest signal with a Frida hook?',
    'Is any of this GDPR-relevant PII under EU law?',
  ],
  'runtime-sensing': [
    'Which root/emulator check fires first at app startup?',
    'Give me a Frida script that returns false for all these checks.',
    'Are the /system/bin/su lookups Java or native?',
  ],
  'anti-tamper-hook': [
    'Where exactly does the app look for Frida?',
    'How would I bypass the XposedBridge check?',
    'Is the substrate detection native or Java?',
  ],
  'telemetry-evidence': [
    'Which of these SDKs phones home most aggressively?',
    'What data does Adjust collect by default?',
    'Can I remove the Bugly reporter without breaking the app?',
  ],
  'network-transport-guard': [
    'Is there certificate pinning? Static or dynamic?',
    'Which hostnames are pinned?',
    'How would I defeat the pinner on a rooted device?',
  ],
  'cross-platform-abstraction': [
    'Where does Flutter meet native here?',
    'What plugins are registered on the RN bridge?',
    'Is there any Dart-side anti-debug?',
  ],
};

export function FindingChat({
  scan,
  feature,
}: {
  scan: ScanRecord;
  feature: FeatureRecord;
}) {
  const [messages, setMessages] = useState<ChatRecord[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const msgs = await getChat(scan.id, feature.featureId);
      if (!cancelled) setMessages(msgs);
    })();
    return () => { cancelled = true; };
  }, [scan.id, feature.featureId]);

  const send = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || sending) return;
    setSending(true);
    setError(null);
    setInput('');

    try {
      const userRec: ChatRecord = {
        id: Date.now(), scanId: scan.id, featureId: feature.featureId,
        role: 'user', content: question, createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userRec]);
      await appendChat(scan.id, feature.featureId, 'user', question);

      const history = [...messages, userRec];
      const prompt = buildFindingPrompt(scan, feature, history, question);
      const answer = await chatApi.send(prompt, { thinking: false, search: false });

      const asstRec: ChatRecord = {
        id: Date.now() + 1, scanId: scan.id, featureId: feature.featureId,
        role: 'assistant', content: answer, createdAt: Date.now() + 1,
      };
      setMessages((prev) => [...prev, asstRec]);
      await appendChat(scan.id, feature.featureId, 'assistant', answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }, [feature, messages, scan, sending]);

  const reset = useCallback(async () => {
    await clearChat(scan.id, feature.featureId);
    setMessages([]);
    setError(null);
  }, [feature.featureId, scan.id]);

  const suggestions = SUGGESTIONS[feature.featureId] ?? [];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <Panel title="ASK DEEPSEEK">
        {messages.length === 0 && suggestions.length > 0 && (
          <>
            <Text style={styles.hint}>
              Ask about this finding. Context (scan + feature + thread) is sent every turn.
            </Text>
            <View style={styles.chips}>
              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => void send(s)}
                  activeOpacity={0.75}
                  style={styles.chip}
                >
                  <Sparkles size={10} color={colors.accent} strokeWidth={2} />
                  <Text style={styles.chipText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {messages.length > 0 && (
          <>
            <View style={styles.threadHead}>
              <Text style={styles.threadTitle}>{messages.length} message{messages.length === 1 ? '' : 's'}</Text>
              <TouchableOpacity onPress={reset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Trash2 size={12} color={colors.textTertiary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <ScrollView
              ref={scrollRef}
              style={styles.thread}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((m) => (
                <View
                  key={m.id}
                  style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.asstBubble]}
                >
                  <Text style={styles.bubbleRole}>
                    {m.role === 'user' ? 'YOU' : 'DEEPSEEK'}
                  </Text>
                  <Text style={styles.bubbleText}>{m.content}</Text>
                </View>
              ))}
              {sending && (
                <View style={styles.thinkingRow}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.thinking}>thinking…</Text>
                </View>
              )}
            </ScrollView>
          </>
        )}

        {error && <Text style={styles.err}>{error}</Text>}

        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask a follow-up…"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            editable={!sending}
            multiline
            onSubmitEditing={() => void send(input)}
          />
          <TouchableOpacity
            onPress={() => void send(input)}
            disabled={sending || !input.trim()}
            activeOpacity={0.75}
            style={[styles.sendBtn, (sending || !input.trim()) && { opacity: 0.4 }]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.pureBlack} />
            ) : (
              <Send size={14} color={colors.pureBlack} strokeWidth={2.5} />
            )}
          </TouchableOpacity>
        </View>
      </Panel>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontFamily: 'Inter-Regular', fontSize: 11,
    color: colors.textSecondary, lineHeight: 16, marginBottom: spacing.sm,
  },
  chips: { gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  chipText: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textPrimary, lineHeight: 15 },

  threadHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 6, marginBottom: 6,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  threadTitle: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.textTertiary, letterSpacing: 1 },
  thread: { maxHeight: 320, marginBottom: spacing.sm },

  bubble: {
    borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm,
    borderWidth: 1,
  },
  userBubble: { backgroundColor: colors.accentGlow, borderColor: colors.accentDim ?? colors.border },
  asstBubble: { backgroundColor: colors.surface, borderColor: colors.border },
  bubbleRole: {
    fontFamily: 'JetBrainsMono-Bold', fontSize: 9,
    color: colors.textTertiary, letterSpacing: 1.2, marginBottom: 3,
  },
  bubbleText: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textPrimary, lineHeight: 18 },

  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  thinking: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textTertiary },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  input: {
    flex: 1,
    minHeight: 40, maxHeight: 100,
    fontFamily: 'Inter-Regular', fontSize: 12,
    color: colors.textPrimary,
    backgroundColor: colors.pureBlack,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: 10,
  },
  sendBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent, borderRadius: radius.md,
  },
  err: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.danger, marginTop: 6 },
});
