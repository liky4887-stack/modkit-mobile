// Chat lifecycle: stuck detection, cleanup, aggregate health.
import { chatRegistry, ChatRecord } from './chatRegistry';
import { globalRateLimiter } from './rateLimiter';
import { eventBus } from '@/orchestration/eventBus';

const STUCK_THRESHOLD_MS = 180000; // 3 minutes with no turn

export const chatLifecycle = {
  // Called periodically. Finds chats idle beyond threshold and aborts them.
  async sweepStuck(): Promise<ChatRecord[]> {
    const stuck = await chatRegistry.findStuck(STUCK_THRESHOLD_MS);
    for (const chat of stuck) {
      await chatRegistry.abort(chat.id, 'stuck: no turn in ' + STUCK_THRESHOLD_MS + 'ms');
      eventBus.emit({
        scanId: chat.jobId || 'lifecycle',
        correlationId: chat.id,
        phase: 'recovery',
        functionId: 'orchestration_logs',
        severity: 'warn',
        payload: { action: 'chat_aborted_stuck', chatId: chat.id, phase: chat.phase },
      });
    }
    return stuck;
  },

  // Close all open chats for a job (used on cancel or completion).
  async closeAllForJob(jobId: string, reason: string): Promise<number> {
    const chats = await chatRegistry.listByJob(jobId, 500);
    let closed = 0;
    for (const c of chats) {
      if (c.state === 'open') {
        await chatRegistry.abort(c.id, reason);
        closed++;
      }
    }
    return closed;
  },

  // Aggregate snapshot for the CHATS tab header.
  async snapshot(): Promise<{
    active: ChatRecord[];
    recent: ChatRecord[];
    stats24h: Awaited<ReturnType<typeof chatRegistry.stats>>;
    limiter: ReturnType<typeof globalRateLimiter.stats>;
  }> {
    const [active, recent, stats24h] = await Promise.all([
      chatRegistry.listActive(50),
      chatRegistry.listRecent(50),
      chatRegistry.stats(24 * 3600 * 1000),
    ]);
    return {
      active,
      recent,
      stats24h,
      limiter: globalRateLimiter.stats(),
    };
  },
};
