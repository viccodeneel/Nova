import { getAccountById, getAccounts } from '../services/accountService.ts';
import { getTradesByAccount } from '../services/tradeService.ts';

export interface AccountInfo {
  account_name: string; account_number: number; broker_name: string; server_name: string; currency: string;
  connection_status: string; last_synced_at: string | null; balance: number; equity: number;
  floating_pnl: number; starting_balance: number; net_profit: number; realized_pnl_today: number;
  closed_trades_today: number; open_positions: number; recorded_trades: number;
}
type ToolContext = { accountId?: string };

export const READ_ONLY_TOOLS = [{
  name: 'get_account_info',
  description: 'Read the currently selected NOVA MT5 account snapshot: balance, equity, net profit since connection, realized P&L and closed trades today, open position count and connection status. Use for account questions. This tool never changes anything.',
  parametersJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
}] as const;

export async function getAccountInfo(context: ToolContext): Promise<AccountInfo> {
  let account = context.accountId ? await getAccountById(context.accountId) : null;
  if (context.accountId && !account) throw Object.assign(new Error('Selected account not found.'), { code: 'ACCOUNT_NOT_FOUND' });
  if (!account) {
    const accounts = await getAccounts();
    if (accounts.length !== 1) throw Object.assign(new Error('Select an account in NOVA first.'), { code: accounts.length ? 'ACCOUNT_SELECTION_REQUIRED' : 'NO_ACCOUNT' });
    account = accounts[0];
  }
  const balance = Number(account.current_balance);
  const equity = Number(account.current_equity);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const trades = await getTradesByAccount(account.id);
  const todaysClosed = trades.filter((trade) => trade.is_closed && trade.closed_at && new Date(trade.closed_at).getTime() >= todayStart.getTime());
  return {
    account_name: account.account_name, account_number: Number(account.account_number),
    broker_name: account.broker_name, server_name: account.server_name, currency: account.currency,
    connection_status: account.connection_status || 'DISCONNECTED',
    last_synced_at: account.last_synced_at ? new Date(account.last_synced_at).toISOString() : null,
    balance, equity, floating_pnl: Number((equity - balance).toFixed(2)),
    starting_balance: Number(account.starting_balance),
    net_profit: Number((balance - Number(account.starting_balance)).toFixed(2)),
    realized_pnl_today: Number(todaysClosed.reduce((total, trade) => total + Number(trade.net_profit || 0), 0).toFixed(2)),
    closed_trades_today: todaysClosed.length,
    open_positions: Number(account.positions_count || 0), recorded_trades: Number(account.trades_count || 0),
  };
}

export async function executeReadOnlyTool(name: string, context: ToolContext): Promise<unknown> {
  if (name !== 'get_account_info') throw Object.assign(new Error('Tool is not allowed.'), { code: 'TOOL_NOT_ALLOWED' });
  return getAccountInfo(context);
}