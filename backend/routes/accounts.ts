import { Router, type Request, type Response } from 'express';
import {
  createAccount,
  deleteAccount,
  getAccountById,
  getAccountPositions,
  getAccounts,
} from '../services/accountService.ts';
import { getTradesByAccount } from '../services/tradeService.ts';
import { syncMT5Account } from '../services/mt5SyncService.ts';

const router = Router();

// GET /api/accounts - List all trading accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const accounts = await getAccounts();
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
    const account = await getAccountById(req.params.id);
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
    const success = await deleteAccount(req.params.id);
    res.json({ success, message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/accounts/:id/status - Connection & synchronization status
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const account = await getAccountById(req.params.id);
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
    const positions = await getAccountPositions(req.params.id);
    res.json({ success: true, count: positions.length, data: positions });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/accounts/:id/trades - All logical trades for this account
router.get('/:id/trades', async (req: Request, res: Response) => {
  try {
    const trades = await getTradesByAccount(req.params.id);
    res.json({ success: true, count: trades.length, data: trades });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/accounts/:id/sync - Trigger synchronization with MT5 terminal
router.post('/:id/sync', async (req: Request, res: Response) => {
  try {
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

export default router;
