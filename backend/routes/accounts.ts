import { Router, type Request, type Response } from 'express';
import {
  createAccount,
  archiveAccount,
  getAccountById,
  getAccountPositions,
  getAccounts,
  updateAccountSettings,
} from '../services/accountService.ts';
import { getTradesByAccount } from '../services/tradeService.ts';
import { syncMT5Account } from '../services/mt5SyncService.ts';

const router = Router();
// requireAuth only issues the fixed NOVA dashboard owner identity today.
// This value is server-owned and is never accepted from request parameters/body.
const OWNER_ID = 'nova-owner';
const classifications = ['LIVE_BROKERAGE', 'PROP_FIRM', 'DEMO'] as const;
const challengeTypes = ['ONE_STEP', 'TWO_STEP', 'INSTANT_FUNDING'] as const;
const challengeStages = ['PHASE_1', 'PHASE_2', 'FUNDED', 'INSTANT_FUNDED', 'EVALUATION'] as const;

function validOptionalNumber(value: unknown, min: number, max: number, integer = false): boolean {
  return value === null || value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)));
}

// GET /api/accounts - List all trading accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const accounts = await getAccounts(OWNER_ID);
    res.json({ success: true, data: accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/accounts - Register an MT5 trading account
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      account_name,
      account_number,
      broker_name,
      server_name,
      starting_balance,
      account_type,
      currency,
      leverage,
      prop_firm_name,
      phase_name,
      profit_target_percent,
      daily_loss_percent,
      max_loss_percent,
    } = req.body;

    if (!Number.isFinite(Number(account_number)) || !server_name || !broker_name ||
        !Number.isFinite(Number(starting_balance)) || Number(starting_balance) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid account_number, broker_name, server_name, and starting_balance are required',
      });
    }

    const created = await createAccount({
      account_name: account_name || `${broker_name} #${account_number}`,
      account_number: Number(account_number),
      broker_name,
      server_name,
      starting_balance: Number(starting_balance),
      account_type,
      currency,
      leverage: Number(leverage) || 100,
      prop_firm_name,
      phase_name,
      profit_target_percent: Number(profit_target_percent) || 6.0,
      daily_loss_percent: Number(daily_loss_percent) || 5.0,
      max_loss_percent: Number(max_loss_percent) || 10.0,
    });

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/accounts/:id - Get account details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const account = await getAccountById(req.params.id, OWNER_ID);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    res.json({ success: true, data: account });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /api/accounts/:id - Remove an account
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const success = await archiveAccount(req.params.id, OWNER_ID);
    if (!success) return res.status(404).json({ success: false, error: 'Account not found' });
    res.json({ success, message: 'Account removed from NOVA. Trading records were preserved.' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/accounts/:id/status - Connection & synchronization status
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const account = await getAccountById(req.params.id, OWNER_ID);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    res.json({
      success: true,
      data: {
        account_id: account.id,
        account_number: account.account_number,
        server: account.server_name,
        connection_status: account.connection_status,
        last_synced_at: account.last_synced_at || null,
        balance: account.current_balance,
        equity: account.current_equity,
        margin_level: account.margin_level,
        breach_status: account.prop_firm?.breach_status || 'SAFE',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/accounts/:id/positions - Live open positions from MT5
router.get('/:id/positions', async (req: Request, res: Response) => {
  try {
    if (!await getAccountById(req.params.id, OWNER_ID)) return res.status(404).json({ success: false, error: 'Account not found' });
    const positions = await getAccountPositions(req.params.id);
    res.json({ success: true, count: positions.length, data: positions });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/accounts/:id/trades - All logical trades for this account
router.get('/:id/trades', async (req: Request, res: Response) => {
  try {
    if (!await getAccountById(req.params.id, OWNER_ID)) return res.status(404).json({ success: false, error: 'Account not found' });
    const trades = await getTradesByAccount(req.params.id);
    res.json({ success: true, count: trades.length, data: trades });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/accounts/:id/sync - Trigger synchronization with MT5 terminal
router.post('/:id/sync', async (req: Request, res: Response) => {
  try {
    if (!await getAccountById(req.params.id, OWNER_ID)) return res.status(404).json({ success: false, error: 'Account not found' });
    const result = await syncMT5Account(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to synchronize account',
      error: (err as Error).message,
    });
  }
});

// PATCH /api/accounts/:id - Update NOVA-only account display/classification settings.
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const account = await getAccountById(req.params.id, OWNER_ID);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });
    const body = req.body || {};
    const accountName = typeof body.account_name === 'string' ? body.account_name.trim() : '';
    const settings = body.account_settings;
    if (!accountName || accountName.length > 100 || !settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return res.status(400).json({ success: false, error: 'A valid account name and settings object are required.' });
    }
    const { classification, notes, prop_firm_name, challenge } = settings;
    if (!classifications.some((value) => value === classification)) return res.status(400).json({ success: false, error: 'Choose a supported account classification.' });
    const isRealConnection = account.connection_mode ? account.connection_mode === 'REAL' : account.account_type === 'live_personal';
    const isDemoConnection = account.connection_mode ? account.connection_mode === 'DEMO' : account.account_type === 'demo';
    if (classification === 'LIVE_BROKERAGE' && !isRealConnection) {
      return res.status(400).json({ success: false, error: 'Live Brokerage is available only when MT5 confirms a real trading account. Reconnect the account with an up-to-date NOVA connector.' });
    }
    if (classification === 'DEMO' && !isDemoConnection) {
      return res.status(400).json({ success: false, error: 'Demo is available only when MT5 confirms a demo account.' });
    }
    if (notes !== null && notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) return res.status(400).json({ success: false, error: 'Notes must be 1,000 characters or fewer.' });
    if (prop_firm_name !== null && prop_firm_name !== undefined && (typeof prop_firm_name !== 'string' || prop_firm_name.trim().length > 100)) return res.status(400).json({ success: false, error: 'Prop firm name must be 100 characters or fewer.' });
    if (challenge !== undefined && (!challenge || typeof challenge !== 'object' || Array.isArray(challenge))) return res.status(400).json({ success: false, error: 'Challenge settings must be an object.' });

    const allowedChallengeFields = ['type', 'stage', 'fee', 'size', 'phase1_target_percent', 'phase2_target_percent', 'daily_drawdown_percent', 'max_drawdown_percent', 'minimum_trading_days'];
    const submitted = Object.fromEntries(Object.entries(challenge || {}).filter(([key]) => allowedChallengeFields.includes(key)));
    const challengeType: unknown = submitted.type ?? null;
    const stage: unknown = submitted.stage ?? null;
    if (challengeType !== null && !challengeTypes.some((value) => value === challengeType)) return res.status(400).json({ success: false, error: 'Choose a supported challenge type.' });
    if (stage !== null && !challengeStages.some((value) => value === stage)) return res.status(400).json({ success: false, error: 'Choose a supported challenge stage.' });
    if ((challengeType === 'ONE_STEP' && (stage === 'PHASE_2' || stage === 'INSTANT_FUNDED')) ||
        (challengeType === 'TWO_STEP' && stage === 'INSTANT_FUNDED') ||
        (challengeType === 'INSTANT_FUNDING' && stage !== 'FUNDED' && stage !== 'INSTANT_FUNDED' && stage !== null)) {
      return res.status(400).json({ success: false, error: 'Challenge stage does not match the selected challenge type.' });
    }
    const numericFields: Array<[string, number, number, boolean?]> = [
      ['fee', 0, 1_000_000], ['size', 0.01, 1_000_000_000],
      ['phase1_target_percent', 0.01, 100], ['phase2_target_percent', 0.01, 100],
      ['daily_drawdown_percent', 0.01, 100], ['max_drawdown_percent', 0.01, 100],
      ['minimum_trading_days', 0, 365, true],
    ];
    for (const [key, min, max, integer] of numericFields) {
      if (!validOptionalNumber(submitted[key], min, max, integer)) return res.status(400).json({ success: false, error: `Challenge setting ${key} is outside its allowed range.` });
    }
    if (challengeType === 'TWO_STEP' && submitted.phase2_target_percent == null) return res.status(400).json({ success: false, error: 'A Phase 2 target is required for a two-step challenge.' });
    if (challengeType === 'INSTANT_FUNDING' && (stage === 'PHASE_1' || stage === 'PHASE_2')) return res.status(400).json({ success: false, error: 'Instant funding does not have evaluation phases.' });

    const nextSettings = {
      ...(account.account_settings || {}),
      classification,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      prop_firm_name: typeof prop_firm_name === 'string' ? prop_firm_name.trim() || null : null,
      // Merge fields so switching challenge types does not discard saved phase settings.
      challenge: { ...(account.account_settings?.challenge || {}), ...submitted },
    };
    const updated = await updateAccountSettings(req.params.id, OWNER_ID, { account_name: accountName, account_settings: nextSettings });
    if (!updated) return res.status(404).json({ success: false, error: 'Account not found.' });
    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, error: 'Could not update account settings.' });
  }
});

export default router;
