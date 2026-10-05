import { query, isDatabaseConnected } from '../../database/db.ts';
import type { LogicalTrade, TradeConfluences } from '../types.ts';
import { inMemoryStore } from './inMemoryStore.ts';

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export async function getTradesByAccount(accountId?: string): Promise<LogicalTrade[]> {
  if (isDatabaseConnected()) {
    let sql = `
      SELECT t.*,
        json_build_object(
          'bias_1h', c.bias_1h,
          'liquidity_sweep_confirmed', c.liquidity_sweep_confirmed,
          'liquidity_pool_level', c.liquidity_pool_level,
          'bos_displacement_confirmed', c.bos_displacement_confirmed,
          'fvg_retest_confirmed', c.fvg_retest_confirmed,
          'orderblock_mitigated', c.orderblock_mitigated,
          'smt_divergence_present', c.smt_divergence_present,
          'tape_absorption_confirmed', c.tape_absorption_confirmed,
          'rules_followed_count', c.rules_followed_count,
          'total_rules_count', c.total_rules_count,
          'discipline_score', c.discipline_score,
          'early_entry_flag', c.early_entry_flag,
          'fomo_flag', c.fomo_flag,
          'revenge_trade_flag', c.revenge_trade_flag,
          'setup_quality', c.setup_quality,
          'notes', c.notes
        ) as confluences
      FROM trades t
      INNER JOIN trading_accounts a
        ON a.id = t.trading_account_id AND a.mt5_data_verified IS TRUE
      LEFT JOIN trade_confluences c ON c.trade_id = t.id
    `;
    const params: any[] = [];
    if (accountId && accountId !== 'ALL') {
      if (isUuid(accountId)) {
        sql += ` WHERE t.trading_account_id = $1`;
        params.push(accountId);
      } else {
        return [];
      }
    }
    sql += ` ORDER BY t.opened_at DESC`;

    const res = await query<LogicalTrade>(sql, params);
    return res ? res.rows : [];
  }

  if (accountId && accountId !== 'ALL') {
    const account = await inMemoryStore.getAccount(accountId);
    return account?.mt5_data_verified ? inMemoryStore.getTrades(accountId) : [];
  }
  const verifiedAccountIds = new Set(
    (await inMemoryStore.getAllAccounts())
      .filter((account) => account.mt5_data_verified)
      .map((account) => account.id)
  );
  return (await inMemoryStore.getAllTrades()).filter((trade) => verifiedAccountIds.has(trade.trading_account_id));
}

export async function updateTradeConfluences(
  tradeId: string,
  confluences: TradeConfluences
): Promise<LogicalTrade | null> {
  if (isDatabaseConnected()) {
    try {
      // Find the trade
      const tradeRes = await query<{ id: string }>(
        `SELECT id FROM trades WHERE id = $1 OR primary_ticket::text = $1`,
        [tradeId]
      );
      if (tradeRes && tradeRes.rows.length > 0) {
        const actualTradeId = tradeRes.rows[0].id;
        await query(
          `INSERT INTO trade_confluences (
            trade_id, bias_1h, liquidity_sweep_confirmed, liquidity_pool_level,
            bos_displacement_confirmed, fvg_retest_confirmed, orderblock_mitigated,
            smt_divergence_present, tape_absorption_confirmed, rules_followed_count,
            total_rules_count, discipline_score, early_entry_flag, fomo_flag,
            revenge_trade_flag, setup_quality, notes, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)
          ON CONFLICT (trade_id)
          DO UPDATE SET
            bias_1h = COALESCE(EXCLUDED.bias_1h, trade_confluences.bias_1h),
            liquidity_sweep_confirmed = COALESCE(EXCLUDED.liquidity_sweep_confirmed, trade_confluences.liquidity_sweep_confirmed),
            liquidity_pool_level = COALESCE(EXCLUDED.liquidity_pool_level, trade_confluences.liquidity_pool_level),
            bos_displacement_confirmed = COALESCE(EXCLUDED.bos_displacement_confirmed, trade_confluences.bos_displacement_confirmed),
            fvg_retest_confirmed = COALESCE(EXCLUDED.fvg_retest_confirmed, trade_confluences.fvg_retest_confirmed),
            orderblock_mitigated = COALESCE(EXCLUDED.orderblock_mitigated, trade_confluences.orderblock_mitigated),
            smt_divergence_present = COALESCE(EXCLUDED.smt_divergence_present, trade_confluences.smt_divergence_present),
            tape_absorption_confirmed = COALESCE(EXCLUDED.tape_absorption_confirmed, trade_confluences.tape_absorption_confirmed),
            rules_followed_count = COALESCE(EXCLUDED.rules_followed_count, trade_confluences.rules_followed_count),
            discipline_score = COALESCE(EXCLUDED.discipline_score, trade_confluences.discipline_score),
            early_entry_flag = COALESCE(EXCLUDED.early_entry_flag, trade_confluences.early_entry_flag),
            fomo_flag = COALESCE(EXCLUDED.fomo_flag, trade_confluences.fomo_flag),
            revenge_trade_flag = COALESCE(EXCLUDED.revenge_trade_flag, trade_confluences.revenge_trade_flag),
            setup_quality = COALESCE(EXCLUDED.setup_quality, trade_confluences.setup_quality),
            notes = COALESCE(EXCLUDED.notes, trade_confluences.notes),
            updated_at = CURRENT_TIMESTAMP`,
          [
            actualTradeId,
            confluences.bias_1h || null,
            confluences.liquidity_sweep_confirmed || false,
            confluences.liquidity_pool_level || null,
            confluences.bos_displacement_confirmed || false,
            confluences.fvg_retest_confirmed || false,
            confluences.orderblock_mitigated || false,
            confluences.smt_divergence_present || false,
            confluences.tape_absorption_confirmed || false,
            confluences.rules_followed_count ?? 6,
            confluences.total_rules_count ?? 6,
            confluences.discipline_score ?? 100,
            confluences.early_entry_flag || false,
            confluences.fomo_flag || false,
            confluences.revenge_trade_flag || false,
            confluences.setup_quality || 'A+ DLM Sweep',
            confluences.notes || null,
          ]
        );
      }
    } catch (err) {
      console.warn('[Update Confluences DB Error]:', err);
    }
  }

  return inMemoryStore.updateTradeConfluences(tradeId, confluences);
}
