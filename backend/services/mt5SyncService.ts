import { query, isDatabaseConnected } from '../../database/db.ts';
import type {
  LogicalTrade,
  MT5AccountSnapshot,
  MT5DealSnapshot,
  MT5PositionSnapshot,
  MT5SyncPayload,
  TradingAccountRecord,
} from '../types.ts';
import { inMemoryStore } from './inMemoryStore.ts';

export interface SyncResult {
  success: boolean;
  message: string;
  account_id: string;
  account_number: number;
  positions_synced: number;
  deals_synced: number;
  trades_created_or_updated: number;
  synced_at: string;
  error?: string;
}

/**
 * Maps raw MT5 in/out deals into logical trades.
 * An MT5 trade often consists of an 'IN' deal (entry) and one or more 'OUT' deals (exits).
 */
export function aggregateDealsToLogicalTrades(
  deals: MT5DealSnapshot[],
  accountId: string
): LogicalTrade[] {
  const dealsByPosition = new Map<number, MT5DealSnapshot[]>();

  // Group deals by position_id
  for (const deal of deals) {
    if (!deal.position_id) continue;
    const existing = dealsByPosition.get(deal.position_id) || [];
    existing.push(deal);
    dealsByPosition.set(deal.position_id, existing);
  }

  const logicalTrades: LogicalTrade[] = [];

  for (const [positionId, posDeals] of dealsByPosition.entries()) {
    // Sort chronologically
    posDeals.sort((a, b) => new Date(a.deal_time).getTime() - new Date(b.deal_time).getTime());

    const entryDeal = posDeals.find((d) => d.entry_type === 'IN') || posDeals[0];
    const exitDeals = posDeals.filter((d) => d.entry_type === 'OUT');
    const lastExitDeal = exitDeals[exitDeals.length - 1];

    const totalVolume = entryDeal.volume;
    const grossProfit = posDeals.reduce((sum, d) => sum + (d.profit || 0), 0);
    const totalCommission = posDeals.reduce((sum, d) => sum + (d.commission || 0) + (d.fee || 0), 0);
    const totalSwap = posDeals.reduce((sum, d) => sum + (d.swap || 0), 0);
    const netProfit = Number((grossProfit + totalCommission + totalSwap).toFixed(2));

    const isClosed = exitDeals.length > 0;
    const entryPrice = entryDeal.price;
    const exitPrice = lastExitDeal ? lastExitDeal.price : undefined;

    let outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'OPEN' = 'OPEN';
    if (isClosed) {
      if (netProfit > 0.05) outcome = 'WIN';
      else if (netProfit < -0.05) outcome = 'LOSS';
      else outcome = 'BREAKEVEN';
    }

    // Determine estimated R-multiple
    let rMultiple = 0;
    if (isClosed) {
      if (outcome === 'WIN') rMultiple = Number((Math.abs(netProfit) / 50).toFixed(1));
      else if (outcome === 'LOSS') rMultiple = -1.0;
    }

    // Determine session from open time
    const openDate = new Date(entryDeal.deal_time);
    const hour = openDate.getUTCHours();
    let session = 'Asian Session';
    if (hour >= 7 && hour < 13) session = 'London Open';
    else if (hour >= 13 && hour <= 16) session = 'London / NY Overlap';
    else if (hour > 16 && hour <= 20) session = 'NY PM Session';

    // Hold duration calculation
    let holdDuration = '--';
    if (lastExitDeal) {
      const diffMs = new Date(lastExitDeal.deal_time).getTime() - openDate.getTime();
      const diffMins = Math.max(1, Math.round(diffMs / (1000 * 60)));
      holdDuration = diffMins > 60 ? `${Math.round(diffMins / 60)}h ${diffMins % 60}m` : `${diffMins} mins`;
    }

    logicalTrades.push({
      id: `trade-${accountId}-${positionId}`,
      trading_account_id: accountId,
      position_id: positionId,
      primary_ticket: entryDeal.deal_ticket,
      symbol: entryDeal.symbol,
      direction: entryDeal.direction,
      volume: totalVolume,
      entry_price: entryPrice,
      exit_price: exitPrice,
      gross_profit: Number(grossProfit.toFixed(2)),
      commission: Number(totalCommission.toFixed(2)),
      swap: Number(totalSwap.toFixed(2)),
      net_profit: netProfit,
      r_multiple: rMultiple,
      outcome,
      session_window: session,
      hold_duration: holdDuration,
      opened_at: entryDeal.deal_time,
      closed_at: lastExitDeal ? lastExitDeal.deal_time : undefined,
      comment: entryDeal.comment,
      magic_number: entryDeal.magic_number,
      is_closed: isClosed,
    });
  }

  return logicalTrades;
}

/**
 * Synchronizes MT5 account info, positions, and deals into database.
 * Completely idempotent: running multiple times updates existing records without duplicate rows.
 */
export async function processMT5SyncPayload(
  accountId: string,
  payload: MT5SyncPayload
): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const { account, positions = [], deals = [] } = payload;

  const logicalTrades = aggregateDealsToLogicalTrades(deals, accountId);

  if (isDatabaseConnected()) {
    try {
      // 1. Resolve or create account in trading_accounts table
      const dbAcc = await query<{ id: string }>(
        `SELECT id FROM trading_accounts 
         WHERE (CASE WHEN $1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN id = $1::uuid ELSE FALSE END)
            OR account_number = $2 LIMIT 1`,
        [accountId, account.account_number]
      );

      let targetDbId: string;
      if (dbAcc && dbAcc.rows.length > 0) {
        targetDbId = dbAcc.rows[0].id;
        await query(
          `UPDATE trading_accounts
           SET current_balance = $1,
               current_equity = $2,
               credit = $3,
               margin = $4,
               free_margin = $5,
               margin_level = $6,
               connection_status = 'CONNECTED',
               last_synced_at = $7,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $8`,
          [
            account.balance,
            account.equity,
            account.credit || 0,
            account.margin || 0,
            account.free_margin || account.balance,
            account.margin_level || 0,
            syncedAt,
            targetDbId,
          ]
        );
      } else {
        const newAcc = await query<{ id: string }>(
          `INSERT INTO trading_accounts (
            account_name, account_number, broker_name, server_name, starting_balance,
            current_balance, current_equity, free_margin, connection_status, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CONNECTED', $9)
          RETURNING id`,
          [
            `${account.broker_name} #${account.account_number}`,
            account.account_number,
            account.broker_name,
            account.server_name,
            account.balance,
            account.balance,
            account.equity,
            account.free_margin || account.balance,
            syncedAt,
          ]
        );
        targetDbId = newAcc!.rows[0].id;

        // Auto-provision prop-firm challenge rules
        const pf = await query<{ id: string }>(
          `INSERT INTO prop_firm_accounts (
            trading_account_id, prop_firm_name, program_name, max_loss_percent,
            max_loss_limit, daily_loss_percent, daily_loss_limit, peak_watermark
          ) VALUES ($1, $2, 'Standard Evaluation', 10.0, $3, 5.0, $4, $5)
          RETURNING id`,
          [
            targetDbId,
            account.broker_name,
            Number((account.balance * 0.10).toFixed(2)),
            Number((account.balance * 0.05).toFixed(2)),
            account.balance,
          ]
        );

        if (pf && pf.rows.length > 0) {
          await query(
            `INSERT INTO prop_phases (
              prop_firm_account_id, phase_name, starting_balance,
              profit_target_percent, profit_target_amount, pass_threshold
            ) VALUES ($1, 'Phase 1', $2, 6.0, $3, $4)`,
            [
              pf.rows[0].id,
              account.balance,
              Number((account.balance * 0.06).toFixed(2)),
              Number((account.balance * 1.06).toFixed(2)),
            ]
          );
        }
      }

      // 2. Sync open positions (upsert)
      for (const pos of positions) {
        await query(
          `INSERT INTO mt5_positions (
            trading_account_id, position_ticket, symbol, direction, volume,
            open_price, current_price, stop_loss, take_profit, current_profit,
            swap, commission, magic_number, comment, opened_at, synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (trading_account_id, position_ticket)
          DO UPDATE SET
            current_price = EXCLUDED.current_price,
            current_profit = EXCLUDED.current_profit,
            stop_loss = EXCLUDED.stop_loss,
            take_profit = EXCLUDED.take_profit,
            synced_at = EXCLUDED.synced_at`,
          [
            targetDbId,
            pos.position_ticket,
            pos.symbol,
            pos.direction,
            pos.volume,
            pos.open_price,
            pos.current_price,
            pos.stop_loss || null,
            pos.take_profit || null,
            pos.current_profit || 0,
            pos.swap || 0,
            pos.commission || 0,
            pos.magic_number || 0,
            pos.comment || null,
            pos.opened_at,
            syncedAt,
          ]
        );
      }

      // Remove stale positions that are no longer open in MT5
      if (positions.length > 0) {
        const liveTickets = positions.map((p) => p.position_ticket);
        await query(
          `DELETE FROM mt5_positions
           WHERE trading_account_id = $1 AND position_ticket != ALL($2::bigint[])`,
          [targetDbId, liveTickets]
        );
      } else {
        await query(`DELETE FROM mt5_positions WHERE trading_account_id = $1`, [targetDbId]);
      }

      // 3. Sync raw deals (idempotent upsert on deal_ticket)
      for (const deal of deals) {
        await query(
          `INSERT INTO mt5_deals (
            trading_account_id, deal_ticket, order_ticket, position_id,
            symbol, entry_type, direction, volume, price, profit,
            commission, swap, fee, magic_number, comment, deal_time
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (trading_account_id, deal_ticket)
          DO UPDATE SET
            profit = EXCLUDED.profit,
            commission = EXCLUDED.commission,
            swap = EXCLUDED.swap`,
          [
            targetDbId,
            deal.deal_ticket,
            deal.order_ticket || null,
            deal.position_id,
            deal.symbol,
            deal.entry_type,
            deal.direction,
            deal.volume,
            deal.price,
            deal.profit || 0,
            deal.commission || 0,
            deal.swap || 0,
            deal.fee || 0,
            deal.magic_number || 0,
            deal.comment || null,
            deal.deal_time,
          ]
        );
      }

      // 4. Sync logical trades into 'trades' table (idempotent upsert on primary_ticket)
      for (const trade of logicalTrades) {
        await query(
          `INSERT INTO trades (
            trading_account_id, position_id, primary_ticket, symbol, direction,
            volume, entry_price, exit_price, stop_loss, take_profit,
            gross_profit, commission, swap, net_profit, r_multiple,
            outcome, session_window, hold_duration, opened_at, closed_at,
            comment, magic_number, is_closed, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, CURRENT_TIMESTAMP)
          ON CONFLICT (trading_account_id, primary_ticket)
          DO UPDATE SET
            exit_price = EXCLUDED.exit_price,
            gross_profit = EXCLUDED.gross_profit,
            commission = EXCLUDED.commission,
            swap = EXCLUDED.swap,
            net_profit = EXCLUDED.net_profit,
            r_multiple = EXCLUDED.r_multiple,
            outcome = EXCLUDED.outcome,
            hold_duration = EXCLUDED.hold_duration,
            closed_at = EXCLUDED.closed_at,
            is_closed = EXCLUDED.is_closed,
            updated_at = CURRENT_TIMESTAMP`,
          [
            targetDbId,
            trade.position_id,
            trade.primary_ticket,
            trade.symbol,
            trade.direction,
            trade.volume,
            trade.entry_price,
            trade.exit_price || null,
            trade.stop_loss || null,
            trade.take_profit || null,
            trade.gross_profit,
            trade.commission,
            trade.swap,
            trade.net_profit,
            trade.r_multiple,
            trade.outcome,
            trade.session_window,
            trade.hold_duration,
            trade.opened_at,
            trade.closed_at || null,
            trade.comment || null,
            trade.magic_number || 0,
            trade.is_closed,
          ]
        );
      }

      // 5. Update Prop Firm & Phase calculations
      await updatePropPhaseMetrics(targetDbId);

    } catch (err) {
      console.error('[MT5 Sync DB Error]:', err);
      return {
        success: false,
        message: 'Failed to insert MT5 sync records into PostgreSQL',
        account_id: accountId,
        account_number: account.account_number,
        positions_synced: 0,
        deals_synced: 0,
        trades_created_or_updated: 0,
        synced_at: syncedAt,
        error: (err as Error).message,
      };
    }
  } else {
    // In-memory fallback repository when DB is not yet connected
    inMemoryStore.updateAccountSync(accountId, account, positions, deals, logicalTrades);
  }

  return {
    success: true,
    message: 'MetaTrader 5 account and trade history synchronized successfully.',
    account_id: accountId,
    account_number: account.account_number,
    positions_synced: positions.length,
    deals_synced: deals.length,
    trades_created_or_updated: logicalTrades.length,
    synced_at: syncedAt,
  };
}

/**
 * Calculates current profit, progress percentage, drawdowns for prop firm phase.
 */
async function updatePropPhaseMetrics(accountId: string): Promise<void> {
  if (!isDatabaseConnected()) return;
  try {
    const accRes = await query<TradingAccountRecord>(
      `SELECT starting_balance, current_balance FROM trading_accounts WHERE id = $1`,
      [accountId]
    );
    if (!accRes || accRes.rows.length === 0) return;
    const acc = accRes.rows[0];

    const currentProfit = Number((acc.current_balance - acc.starting_balance).toFixed(2));

    await query(
      `UPDATE prop_phases
       SET current_profit = $1,
           progress_percentage = LEAST(100.0, GREATEST(0.0, ROUND(($1 / NULLIF(profit_target_amount, 0)) * 100, 2))),
           remaining_target = GREATEST(0.0, profit_target_amount - $1),
           phase_status = CASE
             WHEN $1 >= profit_target_amount THEN 'PASSED'
             ELSE 'IN_PROGRESS'
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE prop_firm_account_id IN (
         SELECT id FROM prop_firm_accounts WHERE trading_account_id = $2
       )`,
      [currentProfit, accountId]
    );
  } catch (err) {
    console.warn('[Prop Phase Metric Update Error]:', err);
  }
}

/**
 * syncMT5Account:
 * High-level orchestration function required by the user specification:
 * 1. Checks connector availability
 * 2. Fetches MT5 snapshot from Python connector service if reachable
 * 3. Ingests into PostgreSQL and triggers trade aggregation
 */
export async function syncMT5Account(accountId?: string): Promise<SyncResult> {
  const connectorUrl = process.env.MT5_CONNECTOR_URL?.trim();
  const bridgeSecret = process.env.MT5_BRIDGE_SECRET;
  if (!connectorUrl) {
    return {
      success: false,
      message: 'No reachable MT5 connector is configured. A cloud backend cannot pull from a connector running on your local computer; run the local connector in push mode.',
      account_id: accountId || '',
      account_number: 0,
      positions_synced: 0,
      deals_synced: 0,
      trades_created_or_updated: 0,
      synced_at: new Date().toISOString(),
      error: 'CONNECTOR_URL_NOT_CONFIGURED',
    };
  }
  const targetUrl = connectorUrl.endsWith('/sync')
    ? connectorUrl
    : `${connectorUrl.replace(/\/+$/, '')}/sync`;

  if (!bridgeSecret) {
    return {
      success: false,
      message: 'MT5 bridge authentication is not configured.',
      account_id: accountId || '',
      account_number: 0,
      positions_synced: 0,
      deals_synced: 0,
      trades_created_or_updated: 0,
      synced_at: new Date().toISOString(),
      error: 'BRIDGE_SECRET_NOT_CONFIGURED',
    };
  }

  try {
    // Ping Python MT5 connector service
    const query = accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
    const response = await fetch(`${targetUrl}${query}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-MT5-Bridge-Key': bridgeSecret,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (response.ok) {
      const payload: MT5SyncPayload = await response.json();
      if ((payload.account as any)?.data_mode === 'SIMULATED') {
        return {
          success: false,
          message: 'Simulated connector data is blocked from account sync.',
          account_id: accountId || '',
          account_number: 0,
          positions_synced: 0,
          deals_synced: 0,
          trades_created_or_updated: 0,
          synced_at: new Date().toISOString(),
          error: 'SIMULATION_DATA_REJECTED',
        };
      }
      const targetAccountId = accountId || `acc-${payload.account.account_number}`;
      return await processMT5SyncPayload(targetAccountId, payload);
    } else {
      console.warn(`[MT5 Connector Response] Status ${response.status} from ${targetUrl}`);
    }
  } catch (err) {
    // Connector service is not running or unreachable
  }

  return {
    success: false,
    message: 'MT5 Connector Service is not reachable on ' + connectorUrl + '. Please start the Python MT5 service (python mt5-connector/sync.py).',
    account_id: accountId || '',
    account_number: 0,
    positions_synced: 0,
    deals_synced: 0,
    trades_created_or_updated: 0,
    synced_at: new Date().toISOString(),
    error: 'CONNECTOR_OFFLINE',
  };
}
