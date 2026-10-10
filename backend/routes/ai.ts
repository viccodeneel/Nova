import { Router, type Request, type Response } from 'express';
import { createProvider, runNovaAssistant } from '../ai/agent.ts';
import { resolveProviderName } from '../ai/provider.ts';
import { isWebSearchConfigured } from '../ai/webTools.ts';
import { matchSimpleNavigation, runNovaAgent, type HistoryItem } from '../ai/novaAgent.ts';
import { listMemories, removeMemory } from '../ai/memory.ts';

const router = Router();
router.get('/status', (_req: Request, res: Response) => {
  const provider = resolveProviderName();
  const enabled = provider === 'anthropic' ? Boolean(process.env.ANTHROPIC_API_KEY)
    : provider === 'gemini' && Boolean(process.env.GEMINI_API_KEY);
  const expectedKey = provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
  res.json({ success: true, data: { enabled, provider: enabled ? provider : null, expected_key: expectedKey, web_search: isWebSearchConfigured() } });
});

const TABS = ['overview', 'trade-journal', 'analytics', 'accounts', 'ai', 'finance', 'settings'];
function parseHistory(raw: unknown): HistoryItem[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 40) return null;
  const out: HistoryItem[] = [];
  for (const item of raw) {
    if (!item || (item.role !== 'user' && item.role !== 'assistant') || typeof item.text !== 'string' || item.text.length > 4000) return null;
    out.push({ role: item.role, text: item.text });
  }
  return out;
}

router.get('/memory', async (_req: Request, res: Response) => {
  try { res.json({ success: true, data: await listMemories() }); }
  catch (e) { res.status(500).json({ success: false, error: { code: 'MEMORY_FAILED', message: (e as Error).message } }); }
});
router.delete('/memory/:id', async (req: Request, res: Response) => {
  try { (await removeMemory(req.params.id)) ? res.json({ success: true }) : res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Memory not found.' } }); }
  catch (e) { res.status(500).json({ success: false, error: { code: 'MEMORY_FAILED', message: (e as Error).message } }); }
});

// Simple per-process spend guard: this is a single-owner app, so one shared window is enough.
const recent: number[] = [];
router.post('/chat', async (req: Request, res: Response) => {
  const started = Date.now();
  while (recent.length && started - recent[0] > 60_000) recent.shift();
  if (recent.length >= 30) {
    return res.status(429).json({ success: false, error: { code: 'AI_RATE_LIMITED', message: 'Too many NOVA requests in a minute. Wait a moment and try again.' } });
  }
  recent.push(started);
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const accountId = typeof req.body?.account_id === 'string' ? req.body.account_id : undefined;
  const stream = req.body?.stream === true;
  const history = parseHistory(req.body?.history);
  const activeTab = typeof req.body?.active_tab === 'string' && TABS.includes(req.body.active_tab) ? req.body.active_tab : undefined;
  const mode: 'voice' | 'text' = req.body?.mode === 'voice' ? 'voice' : 'text';
  if (!history) return res.status(400).json({ success: false, error: { code: 'INVALID_HISTORY', message: 'Conversation history is malformed.' } });
  if (!message || message.length > 2000) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_MESSAGE', message: 'Enter a message of 1 to 2000 characters.' } });
  }
  if (accountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ACCOUNT', message: 'The selected account ID is invalid.' } });
  }

  const providerName = resolveProviderName();
  const sendEvent = (data: Record<string, unknown>) => {
    if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  // Routing: a bare navigation command is instant and needs no model; everything else goes to the reasoning agent.
  const respond = async (onText?: (text: string) => void) => {
    const nav = matchSimpleNavigation(message);
    if (nav) return { response: `Opening ${nav.label}.`, toolCalls: [{ name: 'navigate_to_tab', success: true }], account: null, dashboard: null, navigation: nav };
    const provider = createProvider();
    if (provider.complete) return runNovaAgent({ message, history, accountId, activeTab, mode }, provider, onText);
    return runNovaAssistant(message, { accountId }, undefined, onText);
  };
  try {
    if (stream) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      let sentText = false;
      const data = await respond((text) => {
        sentText = true;
        sendEvent({ type: 'chunk', text });
      });
      if (!sentText) sendEvent({ type: 'chunk', text: data.response });
      sendEvent({ type: 'done', data });
      res.end();
      return;
    }

    const data = await respond();
    res.json({ success: true, data });
  } catch (error) {
    const err = error as Error & { code?: string; status?: number | string; statusCode?: number | string; providerErrorType?: string; providerMessage?: string; providerStage?: string };
    const providerStatus = String(err.status || err.statusCode || err.code || '');
    const diagnostic = providerStatus.toUpperCase();
    const numericStatus = Number(providerStatus);
    let code = err.code || 'AI_REQUEST_FAILED';
    if (!['AI_NOT_CONFIGURED', 'NO_ACCOUNT', 'ACCOUNT_SELECTION_REQUIRED', 'ACCOUNT_NOT_FOUND', 'LIVE_DATA_NOT_RETRIEVED', 'DASHBOARD_ACTION_NOT_RETRIEVED', 'AI_EMPTY_RESPONSE', 'AI_LOOP_LIMIT', 'TOOL_NOT_ALLOWED'].includes(code)) {
      if (/401|UNAUTHENTICATED|API_KEY/.test(diagnostic) || /403|PERMISSION_DENIED/.test(diagnostic)) code = 'AI_PROVIDER_ACCESS';
      else if (/429|RESOURCE_EXHAUSTED|QUOTA/.test(diagnostic)) code = 'AI_PROVIDER_LIMIT';
      else if (/404|NOT_FOUND/.test(diagnostic)) code = 'AI_MODEL_UNAVAILABLE';
      else if (/400|INVALID_ARGUMENT/.test(diagnostic)) code = 'AI_PROVIDER_BAD_REQUEST';
      else if ((numericStatus >= 500 && numericStatus <= 599) || /UNAVAILABLE|DEADLINE_EXCEEDED/.test(diagnostic)) code = 'AI_PROVIDER_UNAVAILABLE';
      else code = 'AI_PROVIDER_REQUEST_FAILED';
    }
    const status = code === 'AI_NOT_CONFIGURED' || code === 'AI_PROVIDER_LIMIT' || code === 'AI_PROVIDER_UNAVAILABLE' ? 503
      : ['NO_ACCOUNT', 'ACCOUNT_SELECTION_REQUIRED', 'ACCOUNT_NOT_FOUND'].includes(code) ? 409 : 502;
    const messages: Record<string, string> = {
      AI_NOT_CONFIGURED: 'NOVA text reasoning is not configured on the backend.',
      NO_ACCOUNT: 'No verified MT5 account is connected yet.',
      ACCOUNT_SELECTION_REQUIRED: 'Select an account in NOVA before asking about account data.',
      ACCOUNT_NOT_FOUND: 'The selected MT5 account could not be found.',
      LIVE_DATA_NOT_RETRIEVED: 'NOVA could not verify the account data needed to answer. Try again.',
      DASHBOARD_ACTION_NOT_RETRIEVED: 'NOVA could not open that dashboard section. Try asking again.',
      AI_EMPTY_RESPONSE: 'The AI provider returned an empty answer. Try again.',
      TOOL_NOT_ALLOWED: 'NOVA rejected an unsupported tool request.',
      AI_LOOP_LIMIT: 'NOVA took too many steps on that request. Try asking it more simply.',
      AI_PROVIDER_ACCESS: 'The configured AI provider rejected its API key or account access. Check the provider key and model access.',
      AI_PROVIDER_LIMIT: 'NOVA hit the AI provider’s rate or quota limit. On a free tier this usually clears within a minute, so try again shortly.',
      AI_MODEL_UNAVAILABLE: 'The configured AI model is unavailable. Check the selected provider and model setting in Render.',
      AI_PROVIDER_BAD_REQUEST: 'The AI provider rejected the request. Check the backend deployment and configured model.',
      AI_PROVIDER_UNAVAILABLE: 'The AI provider is temporarily unavailable. Try again shortly.',
      AI_PROVIDER_REQUEST_FAILED: 'The AI provider request failed. Check Render logs for the NOVA AI error code.',
    };
    console.warn('[NOVA AI] request failed', {
      code, provider: providerName, durationMs: Date.now() - started,
      errorType: err.name || 'Error',
      providerStatus: numericStatus >= 100 && numericStatus <= 599 ? numericStatus : undefined,
      providerErrorType: err.providerErrorType,
      providerStage: err.providerStage,
      providerMessage: err.providerMessage,
    });
    const errorPayload = { code, message: messages[code] || 'NOVA could not complete that request.' };
    if (stream && res.headersSent) {
      sendEvent({ type: 'error', error: errorPayload });
      res.end();
      return;
    }
    res.status(status).json({ success: false, error: errorPayload });
  }
});

export default router;
