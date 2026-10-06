import { Router, type Request, type Response } from 'express';
import { runNovaAssistant } from '../ai/agent.ts';

const router = Router();
router.get('/status', (_req: Request, res: Response) => {
  res.json({ success: true, data: { enabled: Boolean(process.env.GEMINI_API_KEY) } });
});

router.post('/chat', async (req: Request, res: Response) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const accountId = typeof req.body?.account_id === 'string' ? req.body.account_id : undefined;
  if (!message || message.length > 2000) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_MESSAGE', message: 'Enter a message of 1 to 2000 characters.' } });
  }
  if (accountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ACCOUNT', message: 'The selected account ID is invalid.' } });
  }
  try {
    const data = await runNovaAssistant(message, { accountId });
    res.json({ success: true, data });
  } catch (error) {
    const err = error as Error & { code?: string };
    const code = err.code || 'AI_REQUEST_FAILED';
    const status = code === 'AI_NOT_CONFIGURED' ? 503 : ['NO_ACCOUNT', 'ACCOUNT_SELECTION_REQUIRED', 'ACCOUNT_NOT_FOUND'].includes(code) ? 409 : 502;
    const messages: Record<string, string> = {
      AI_NOT_CONFIGURED: 'NOVA text reasoning is not configured on the backend.',
      NO_ACCOUNT: 'No verified MT5 account is connected yet.',
      ACCOUNT_SELECTION_REQUIRED: 'Select an account in NOVA before asking about account data.',
      ACCOUNT_NOT_FOUND: 'The selected MT5 account could not be found.',
      LIVE_DATA_NOT_RETRIEVED: 'NOVA could not verify the account data needed to answer. Try again.',
    };
    console.warn('[NOVA AI] request failed', { code });
    res.status(status).json({ success: false, error: { code, message: messages[code] || 'NOVA could not complete that request.' } });
  }
});

export default router;