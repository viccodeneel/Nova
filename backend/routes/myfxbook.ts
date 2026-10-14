import { Router, type Request, type Response } from 'express';
import { requireStrictAuth } from './auth.ts';
import { createMyfxbookService, MyfxbookServiceError } from '../services/myfxbookService.ts';

export function createMyfxbookRouter(service = createMyfxbookService()) {
  const router = Router();
  router.use(requireStrictAuth);

  const respondWithSafeError = (error: unknown, res: Response) => {
    const code = error instanceof MyfxbookServiceError ? error.code : 'UPSTREAM_FAILURE';
    const status = code === 'NOT_CONFIGURED' ? 503
      : code === 'INVALID_ACCOUNT_ID' ? 400
        : code === 'ACCOUNT_NOT_FOUND' ? 404
          : code === 'UPSTREAM_TIMEOUT' ? 504 : 502;
    const messages: Record<string, string> = {
      NOT_CONFIGURED: 'Myfxbook integration is not configured.',
      INVALID_ACCOUNT_ID: 'A valid Myfxbook account ID is required.',
      ACCOUNT_NOT_FOUND: 'The selected account is not available for this NOVA owner.',
      UPSTREAM_TIMEOUT: 'Myfxbook did not respond in time. Try again shortly.',
      UPSTREAM_FAILURE: 'Myfxbook could not provide the requested data.',
      INVALID_SESSION: 'The Myfxbook session was rejected. Please retry the request.',
      INVALID_RESPONSE: 'Myfxbook returned data NOVA could not safely read.',
    };
    res.status(status).json({ success: false, error: messages[code] || messages.UPSTREAM_FAILURE });
  };

  router.get('/status', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: { provider: 'Myfxbook', configured: service.isConfigured(), readOnly: true },
    });
  });

  router.get('/accounts', async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await service.getAccounts() });
    } catch (error) {
      respondWithSafeError(error, res);
    }
  });

  router.get('/accounts/:id/open-trades', async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await service.getOpenTrades(req.params.id) });
    } catch (error) {
      respondWithSafeError(error, res);
    }
  });

  router.get('/accounts/:id/history', async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await service.getHistory(req.params.id) });
    } catch (error) {
      respondWithSafeError(error, res);
    }
  });

  router.get('/diagnostic/:id', async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await service.getDiagnostic(req.params.id) });
    } catch (error) {
      respondWithSafeError(error, res);
    }
  });

  return router;
}

export default createMyfxbookRouter;
