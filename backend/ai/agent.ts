import { READ_ONLY_TOOLS, executeReadOnlyTool } from './tools.ts';
import type { AssistantProvider } from './provider.ts';
import { GeminiProvider } from './providers/geminiProvider.ts';

type Context = { accountId?: string };
const needsAccountData = /\b(account|balance|equity|drawdown|position|p&l|profit|loss|trade history|my trades)\b/i;
const instructions = [
  'You are NOVA, a concise assistant inside a personal trading dashboard.',
  'Use get_account_info for questions that need account facts such as balance, equity, profit, drawdown, open positions, or recorded trades.',
  'Never invent balances, positions, trades, connection state, prices, or performance. Account facts must come from the tool result.',
  'If the tool reports stale or disconnected data, state that clearly and mention the last sync time when available.',
  'Do not place, modify, or close trades. Only the declared read-only tool is available.',
  'For general questions that do not need private account data, answer briefly and distinguish general information from live account analysis.',
].join(' ');

function createProvider(): AssistantProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('AI provider is not configured.'), { code: 'AI_NOT_CONFIGURED' });
  return new GeminiProvider(apiKey, process.env.GEMINI_MODEL || 'gemini-3.8-flash');
}

export async function runNovaAssistant(message: string, context: Context, provider: AssistantProvider = createProvider()) {
  const started = Date.now();
  const turn = await provider.generate({ message, systemInstruction: instructions, tools: [...READ_ONLY_TOOLS] });
  if (!turn.toolCalls.length) {
    if (needsAccountData.test(message)) throw Object.assign(new Error('Live account information was not retrieved.'), { code: 'LIVE_DATA_NOT_RETRIEVED' });
    const answer = turn.text?.trim();
    if (!answer) throw Object.assign(new Error('AI provider returned no text.'), { code: 'AI_EMPTY_RESPONSE' });
    console.info('[NOVA AI] request completed', { toolCalls: 0, durationMs: Date.now() - started });
    return { response: answer, toolCalls: [], account: null };
  }
  if (turn.toolCalls.length !== 1 || turn.toolCalls[0].name !== 'get_account_info') {
    throw Object.assign(new Error('Requested tool is not allowed.'), { code: 'TOOL_NOT_ALLOWED' });
  }
  const toolName = turn.toolCalls[0].name;
  const account = await executeReadOnlyTool(toolName, context) as Record<string, unknown>;
  const answer = await provider.respondAfterTool({ message, systemInstruction: instructions, turn, toolName, toolResult: account });
  if (!answer) throw Object.assign(new Error('AI provider returned no final answer.'), { code: 'AI_EMPTY_RESPONSE' });
  console.info('[NOVA AI] request completed', { toolCalls: 1, tool: toolName, durationMs: Date.now() - started });
  return { response: answer, toolCalls: [{ name: toolName, success: true }], account };
}
