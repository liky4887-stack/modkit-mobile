// The single entry point for every DeepSeek call in the app.
// Registers the chat, acquires rate limiter, sends, persists both turns,
// retries with backoff, falls back to other engines.
import { chatRegistry, ChatRecord } from './chatRegistry';
import { globalRateLimiter } from './rateLimiter';
import { httpLog, preview } from '@/api/httpLog';
import { eventBus } from '@/orchestration/eventBus';

const BACKEND = 'http://127.0.0.1:8790';
const CHAT_URL = BACKEND + '/deepseek/chat';

export interface SendOptions {
  jobId?: string | null;
  unitId?: string | null;
  phase: string;
  purpose?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  mode?: 'chat' | 'plan';
  timeoutMs?: number;
  maxRetries?: number;
  reuseChatId?: string | null;
}

export interface SendResult {
  chatId: string;
  content: string;
  dsSessionId: string | null;
  elapsedMs: number;
  tokensIn: number;
  tokensOut: number;
  retries: number;
  model: string;
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Rough estimate — 1 token ≈ 4 chars for English. Used for budget tracking only.
function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface ChatResponse {
  ok: boolean;
  response?: {
    code: number;
    msg: string;
    data: { content: string; chat_session_id: string; message_id: string | null };
  };
  error?: string;
  code?: string;
}

export const deepseekClient = {
  // Primary call. Handles session creation + reuse + persistence + retry.
  async send(prompt: string, opts: SendOptions): Promise<SendResult> {
    const maxRetries = opts.maxRetries ?? 3;
    const timeoutMs = opts.timeoutMs ?? 180000;
    const model = opts.model ?? 'deepseek-chat';

    // Find or create chat
    let chat: ChatRecord;
    if (opts.reuseChatId) {
      const existing = await chatRegistry.get(opts.reuseChatId);
      if (existing && existing.state === 'open') {
        chat = existing;
      } else {
        chat = await chatRegistry.create({
          jobId: opts.jobId, unitId: opts.unitId, phase: opts.phase,
          purpose: opts.purpose, model, promptVersion: opts.promptVersion,
        });
      }
    } else {
      chat = await chatRegistry.create({
        jobId: opts.jobId, unitId: opts.unitId, phase: opts.phase,
        purpose: opts.purpose, model, promptVersion: opts.promptVersion,
      });
    }

    eventBus.emit({
      scanId: opts.jobId || 'chat',
      correlationId: chat.id,
      phase: (opts.phase as any) || 'analyze',
      functionId: 'orchestration_logs',
      severity: 'info',
      payload: {
        action: 'chat_send_start',
        chatId: chat.id,
        purpose: opts.purpose || null,
        promptChars: prompt.length,
      },
    });

    // Record the user turn before sending so a crash still has the prompt
    await chatRegistry.appendTurn({
      chatId: chat.id,
      jobId: opts.jobId ?? null,
      role: 'user',
      content: prompt,
      tokens: estimateTokens(prompt),
    });

    const limiterId = uuid();
    await globalRateLimiter.acquireWithWait(limiterId);

    let lastError: Error | null = null;
    let retries = 0;
    let elapsedMs = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const t0 = Date.now();
      try {
        const body: Record<string, unknown> = {
          prompt,
          model,
          mode: opts.mode ?? 'chat',
        };
        // DO NOT send sessionId. chat.deepseek.com accumulates server-side
        // history keyed by session_id. After ~10 turns the accumulated
        // context crosses a limit and DeepSeek returns HTTP 200 with
        // content="" instead of an error. Every subsequent call on that
        // session_id also returns empty, poisoning the rest of the run.
        // The full transcript is already sent inline in `prompt`, so no
        // context is lost by always opening a fresh session.

        const reqBody = JSON.stringify(body);

        const res = await fetchWithTimeout(CHAT_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: reqBody,
        }, timeoutMs);

        const text = await res.text();
        elapsedMs = Date.now() - t0;

        httpLog.record({
          method: 'POST',
          url: CHAT_URL,
          reqPreview: preview(prompt),
          resStatus: res.status,
          resPreview: preview(text),
          durationMs: elapsedMs,
          error: null,
        });

        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          // Retryable
          lastError = new Error('HTTP ' + res.status);
          globalRateLimiter.release(limiterId, { status: res.status });
          retries = attempt + 1;
          if (attempt < maxRetries) {
            await globalRateLimiter.acquireWithWait(limiterId);
            continue;
          }
          throw lastError;
        }

        let json: ChatResponse;
        try { json = JSON.parse(text); } catch {
          throw new Error('deepseek non-JSON: ' + text.slice(0, 200));
        }

        if (!json.ok || !json.response || json.response.code !== 0) {
          const errMsg = json.error || json.response?.msg || 'chat failed';
          throw new Error(errMsg);
        }

        const content = json.response.data.content ?? '';
        const dsSessionId = json.response.data.chat_session_id ?? null;


        // Empty content on 200 is the signature of the cookie bridge
        // losing a race against a concurrent call. Retry once.
        if (content.trim().length === 0 && attempt < maxRetries) {
          httpLog.record({
            method: 'POST',
            url: CHAT_URL,
            reqPreview: '(empty reply)',
            resStatus: 200,
            resPreview: '',
            durationMs: elapsedMs,
            error: 'empty reply — retrying',
          });
          await new Promise(r => setTimeout(r, 1500 + Math.floor(Math.random() * 1000)));
          retries = attempt + 1;
          continue;
        }

        await chatRegistry.appendTurn({
          chatId: chat.id,
          jobId: opts.jobId ?? null,
          role: 'assistant',
          content,
          tokens: estimateTokens(content),
          dsSessionId,
          elapsedMs,
        });

        if (dsSessionId && dsSessionId !== chat.dsSessionId) {
          await chatRegistry.setSessionId(chat.id, dsSessionId);
        }

        globalRateLimiter.release(limiterId, null);

        eventBus.emit({
          scanId: opts.jobId || 'chat',
          correlationId: chat.id,
          phase: (opts.phase as any) || 'analyze',
          functionId: 'orchestration_logs',
          severity: 'info',
          payload: {
            action: 'chat_send_ok',
            chatId: chat.id,
            elapsedMs,
            contentChars: content.length,
          },
        });

        return {
          chatId: chat.id,
          content,
          dsSessionId,
          elapsedMs,
          tokensIn: estimateTokens(prompt),
          tokensOut: estimateTokens(content),
          retries,
          model,
        };
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        elapsedMs = Date.now() - t0;
        globalRateLimiter.release(limiterId, { status: (e as any)?.status });

        await chatRegistry.appendTurn({
          chatId: chat.id,
          jobId: opts.jobId ?? null,
          role: 'assistant',
          content: '',
          tokens: 0,
          dsSessionId: null,
          elapsedMs,
          error: lastError.message,
        });

        if (attempt < maxRetries) {
          const backoff = Math.min(30000, 1000 * Math.pow(2, attempt));
          const jitter = Math.floor(Math.random() * 500);
          await new Promise(r => setTimeout(r, backoff + jitter));
          retries = attempt + 1;
          continue;
        }
        break;
      }
    }

    await chatRegistry.close(chat.id, lastError?.message ?? 'unknown');
    throw lastError ?? new Error('deepseek send failed');
  },

  // Close a chat cleanly.
  async close(chatId: string): Promise<void> {
    await chatRegistry.close(chatId, null);
  },

  // Abort — used for cancel.
  async abort(chatId: string, reason: string): Promise<void> {
    await chatRegistry.abort(chatId, reason);
  },

  // Extract JSON from a reply that may include prose or markdown fences.
  extractJson<T>(text: string): T | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  },
};
