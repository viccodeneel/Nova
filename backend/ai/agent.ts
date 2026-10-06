import { GoogleGenAI } from '@google/genai';
import { executeReadOnlyTool, READ_ONLY_TOOLS } from './tools.ts';

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

export async function runNovaAssistant(message: string, context: Context) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('AI provider is not configured.'), { code: 'AI_NOT_CONFIGURED' });
  const started = Date.now();
  const client = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const first = await client.models.generateContent({
    model, contents: [{ role: 'user', parts: [{ text: message }] }],
    config: { systemInstruction: instructions, tools: [{ functionDeclarations: [...READ_ONLY_TOOLS] }], temperature: 0.2 },
  });
  const calls = first.functionCalls || [];
  if (!calls.length) {
    if (needsAccountData.test(message)) throw Object.assign(new Error('Live account information was not retrieved.'), { code: 'LIVE_DATA_NOT_RETRIEVED' });
    const answer = first.text?.trim();
    if (!answer) throw Object.assign(new Error('AI provider returned no text.'), { code: 'AI_EMPTY_RESPONSE' });
    console.info('[NOVA AI] request completed', { toolCalls: 0, durationMs: Date.now() - started });
    return { response: answer, toolCalls: [], account: null };
  }
  if (calls.length !== 1 || calls[0].name !== 'get_account_info') {
    throw Object.assign(new Error('Requested tool is not allowed.'), { code: 'TOOL_NOT_ALLOWED' });
  }
  const account = await executeReadOnlyTool(calls[0].name, context) as Record<string, unknown>;
  const modelParts = first.candidates?.[0]?.content?.parts;
  if (!modelParts?.length) throw Object.assign(new Error('AI provider returned an incomplete tool call.'), { code: 'AI_EMPTY_RESPONSE' });
  const final = await client.models.generateContent({
    model,
    contents: [
      { role: 'user', parts: [{ text: message }] },
      { role: 'model', parts: modelParts },
      { role: 'user', parts: [{ functionResponse: { name: calls[0].name, response: { result: account } } }] },
    ],
    config: { systemInstruction: instructions, temperature: 0.2 },
  });
  const answer = final.text?.trim();
  if (!answer) throw Object.assign(new Error('AI provider returned no final answer.'), { code: 'AI_EMPTY_RESPONSE' });
  console.info('[NOVA AI] request completed', { toolCalls: 1, tool: calls[0].name, durationMs: Date.now() - started });
  return { response: answer, toolCalls: [{ name: calls[0].name, success: true }], account };
}