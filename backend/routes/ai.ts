import { Router, type Request, type Response } from 'express';
import { runNovaAssistant } from '../ai/agent.ts';

const router = Router();
router.get('/status', (_req: Request, res: Response) => {
  const provider = (process.env.NOVA_AI_PROVIDER || 'gemini').trim().toLowerCase();
  const enabled = provider === 'anthropic' ? Boolean(process.env.ANTHROPIC_API_KEY)
    : provider === 'gemini' && Boolean(process.env.GEMINI_API_KEY);
  res.json({ success: true, data: { enabled, provider: enabled ? provider : null } });
});

router.post('/chat', async (req: Request, res: Response) => {
  const started = Date.now();
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const accountId = typeof req.body?.account_id === 'string' ? req.body.account_id : undefined;
  const stream = req.body?.stream === true;
  if (!message || message.length > 2000) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_MESSAGE', message: 'Enter a message of 1 to 2000 characters.' } });
  }
  if (accountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ACCOUNT', message: 'The selected account ID is invalid.' } });
  }

  const providerName = (process.env.NOVA_AI_PROVIDER || 'gemini').trim().toLowerCase();
  const sendEvent = (data: Record<string, unknown>) => {
    if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
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
      const data = await runNovaAssistant(message, { accountId }, undefined, (text) => {
        sentText = true;
        sendEvent({ type: 'chunk', text });
      });
      if (!sentText) sendEvent({ type: 'chunk', text: data.response });
      sendEvent({ type: 'done', data });
      console.info('[NOVA AI] stream completed', { provider: data.navigation ? 'none' : providerName, durationMs: Date.now() - started, receivedText: sentText });
      res.end();
      return;
    }

    const data = await runNovaAssistant(message, { accountId });
    console.info('[NOVA AI] request completed', { provider: data.navigation || data.toolCalls.some((tool) => tool.name === 'read_dashboard') ? 'none' : providerName, durationMs: Date.now() - started });
    res.json({ success: true, data });
  } catch (error) {
    const err = error as Error & { code?: string; status?: number | string; statusCode?: number | string; providerErrorType?: string; providerMessage?: string; providerStage?: string };
    const providerStatus = String(err.status || err.statusCode || err.code || '');
    const diagnostic = providerStatus.toUpperCase();
    const numericStatus = Number(providerStatus);
    let code = err.code || 'AI_REQUEST_FAILED';
    if (!['AI_NOT_CONFIGURED', 'NO_ACCOUNT', 'ACCOUNT_SELECTION_REQUIRED', 'ACCOUNT_NOT_FOUND', 'LIVE_DATA_NOT_RETRIEVED', 'DASHBOARD_ACTION_NOT_RETRIEVED', 'AI_EMPTY_RESPONSE', 'TOOL_NOT_ALLOWED'].includes(code)) {
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
      AI_PROVIDER_ACCESS: 'The configured AI provider rejected its API key or account access. Check the provider key and model access.',
      AI_PROVIDER_LIMIT: 'The AI provider’s quota or rate limit was reached. Check its API usage and billing limits.',
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
