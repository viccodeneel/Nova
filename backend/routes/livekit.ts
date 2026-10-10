import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { validateSessionSummary, type SessionSummaryStore } from '../services/livekitSummaryService.ts';

const MIN_TOKEN_LENGTH = 32;

export interface LivekitRouterOptions {
  store: SessionSummaryStore;
  /** Read per request so rotating the env var takes effect on restart without code changes. */
  getToken?: () => string | undefined;
}

// Hash both sides so timingSafeEqual always compares equal-length buffers.
const digest = (v: string) => createHash('sha256').update(v).digest();

function requireSummaryToken(getToken: () => string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    const expected = getToken();
    // Fail closed: never accept requests when the token is missing or weak.
    if (!expected || expected.length < MIN_TOKEN_LENGTH) {
      return res.status(503).json({ success: false, error: 'LiveKit summary endpoint is not configured' });
    }
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    if (!match || !timingSafeEqual(digest(match[1]), digest(expected))) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
  };
}

/**
 * LiveKit Agent Builder "Summary and data collection endpoint".
 * Mounted OUTSIDE requireAuth (LiveKit cannot hold a dashboard session) and
 * authenticated only by LIVEKIT_SUMMARY_TOKEN. Deliberately independent of
 * MT5_BRIDGE_SECRET and NOVA_AUTH_*.
 */
export function createLivekitRouter({ store, getToken = () => process.env.LIVEKIT_SUMMARY_TOKEN }: LivekitRouterOptions): Router {
  const router = Router();

  // POST /api/livekit/session-summary
  router.post('/session-summary', requireSummaryToken(getToken), async (req: Request, res: Response) => {
    const parsed = validateSessionSummary(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: 'Invalid payload', details: parsed.errors });
    }
    try {
      const { created } = await store.save(parsed.value);
      // 201 first delivery, 200 for a retried/duplicate delivery. Both are success for the sender.
      return res.status(created ? 201 : 200).json({ success: true, job_id: parsed.value.job_id, duplicate: !created });
    } catch (err) {
      // Log without payload content (summaries may contain personal or financial details).
      console.error('[LiveKit] Failed to store session summary for job', parsed.value.job_id, (err as Error).message);
      return res.status(500).json({ success: false, error: 'Failed to store session summary' });
    }
  });

  return router;
}
