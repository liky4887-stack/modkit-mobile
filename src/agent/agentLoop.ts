// Agent loop — prompt-emulated tool calling.
// DeepSeek returns JSON: either {"tool":"...","args":{...}} or {"final":"..."}.
// We execute tools through toolsClient, feed results back, loop until final.

import { deepseekClient } from '@/chat/deepseekClient';
import { toolsClient } from '@/api/toolsClient';
import { eventBus } from '@/orchestration/eventBus';
import { renderToolList, isValidTool } from './toolDefs';

export const AGENT_PROMPT_VERSION = 'agent-v1';
const MAX_ITERATIONS = 12;
const MAX_TOOL_RESULT_CHARS = 12000;

export interface AgentStep {
  iteration: number;
  kind: 'tool' | 'final' | 'parse_error';
  tool?: string;
  args?: Record<string, unknown>;
  resultPreview?: string;
  resultChars?: number;
  elapsedMs?: number;
  final?: string;
  raw?: string;
}

export interface AgentResult {
  chatId: string;
  dsSessionId: string | null;
  final: string;
  steps: AgentStep[];
  totalMs: number;
  iterations: number;
}

function systemPreamble(): string {
  return [
    'You are a binary analysis agent with tools to inspect an Android APK already loaded in a sidecar.',
    'The APK is the target of the user query below.',
    '',
    'You have exactly these tools:',
    renderToolList(),
    '',
    '═══════════════════════════════════════════════════════════════',
    'RESPONSE FORMAT — read carefully, this is how you call tools:',
    '═══════════════════════════════════════════════════════════════',
    '',
    'To call a tool, return ONLY this JSON on one line:',
    '  {"tool": "<tool_name>", "args": {<arguments>}}',
    '',
    'To finish, return ONLY this JSON on one line:',
    '  {"final": "<your complete answer as a string>"}',
    '',
    'Rules:',
    '  1. One JSON object per reply. No prose. No markdown fences. No explanation outside the JSON.',
    '  2. Call tools only when they give you new information. Do not repeat a call with the same args.',
    '  3. Prefer specific searches over broad ones. "frida" beats list_value_strings.',
    '  4. When you have enough evidence, return {"final": "..."}. The final answer is what the user sees.',
    '  5. If a tool errors, adapt — try a different tool, not the same call again.',
    '  6. Maximum 12 tool calls per query. Plan accordingly.',
    '',
    'Begin.',
  ].join('\n');
}

function trimResult(s: string): string {
  if (s.length <= MAX_TOOL_RESULT_CHARS) return s;
  return s.slice(0, MAX_TOOL_RESULT_CHARS) + '\n…[truncated ' + (s.length - MAX_TOOL_RESULT_CHARS) + ' chars]';
}

function parseReply(text: string): { kind: 'tool'; tool: string; args: Record<string, unknown> }
                              | { kind: 'final'; final: string }
                              | { kind: 'parse_error'; raw: string } {
  const trimmed = (text || '').trim();
  // Strip markdown fences if present
  let cleaned = trimmed;
  const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) cleaned = fence[1].trim();

  // Find first { and last }
  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s < 0 || e <= s) return { kind: 'parse_error', raw: cleaned.slice(0, 400) };

  let obj: any;
  try { obj = JSON.parse(cleaned.slice(s, e + 1)); }
  catch { return { kind: 'parse_error', raw: cleaned.slice(0, 400) }; }

  if (typeof obj.final === 'string') return { kind: 'final', final: obj.final };
  if (typeof obj.tool === 'string' && isValidTool(obj.tool)) {
    return { kind: 'tool', tool: obj.tool, args: obj.args || {} };
  }
  return { kind: 'parse_error', raw: JSON.stringify(obj).slice(0, 400) };
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    const r: any = await toolsClient.call(name, args);
    return JSON.stringify(r, null, 0);
  } catch (e) {
    return JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

export const agentLoop = {
  async run(args: {
    jobId?: string | null;
    query: string;
    apkHint?: string;
    maxIterations?: number;
  }): Promise<AgentResult> {
    const t0 = Date.now();
    const maxIter = args.maxIterations ?? MAX_ITERATIONS;
    const steps: AgentStep[] = [];
    const scanId = args.jobId || 'agent';

    eventBus.emit({
      scanId, correlationId: scanId, phase: 'analyze',
      functionId: 'orchestration_logs', severity: 'info',
      payload: { action: 'agent_start', query: args.query.slice(0, 120) },
    });

    // Build initial prompt
    const preamble = systemPreamble();
    const ctx: string[] = [];
    if (args.apkHint) ctx.push('Target APK: ' + args.apkHint);
    ctx.push('User query: ' + args.query);

    let prompt = preamble + '\n\n' + ctx.join('\n') + '\n\nYour reply:';

    let chatId = '';
    let dsSessionId: string | null = null;
    let final = '';

    for (let i = 0; i < maxIter; i++) {
      const iterStart = Date.now();

      // Send to DeepSeek. Reuse chat for multi-turn context.
      const r = await deepseekClient.send(prompt, {
        jobId: args.jobId ?? null,
        phase: 'analyze',
        purpose: 'agent_loop_' + i,
        promptVersion: AGENT_PROMPT_VERSION,
        reuseChatId: chatId || null,
        maxRetries: 1,
        timeoutMs: 180000,
      });

      if (!chatId) chatId = r.chatId;
      if (r.dsSessionId) dsSessionId = r.dsSessionId;

      const parsed = parseReply(r.content);

      if (parsed.kind === 'final') {
        steps.push({ iteration: i, kind: 'final', final: parsed.final, elapsedMs: Date.now() - iterStart });
        final = parsed.final;
        break;
      }

      if (parsed.kind === 'parse_error') {
        steps.push({ iteration: i, kind: 'parse_error', raw: parsed.raw, elapsedMs: Date.now() - iterStart });
        // Feed a repair instruction back
        prompt = [
          'Your previous reply could not be parsed as the required JSON.',
          'It began with: ' + parsed.raw.slice(0, 200),
          '',
          'Reply with ONE JSON object only: {"tool":"...","args":{...}} or {"final":"..."}. No prose. No fences.',
        ].join('\n');
        continue;
      }

      // Tool call
      const toolName = parsed.tool;
      const toolArgs = parsed.args || {};

      const toolStart = Date.now();
      const toolResult = await executeTool(toolName, toolArgs);
      const toolMs = Date.now() - toolStart;

      const trimmed = trimResult(toolResult);
      steps.push({
        iteration: i,
        kind: 'tool',
        tool: toolName,
        args: toolArgs,
        resultPreview: trimmed.slice(0, 300),
        resultChars: trimmed.length,
        elapsedMs: toolMs,
      });

      eventBus.emit({
        scanId, correlationId: scanId, phase: 'analyze',
        functionId: 'orchestration_logs', severity: 'info',
        payload: {
          action: 'agent_tool',
          iteration: i,
          tool: toolName,
          resultChars: trimmed.length,
          elapsedMs: toolMs,
        },
      });

      // Feed result back in the same conversation
      prompt = [
        'Result of ' + toolName + ':',
        trimmed,
        '',
        'Now decide: another tool call, or final answer. Reply with ONE JSON object only.',
      ].join('\n');
    }

    if (!final) {
      // Build a fallback final from collected steps
      const toolList = steps.filter(s => s.kind === 'tool').map(s => s.tool).join(', ');
      final = 'Reached max iterations (' + maxIter + ') without a final answer. Tools called: ' +
        (toolList || 'none') + '. Last step: ' +
        (steps[steps.length - 1]?.resultPreview || 'none');
    }

    const totalMs = Date.now() - t0;

    eventBus.emit({
      scanId, correlationId: scanId, phase: 'analyze',
      functionId: 'orchestration_logs', severity: 'info',
      payload: {
        action: 'agent_done',
        iterations: steps.length,
        totalMs,
        toolsCalled: steps.filter(s => s.kind === 'tool').length,
      },
    });

    return {
      chatId,
      dsSessionId,
      final,
      steps,
      totalMs,
      iterations: steps.length,
    };
  },
};
