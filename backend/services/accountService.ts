import { query, isDatabaseConnected } from '../../database/db.ts';
import type { MT5PositionSnapshot, TradingAccountRecord } from '../types.ts';
import { inMemoryStore } from './inMemoryStore.ts';
import { randomUUID } from 'node:crypto';

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export async function getAccounts(): Promise<TradingAccountRecord[]> {
  if (isDatabaseConnected()) {
    const res = await query<TradingAccountRecord>(
      `SELECT a.*,
        json_build_object(
          'prop_firm_name', p.prop_firm_name,
          'program_name', p.program_name,
          'max_loss_percent', p.max_loss_percent,
          'max_loss_limit', p.max_loss_limit,
          'daily_loss_percent', p.daily_loss_percent,
          'daily_loss_limit', p.daily_loss_limit,
          'current_daily_drawdown', p.current_daily_drawdown,
          'current_max_drawdown', p.current_max_drawdown,
          'peak_watermark', p.peak_watermark,
          'breach_status', p.breach_status
        ) as prop_firm,
        json_build_object(
          'phase_name', ph.phase_name,
          'starting_balance', ph.starting_balance,
          'profit_target_percent', ph.profit_target_percent,
          'profit_target_amount', ph.profit_target_amount,
          'pass_threshold', ph.pass_threshold,
          'current_profit', ph.current_profit,
          'progress_percentage', ph.progress_percentage,
          'remaining_target', ph.remaining_target,
          'phase_status', ph.phase_status
        ) as prop_phase,
        (SELECT COUNT(*) FROM mt5_positions WHERE trading_account_id = a.id) as positions_count,
        (SELECT COUNT(*) FROM trades WHERE trading_account_id = a.id) as trades_count
       FROM trading_accounts a
       LEFT JOIN prop_firm_accounts p ON p.trading_account_id = a.id
       LEFT JOIN prop_phases ph ON ph.prop_firm_account_id = p.id
       WHERE a.mt5_data_verified IS TRUE
       ORDER BY a.created_at ASC`
    );
    return res ? res.rows : [];
  }

  const accounts = await inMemoryStore.getAllAccounts();
  return accounts.filter((account) => account.mt5_data_verified === true);
}

export async function getAccountById(id: string): Promise<TradingAccountRecord | null> {
  if (isDatabaseConnected() && isUuid(id)) {
    const res = await query<TradingAccountRecord>(
      `SELECT a.*,
        json_build_object(
          'prop_firm_name', p.prop_firm_name,
          'program_name', p.program_name,
          'max_loss_percent', p.max_loss_percent,
          'max_loss_limit', p.max_loss_limit,
          'daily_loss_percent', p.daily_loss_percent,
          'daily_loss_limit', p.daily_loss_limit,
          'current_daily_drawdown', p.current_daily_drawdown,
          'current_max_drawdown', p.current_max_drawdown,
          'peak_watermark', p.peak_watermark,
          'breach_status', p.breach_status
        ) as prop_firm,
        json_build_object(
          'phase_name', ph.phase_name,
          'starting_balance', ph.starting_balance,
          'profit_target_percent', ph.profit_target_percent,
          'profit_target_amount', ph.profit_target_amount,
          'pass_threshold', ph.pass_threshold,
          'current_profit', ph.current_profit,
          'progress_percentage', ph.progress_percentage,
          'remaining_target', ph.remaining_target,
          'phase_status', ph.phase_status
        ) as prop_phase,
        (SELECT COUNT(*) FROM mt5_positions WHERE trading_account_id = a.id) as positions_count,
        (SELECT COUNT(*) FROM trades WHERE trading_account_id = a.id) as trades_count
       FROM trading_accounts a
       LEFT JOIN prop_firm_accounts p ON p.trading_account_id = a.id
       LEFT JOIN prop_phases ph ON ph.prop_firm_account_id = p.id
       WHERE a.id = $1 AND a.mt5_data_verified IS TRUE`,
      [id]
    );
    return res && res.rows.length > 0 ? res.rows[0] : null;
  }

  const account = await inMemoryStore.getAccount(id);
  return account?.mt5_data_verified ? account : null;
}

export async function createAccount(data: {
  account_name: string;
  account_number: number;
  broker_name: string;
  server_name: string;
  account_type?: string;
  starting_balance: number;
  currency?: string;
  leverage?: number;
  prop_firm_name?: string;
  phase_name?: string;
  profit_target_percent?: number;
  daily_loss_percent?: number;
  max_loss_percent?: number;
}): Promise<TradingAccountRecord> {
  const accountId = randomUUID();
  const targetPct = data.profit_target_percent || 6.0;
  const targetAmount = Number(((data.starting_balance * targetPct) / 100).toFixed(2));
  const dailyPct = data.daily_loss_percent || 5.0;
  const dailyLimit = Number(((data.starting_balance * dailyPct) / 100).toFixed(2));
  const maxPct = data.max_loss_percent || 10.0;
  const maxLimit = Number(((data.starting_balance * maxPct) / 100).toFixed(2));

  const newAccount: TradingAccountRecord = {
    id: accountId,
    account_name: data.account_name,
    account_number: data.account_number,
    broker_name: data.broker_name,
    server_name: data.server_name,
    account_type: data.account_type || 'evaluation',
    currency: data.currency || 'USD',
    leverage: data.leverage || 100,
    starting_balance: data.starting_balance,
    current_balance: data.starting_balance,
    current_equity: data.starting_balance,
    credit: 0,
    margin: 0,
    free_margin: data.starting_balance,
    margin_level: 0,
    connection_status: 'DISCONNECTED',
    bridge_protocol: 'PYTHON_CONNECTOR',
    is_active: true,
    positions_count: 0,
    trades_count: 0,
    prop_firm: {
      trading_account_id: accountId,
      prop_firm_name: data.prop_firm_name || data.broker_name,
      program_name: `${data.starting_balance / 1000}K Challenge`,
      max_loss_percent: maxPct,
      max_loss_limit: maxLimit,
      daily_loss_percent: dailyPct,
      daily_loss_limit: dailyLimit,
      current_daily_drawdown: 0,
      current_max_drawdown: 0,
      peak_watermark: data.starting_balance,
      breach_status: 'SAFE',
    },
    prop_phase: {
      phase_name: data.phase_name || 'Phase 1 Evaluation',
      starting_balance: data.starting_balance,
      profit_target_percent: targetPct,
      profit_target_amount: targetAmount,
      pass_threshold: data.starting_balance + targetAmount,
      minimum_trading_days: 0,
      current_trading_days: 0,
      current_profit: 0,
      progress_percentage: 0,
      remaining_target: targetAmount,
      phase_status: 'IN_PROGRESS',
    },
  };

  if (isDatabaseConnected()) {
    try {
      const accRes = await query<TradingAccountRecord>(
        `INSERT INTO trading_accounts (
          id, account_name, account_number, broker_name, server_name,
          account_type, currency, leverage, starting_balance, current_balance,
          current_equity, free_margin
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          accountId,
          newAccount.account_name,
          newAccount.account_number,
          newAccount.broker_name,
          newAccount.server_name,
          newAccount.account_type,
          newAccount.currency,
          newAccount.leverage,
          newAccount.starting_balance,
          newAccount.current_balance,
          newAccount.current_equity,
          newAccount.free_margin,
        ]
      );

      // Create prop_firm_accounts row
      const pfRes = await query<{ id: string }>(
        `INSERT INTO prop_firm_accounts (
          trading_account_id, prop_firm_name, program_name, max_loss_percent,
          max_loss_limit, daily_loss_percent, daily_loss_limit, peak_watermark
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          accountId,
          newAccount.prop_firm!.prop_firm_name,
          newAccount.prop_firm!.program_name,
          maxPct,
          maxLimit,
          dailyPct,
          dailyLimit,
          newAccount.starting_balance,
        ]
      );

      if (pfRes && pfRes.rows.length > 0) {
        await query(
          `INSERT INTO prop_phases (
            prop_firm_account_id, phase_name, starting_balance, profit_target_percent,
            profit_target_amount, pass_threshold, remaining_target
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            pfRes.rows[0].id,
            newAccount.prop_phase!.phase_name,
            newAccount.starting_balance,
            targetPct,
            targetAmount,
            newAccount.starting_balance + targetAmount,
            targetAmount,
          ]
        );
      }
    } catch (err) {
      console.warn('[Create Account DB Error, using memory]:', err);
    }
  }

  await inMemoryStore.createAccount(newAccount);
  return newAccount;
}

export async function deleteAccount(id: string): Promise<boolean> {
  if (isDatabaseConnected() && isUuid(id)) {
    try {
      await query(`DELETE FROM trading_accounts WHERE id = $1`, [id]);
    } catch (err) {
      console.warn('[Delete Account DB Error]:', err);
    }
  }
  return inMemoryStore.deleteAccount(id);
}

export async function getAccountPositions(accountId: string): Promise<MT5PositionSnapshot[]> {
  if (isDatabaseConnected() && isUuid(accountId)) {
    const res = await query<MT5PositionSnapshot>(
      `SELECT * FROM mt5_positions WHERE trading_account_id = $1 ORDER BY opened_at DESC`,
      [accountId]
    );
    return res ? res.rows : [];
  }
  return inMemoryStore.getPositions(accountId);
}
