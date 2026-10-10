import { createProvider, withTransientRetry } from './agent.ts';
import type { AssistantProvider, ChatMsg, CompleteResult, TextChunkHandler } from './provider.ts';
import { AGENT_TOOLS, NAVIGATION_PAGES, executeAgentTool, type AgentPage } from './agentTools.ts';
import { buildSystemPrompt } from './persona.ts';
import { retrieveRelevant } from './memory.ts';
import { getProfile } from '../services/profileService.ts';

export type HistoryItem = { role: 'user' | 'assistant'; text: string };
export interface AgentInput { message: string; history: HistoryItem[]; accountId?: string; activeTab?: string; mode: 'voice' | 'text' }
export interface AgentResult {
  response: string; toolCalls: Array<{ name: string; success: boolean }>;
  navigation: { page: AgentPage; label: string } | null; account: Record<string, unknown> | null; dashboard: null;
}
const MAX_STEPS = 6;

// Only a message that is *entirely* a navigation command skips the model. Anything richer goes to the agent.
const SIMPLE_NAV = /^(?:(?:hey\s+)?nova[,\s]+)?(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:open|go to|take me to|navigate to|switch to|show me|bring up|pull up)\s+(?:the\s+|my\s+)?(dashboard|overview|trade journal|journal|analytics|accounts?|net worth|settings|nova|ai)(?:\s+(?:page|tab|screen|section))?(?:\s+(?:please|for me))?[\s.!?]*$/i;
const NAV_WORDS: Record<string, AgentPage> = { dashboard: 'overview', overview: 'overview', 'trade journal': 'trade-journal', journal: 'trade-journal', analytics: 'analytics', account: 'accounts', accounts: 'accounts', 'net worth': 'finance', settings: 'settings', nova: 'ai', ai: 'ai' };

export function matchSimpleNavigation(message: string): { page: AgentPage; label: string } | null {
  const word = SIMPLE_NAV.exec(message.trim())?.[1]?.toLowerCase();
  const page = word ? NAV_WORDS[word] : undefined;
  return page ? { page, label: NAVIGATION_PAGES[page] } : null;
}

/** Cleans client-supplied history into a strictly alternating user/assistant sequence ending with the new message. */
export function buildMessages(history: HistoryItem[], message: string): ChatMsg[] {
  const turns: HistoryItem[] = [];
  for (const item of history.slice(-14)) {
    const text = item.text.trim().slice(0, 1500);
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === item.role) last.text += `\n${text}`; else turns.push({ role: item.role, text });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const last = turns[turns.length - 1];
  if (last?.role === 'user') last.text += `\n${message}`; else turns.push({ role: 'user', text: message });
  return turns.map((t) => (t.role === 'user' ? { role: 'user' as const, text: t.text } : { role: 'assistant' as const, text: t.text, toolCalls: [] }));
}

export async function runNovaAgent(input: AgentInput, provider: AssistantProvider = createProvider(), onText?: TextChunkHandler): Promise<AgentResult> {
  if (!provider.complete) throw Object.assign(new Error('Provider does not support tool calling.'), { code: 'AI_NOT_CONFIGURED' });
  const started = Date.now();
  const [profile, memories] = await Promise.all([getProfile().catch(() => ({ display_name: 'there' })), retrieveRelevant(input.message).catch(() => [])]);
  const system = buildSystemPrompt({ userName: profile.display_name || 'there', now: new Date(), activeTab: input.activeTab, mode: input.mode, memories });
  const messages = buildMessages(input.history, input.message);
  const toolLog: AgentResult['toolCalls'] = [];
  let navigation: AgentResult['navigation'] = null;
  let account: AgentResult['account'] = null;
  let streamed = false;
  let final: CompleteResult | null = null;
  let carry = '';

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const turn = await withTransientRetry(
      () => provider.complete!({ system, messages, tools: AGENT_TOOLS, maxTokens: input.mode === 'voice' ? 500 : 900 }, onText && ((t) => { streamed = true; onText(t); })),
      () => streamed, () => undefined,
    );
    if (!turn.toolCalls.length) { final = turn; break; }
    if (turn.text) carry = turn.text;
    messages.push({ role: 'assistant', text: turn.text, toolCalls: turn.toolCalls, continuation: turn.continuation });
    const results = await Promise.all(turn.toolCalls.map(async (call) => {
      try {
        const result = await executeAgentTool(call.name, call.args, { accountId: input.accountId, userMessage: input.message });
        toolLog.push({ name: call.name, success: true });
        if (call.name === 'navigate_to_tab') navigation = result as NonNullable<AgentResult['navigation']>;
        if (call.name === 'get_account_info') account = result as Record<string, unknown>;
        return { id: call.id, content: JSON.stringify({ ok: true, data: result }).slice(0, 12000), isError: false };
      } catch (error) {
        const err = error as Error & { code?: string };
        toolLog.push({ name: call.name, success: false });
        return { id: call.id, content: JSON.stringify({ ok: false, error: err.message, code: err.code || 'TOOL_FAILED' }), isError: true };
      }
    }));
    messages.push({ role: 'tool', results });
  }

  const response = (final?.text || '').trim() || carry.trim();
  console.info('[NOVA AI] agent', { mode: input.mode, tools: toolLog.map((t) => `${t.name}${t.success ? '' : ':failed'}`), steps: messages.filter((m) => m.role === 'tool').length + 1, durationMs: Date.now() - started, completed: Boolean(final) });
  if (!final) throw Object.assign(new Error('NOVA could not finish that request.'), { code: 'AI_LOOP_LIMIT' });
  if (!response) throw Object.assign(new Error('Empty answer.'), { code: 'AI_EMPTY_RESPONSE' });
  return { response, toolCalls: toolLog, navigation, account, dashboard: null };
}
