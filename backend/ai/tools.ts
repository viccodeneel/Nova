import { getAccountById, getAccounts, getAccountPositions } from '../services/accountService.ts';
import { getTradesByAccount } from '../services/tradeService.ts';
import { getProfile } from '../services/profileService.ts';
import { listItems } from '../services/financeService.ts';

export interface AccountInfo {
  currency: string;
  connection_status: string; last_synced_at: string | null; balance: number; equity: number;
  floating_pnl: number; realized_pnl_today: number;
  closed_trades_today: number; open_positions: number; recorded_trades: number;
}
type ToolContext = { accountId?: string };
const NAVIGATION_PAGES = { overview: 'Dashboard', 'trade-journal': 'Trade Journal', analytics: 'Analytics', accounts: 'Accounts', ai: 'NOVA', finance: 'Net Worth', settings: 'Settings' } as const;
type DashboardPage = keyof typeof NAVIGATION_PAGES;

export const NOVA_TOOLS = [
  {
    name: 'get_account_info',
    description: 'Read verified MT5 account facts: balance, equity, floating and today realized profit, open position count, and recorded trade count. Drawdown is not tracked yet. Use this for precise questions about the selected account.',
    parametersJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_dashboard_summary',
    description: 'Read the owner profile name and currency, verified MT5 account snapshots and open positions, journal and analytics summaries with recent trades, and Net Worth totals/items. Use for questions about the user or any dashboard section. Never changes data.',
    parametersJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'navigate_to_tab',
    description: 'Open a NOVA dashboard section when the user explicitly asks to open, go to, navigate to, or switch to a section. Only the listed dashboard pages are allowed.',
    parametersJsonSchema: {
      type: 'object',
      properties: { page: { type: 'string', enum: Object.keys(NAVIGATION_PAGES) } },
      required: ['page'],
      additionalProperties: false,
    },
  },
] as const;

export async function getAccountInfo(context: ToolContext): Promise<AccountInfo> {
  let account = context.accountId ? await getAccountById(context.accountId) : null;
  if (context.accountId && !account) throw Object.assign(new Error('Selected account not found.'), { code: 'ACCOUNT_NOT_FOUND' });
  if (!account) {
    const accounts = await getAccounts();
    if (accounts.length === 0) throw Object.assign(new Error('No verified MT5 account is connected.'), { code: 'NO_ACCOUNT' });
    if (accounts.length > 1) throw Object.assign(new Error('Several MT5 accounts are connected; the user needs to select one in NOVA first.'), { code: 'ACCOUNT_SELECTION_REQUIRED' });
    account = accounts[0];
  }
  const balance = Number(account.current_balance);
  const equity = Number(account.current_equity);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const trades = await getTradesByAccount(account.id);
  const todaysClosed = trades.filter((trade) => trade.is_closed && trade.closed_at && new Date(trade.closed_at).getTime() >= todayStart.getTime());
  return {
    currency: account.currency,
    connection_status: account.connection_status || 'DISCONNECTED',
    last_synced_at: account.last_synced_at ? new Date(account.last_synced_at).toISOString() : null,
    balance, equity, floating_pnl: Number((equity - balance).toFixed(2)),
    realized_pnl_today: Number(todaysClosed.reduce((total, trade) => total + Number(trade.net_profit || 0), 0).toFixed(2)),
    closed_trades_today: todaysClosed.length,
    open_positions: Number(account.positions_count || 0), recorded_trades: Number(account.trades_count || 0),
  };
}

export async function getDashboardSummary(context: ToolContext): Promise<Record<string, unknown>> {
  const [profile, accounts, financeItems] = await Promise.all([getProfile(), getAccounts(), listItems()]);
  const selectedAccount = context.accountId
    ? accounts.find((account) => account.id === context.accountId)
    : accounts.length === 1 ? accounts[0] : undefined;
  if (context.accountId && !selectedAccount) {
    throw Object.assign(new Error('Selected account not found.'), { code: 'ACCOUNT_NOT_FOUND' });
  }

  const accountIds = selectedAccount ? [selectedAccount.id] : accounts.map((account) => account.id);
  const positionGroups = await Promise.all(accountIds.map(async (accountId) => ({
    accountId,
    positions: await getAccountPositions(accountId),
  })));
  const accountCurrencies = new Map(accounts.map((account) => [account.id, account.currency]));
  const positions = positionGroups.flatMap(({ accountId, positions: accountPositions }) => accountPositions.map((position) => ({
    account_name: accounts.find((account) => account.id === accountId)?.account_name || 'Verified MT5 account',
    currency: accountCurrencies.get(accountId) || 'USD',
    symbol: position.symbol, direction: position.direction, volume: Number(position.volume),
    open_price: Number(position.open_price), current_price: Number(position.current_price),
    current_profit: Number(position.current_profit), opened_at: position.opened_at,
  })));
  const tradeGroups = await Promise.all(accountIds.map(async (accountId) => ({
    accountId,
    trades: await getTradesByAccount(accountId),
  })));
  const accountNames = new Map(accounts.map((account) => [account.id, account.account_name]));
  const trades = tradeGroups.flatMap(({ accountId, trades: accountTrades }) => accountTrades.map((trade) => ({
    account_name: accountNames.get(accountId) || 'Verified MT5 account',
    currency: accountCurrencies.get(accountId) || 'USD',
    symbol: trade.symbol,
    direction: trade.direction,
    outcome: trade.outcome,
    net_profit: Number(trade.net_profit),
    opened_at: trade.opened_at,
    closed_at: trade.closed_at || null,
    is_closed: trade.is_closed,
    setup_quality: trade.confluences?.setup_quality || null,
    discipline_score: trade.confluences?.discipline_score ?? null,
  })).sort((a, b) => Date.parse(b.opened_at) - Date.parse(a.opened_at)));
  const performanceByCurrency = new Map<string, { closed_trades: number; wins: number; losses: number; breakevens: number; net_profit: number }>();
  for (const trade of trades.filter((item) => item.is_closed)) {
    const metrics = performanceByCurrency.get(trade.currency) || { closed_trades: 0, wins: 0, losses: 0, breakevens: 0, net_profit: 0 };
    metrics.closed_trades += 1;
    metrics.net_profit = Number((metrics.net_profit + trade.net_profit).toFixed(2));
    if (trade.outcome === 'WIN') metrics.wins += 1;
    else if (trade.outcome === 'LOSS') metrics.losses += 1;
    else metrics.breakevens += 1;
    performanceByCurrency.set(trade.currency, metrics);
  }
  const assets = financeItems.filter((item) => item.kind === 'asset').reduce((total, item) => total + Number(item.value), 0);
  const liabilities = financeItems.filter((item) => item.kind === 'liability').reduce((total, item) => total + Number(item.value), 0);

  return {
    profile: { display_name: profile.display_name, currency: profile.currency, networth_goal: profile.networth_goal },
    accounts: accounts.map((account) => ({
      name: account.account_name, broker: account.broker_name, currency: account.currency,
      balance: Number(account.current_balance), equity: Number(account.current_equity),
      connection_status: account.connection_status, last_synced_at: account.last_synced_at || null,
      open_positions: Number(account.positions_count || 0), recorded_trades: Number(account.trades_count || 0),
    })),
    selected_account: selectedAccount?.account_name || null,
    open_positions: positions,
    trading_performance_by_currency: [...performanceByCurrency.entries()].map(([currency, metrics]) => ({
      currency, ...metrics, win_rate: metrics.closed_trades ? Number(((metrics.wins / metrics.closed_trades) * 100).toFixed(1)) : 0,
    })),
    recent_trades: trades.slice(0, 8),
    net_worth: {
      currency: profile.currency, assets: Number(assets.toFixed(2)), liabilities: Number(liabilities.toFixed(2)),
      total: Number((assets - liabilities).toFixed(2)), goal: profile.networth_goal,
      items: financeItems.map(({ name, kind, category, value }) => ({ name, kind, category, value: Number(value) })),
    },
  };
}

export async function executeReadOnlyTool(name: string, context: ToolContext, args: Record<string, unknown> = {}): Promise<unknown> {
  if (name === 'get_account_info') return getAccountInfo(context);
  if (name === 'get_dashboard_summary') return getDashboardSummary(context);
  if (name === 'navigate_to_tab') {
    const page = args.page;
    if (typeof page !== 'string' || !Object.prototype.hasOwnProperty.call(NAVIGATION_PAGES, page)) {
      throw Object.assign(new Error('Requested dashboard page is not allowed.'), { code: 'TOOL_NOT_ALLOWED' });
    }
    return { page, label: NAVIGATION_PAGES[page as DashboardPage] };
  }
  throw Object.assign(new Error('Tool is not allowed.'), { code: 'TOOL_NOT_ALLOWED' });
}