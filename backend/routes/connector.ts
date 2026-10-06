import { Router, type Request, type Response } from 'express';
import { processMT5SyncPayload, syncMT5Account } from '../services/mt5SyncService.ts';
import { isDatabaseConnected } from '../../database/db.ts';

const router = Router();

// POST /api/connector/sync - Pull the configured MT5 account from the local bridge
router.post('/sync', async (_req: Request, res: Response) => {
  try {
    const result = await syncMT5Account();
    res.status(result.success ? 200 : 503).json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

// GET /api/connector/health - Gateway status
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ONLINE',
    service: 'NOVA Intelligence OS Backend',
    database_connected: isDatabaseConnected(),
    bridge_secret_configured: !!process.env.MT5_BRIDGE_SECRET,
    timestamp: new Date().toISOString(),
  });
});

// POST /api/connector/sync-webhook - Ingestion endpoint for MT5 Python connector
router.post('/sync-webhook', async (req: Request, res: Response) => {
  try {
    const bridgeKey = req.headers['x-mt5-bridge-key'] as string;
    const expectedSecret = process.env.MT5_BRIDGE_SECRET;

    if (!expectedSecret) {
      return res.status(503).json({
        success: false,
        error: 'MT5 bridge authentication is not configured',
      });
    }

    // Verify secret to reject unauthorized payloads
    if (bridgeKey !== expectedSecret) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or missing X-MT5-Bridge-Key header',
      });
    }

    const { account_id, account, positions = [], deals = [] } = req.body;

    if (!account || !account.account_number) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payload: account object with account_number is required',
      });
    }

    if (account.data_mode !== 'MT5' || account.connection_status !== 'CONNECTED') {
      return res.status(400).json({
        success: false,
        error: 'Only an authenticated, real MT5 connector snapshot can be synced',
      });
    }

    const targetAccountId = account_id || `acc-${account.account_number}`;

    const result = await processMT5SyncPayload(targetAccountId, {
      account,
      positions,
      deals,
      timestamp: new Date().toISOString(),
    }, { allowCreate: req.body.connect === true });

    if (result.error === 'ACCOUNT_NOT_REGISTERED') return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

export default router;
