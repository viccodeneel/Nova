import { NOVA_TOOLS, executeReadOnlyTool } from './tools.ts';
import type { AssistantProvider } from './provider.ts';
import { GeminiProvider } from './providers/geminiProvider.ts';
import { AnthropicProvider } from './providers/anthropicProvider.ts';

type Context = { accountId?: string };
const needsAccountData = /\b(account|balance|equity|drawdown|position|p&l|profit|loss|trade history|my trades)\b/i;
const needsDashboardData = /\b(my name|who am i|profile|dashboard|journal|analytics|net worth|net-worth|assets|liabilities|recent trades|trade performance|win rate)\b/i;
const requestsNavigation = /\b(open|go to|take me to|navigate to|switch to|show(?: me)?)\b.*\b(dashboard|overview|journal|analytics|accounts?|trades?|net worth|settings|nova)\b/i;
const instructions = [
  'You are NOVA, a concise assistant inside a personal trading dashboard.',
  'Use get_account_info for precise questions about the selected verified MT5 account, such as balance, equity, profit, drawdown, open positions, or recorded trades.',
  'Use get_dashboard_summary for questions about the owner name, dashboard profile, multiple accounts, open positions, trade journal, analytics, or Net Worth. Use only the returned facts; never guess.',
  'Use navigate_to_tab only when the user explicitly asks to open or switch to a dashboard section. The tool permits only the existing NOVA pages.',
  'If a user asks both for dashboard facts and navigation, complete the requested navigation only when the tool explicitly provides an allowed page.',
  'Never invent balances, positions, trades, identity, connection state, prices, net worth, or performance. For stale account data, say so and mention the last sync time when available.',
  'Do not place, modify, or close trades and do not change profile, finance, or journal data. All data tools are read-only; navigation is limited to the explicit user request.',
  'For general questions that do not need dashboard data, answer briefly and distinguish general information from live account analysis.',
].join(' ');

function createProvider(): AssistantProvider {
  const selectedProvider = (process.env.NOVA_AI_PROVIDER || 'gemini').trim().toLowerCase();

  if (selectedProvider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw Object.assign(new Error('Anthropic is not configured.'), { code: 'AI_NOT_CONFIGURED' });
    return new AnthropicProvider(apiKey, process.env.CLAUDE_MODEL || 'claude-sonnet-4-6');
  }

  if (selectedProvider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw Object.assign(new Error('Gemini is not configured.'), { code: 'AI_NOT_CONFIGURED' });
    return new GeminiProvider(apiKey, process.env.GEMINI_MODEL || 'gemini-3.8-flash');
  }

  throw Object.assign(new Error('Unsupported AI provider.'), { code: 'AI_NOT_CONFIGURED' });
}

export async function runNovaAssistant(message: string, context: Context, provider: AssistantProvider = createProvider()) {
  const started = Date.now();
  const turn = await provider.generate({ message, systemInstruction: instructions, tools: [...NOVA_TOOLS] });
  if (!turn.toolCalls.length) {
    if (requestsNavigation.test(message)) {
      throw Object.assign(new Error('Requested dashboard navigation was not completed.'), { code: 'DASHBOARD_ACTION_NOT_RETRIEVED' });
    }
    if (needsAccountData.test(message) || needsDashboardData.test(message)) {
      throw Object.assign(new Error('Dashboard or account information was not retrieved.'), { code: 'LIVE_DATA_NOT_RETRIEVED' });
    }
    const answer = turn.text?.trim();
    if (!answer) throw Object.assign(new Error('AI provider returned no text.'), { code: 'AI_EMPTY_RESPONSE' });
    console.info('[NOVA AI] request completed', { provider: process.env.NOVA_AI_PROVIDER || 'gemini', toolCalls: 0, durationMs: Date.now() - started });
    return { response: answer, toolCalls: [], account: null, dashboard: null, navigation: null };
  }
  if (turn.toolCalls.length !== 1) {
    throw Object.assign(new Error('Only one NOVA dashboard tool can run per request.'), { code: 'TOOL_NOT_ALLOWED' });
  }
  const { name: toolName, args = {} } = turn.toolCalls[0];
  if (!['get_account_info', 'get_dashboard_summary', 'navigate_to_tab'].includes(toolName)) {
    throw Object.assign(new Error('Requested tool is not allowed.'), { code: 'TOOL_NOT_ALLOWED' });
  }
  const toolResult = await executeReadOnlyTool(toolName, context, args);
  const answer = await provider.respondAfterTool({ message, systemInstruction: instructions, turn, toolName, toolResult });
  if (!answer) throw Object.assign(new Error('AI provider returned no final answer.'), { code: 'AI_EMPTY_RESPONSE' });
  console.info('[NOVA AI] request completed', { provider: process.env.NOVA_AI_PROVIDER || 'gemini', toolCalls: 1, tool: toolName, durationMs: Date.now() - started });
  return {
    response: answer,
    toolCalls: [{ name: toolName, success: true }],
    account: toolName === 'get_account_info' ? toolResult : null,
    dashboard: toolName === 'get_dashboard_summary' ? toolResult : null,
    navigation: toolName === 'navigate_to_tab' ? toolResult : null,
  };
}
