import { getAccountById, getAccounts, getAccountPositions } from '../services/accountService.ts';
import { getTradesByAccount } from '../services/tradeService.ts';
import { getProfile } from '../services/profileService.ts';
import { listItems } from '../services/financeService.ts';
import { getAccountInfo } from './tools.ts';
import { MEMORY_KINDS, addMemory, forgetMatching, normalize, type MemoryKind } from './memory.ts';
import type { AssistantTool } from './provider.ts';
import { getWeather, isWebSearchConfigured, webSearch } from './webTools.ts';

export const NAVIGATION_PAGES = {
  overview: 'Dashboard', 'trade-journal': 'Trade Journal', analytics: 'Analytics', accounts: 'Accounts', ai: 'NOVA', finance: 'Net Worth', settings: 'Settings',
} as const;
export type AgentPage = keyof typeof NAVIGATION_PAGES;
export interface AgentToolContext { accountId?: string; userMessage: string }
type Args = Record<string, unknown>;
// Permission model: 'read' and 'ui' run automatically; 'external' reaches third-party services (queries leave the server); 'memory' is gated by backend checks; money-moving actions do not exist yet.
type Risk = 'read' | 'ui' | 'memory' | 'external';
interface ToolDef { name: string; description: string; properties: Record<string, unknown>; required?: string[]; risk: Risk; run: (args: Args, ctx: AgentToolContext) => Promise<unknown> }

const PERIODS = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'all'] as const;
const periodProps = {
  period: { type: 'string', enum: PERIODS, description: 'Time window. Defaults to today.' },
  date: { type: 'string', description: 'Optional specific day as YYYY-MM-DD (overrides period).' },
};
const round = (n: number) => Number(n.toFixed(2));
const fail = (code: string, message: string) => Object.assign(new Error(message), { code });

export function periodRange(period = 'today', date?: string, now = new Date()): { from: Date; to: Date; label: string } {
  const day = (offset = 0) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
  if (date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw fail('INVALID_ARGUMENT', 'date must be YYYY-MM-DD');
    const from = new Date(`${date}T00:00:00Z`);
    return { from, to: new Date(from.getTime() + 864e5), label: date };
  }
  const mondayOffset = -((now.getUTCDay() + 6) % 7);
  switch (period) {
    case 'today': return { from: day(), to: day(1), label: 'today (UTC)' };
    case 'yesterday': return { from: day(-1), to: day(), label: 'yesterday (UTC)' };
    case 'this_week': return { from: day(mondayOffset), to: day(1), label: 'this week since Monday (UTC)' };
    case 'last_week': return { from: day(mondayOffset - 7), to: day(mondayOffset), label: 'last week (UTC)' };
    case 'this_month': return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: day(1), label: 'this month (UTC)' };
    case 'last_month': return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), label: 'last month (UTC)' };
    case 'all': return { from: new Date(0), to: new Date(8.64e15), label: 'all recorded history' };
    default: throw fail('INVALID_ARGUMENT', `unknown period: ${period}`);
  }
}

async function accountsInScope(ctx: AgentToolContext) {
  if (ctx.accountId) {
    const account = await getAccountById(ctx.accountId);
    if (!account) throw fail('ACCOUNT_NOT_FOUND', 'The selected MT5 account could not be found.');
    return [account];
  }
  const accounts = await getAccounts();
  if (!accounts.length) throw fail('NO_ACCOUNT', 'No verified MT5 account is connected.');
  return accounts;
}
const freshness = (a: { connection_status?: string; last_synced_at?: unknown }) => ({
  connection_status: a.connection_status || 'DISCONNECTED',
  last_synced_at: a.last_synced_at ? new Date(a.last_synced_at as string).toISOString() : null,
});

const TOOLS: ToolDef[] = [
  {
    name: 'get_account_info', risk: 'read', properties: {},
    description: 'Live MT5 account snapshot: balance, equity, floating P&L, open position count, connection status and data freshness. Use for "how is the account", balance, or equity questions.',
    run: (_a, ctx) => getAccountInfo({ accountId: ctx.accountId }),
  },
  {
    name: 'get_pnl', risk: 'read', properties: periodProps,
    description: 'Realized trading result for a period: closed trades, wins, losses, net profit, best and worst trade, per account, plus current floating P&L. Use for P&L, "how did I do today/yesterday/this week", and performance questions.',
    run: async (args, ctx) => {
      const range = periodRange(args.period as string | undefined, args.date as string | undefined);
      const out = [];
      for (const account of await accountsInScope(ctx)) {
        const closed = (await getTradesByAccount(account.id)).filter((t) => t.is_closed && t.closed_at && new Date(t.closed_at) >= range.from && new Date(t.closed_at) < range.to);
        const profits = closed.map((t) => Number(t.net_profit || 0));
        const best = closed.length ? closed[profits.indexOf(Math.max(...profits))] : null;
        const worst = closed.length ? closed[profits.indexOf(Math.min(...profits))] : null;
        out.push({
          account: account.account_name, currency: account.currency, ...freshness(account),
          closed_trades: closed.length, wins: profits.filter((p) => p > 0).length, losses: profits.filter((p) => p < 0).length, breakevens: profits.filter((p) => p === 0).length,
          net_profit: round(profits.reduce((a, b) => a + b, 0)),
          best_trade: best ? { symbol: best.symbol, net_profit: round(Number(best.net_profit)) } : null,
          worst_trade: worst ? { symbol: worst.symbol, net_profit: round(Number(worst.net_profit)) } : null,
          floating_pnl_now: round(Number(account.current_equity) - Number(account.current_balance)),
        });
      }
      return { period: range.label, range_utc: { from: range.from.toISOString(), to: range.to.toISOString() }, accounts: out, time_basis: 'UTC days; MT5 broker-time offset not yet verified' };
    },
  },
  {
    name: 'get_trades', risk: 'read',
    properties: { ...periodProps, symbol: { type: 'string', description: 'Filter by instrument, e.g. XAUUSD.' }, limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Max trades, default 10.' } },
    description: 'List individual recorded trades (most recent first) with symbol, direction, result and times. Use when he asks about specific trades, "my last trade", or wants a breakdown.',
    run: async (args, ctx) => {
      const range = args.period || args.date ? periodRange(args.period as string | undefined, args.date as string | undefined) : null;
      const symbol = typeof args.symbol === 'string' ? args.symbol.toLowerCase() : '';
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
      const rows = [];
      for (const account of await accountsInScope(ctx)) {
        for (const t of await getTradesByAccount(account.id)) {
          const at = new Date(t.closed_at || t.opened_at);
          if (range && !(at >= range.from && at < range.to)) continue;
          if (symbol && !String(t.symbol).toLowerCase().includes(symbol)) continue;
          rows.push({ at: at.getTime(), account: account.account_name, currency: account.currency, symbol: t.symbol, direction: t.direction, is_closed: t.is_closed, net_profit: round(Number(t.net_profit || 0)), outcome: t.outcome, opened_at: t.opened_at, closed_at: t.closed_at || null });
        }
      }
      rows.sort((a, b) => b.at - a.at);
      return { total_matching: rows.length, trades: rows.slice(0, limit).map(({ at: _at, ...rest }) => rest) };
    },
  },
  {
    name: 'get_open_positions', risk: 'read', properties: {},
    description: 'Currently open MT5 positions with symbol, direction, size, prices and floating profit.',
    run: async (_a, ctx) => {
      const out = [];
      for (const account of await accountsInScope(ctx)) {
        for (const p of await getAccountPositions(account.id)) out.push({ account: account.account_name, currency: account.currency, symbol: p.symbol, direction: p.direction, volume: Number(p.volume), open_price: Number(p.open_price), current_price: Number(p.current_price), floating_profit: round(Number(p.current_profit)), opened_at: p.opened_at });
      }
      return { count: out.length, total_floating_profit: round(out.reduce((a, p) => a + p.floating_profit, 0)), positions: out };
    },
  },
  {
    name: 'get_net_worth', risk: 'read', properties: {},
    description: 'His personal Net Worth tracker: assets, liabilities, total, goal and each tracked item (cash, devices, vehicles, debts). Separate from the MT5 trading account.',
    run: async () => {
      const [profile, items] = await Promise.all([getProfile(), listItems()]);
      const assets = items.filter((i) => i.kind === 'asset').reduce((a, i) => a + Number(i.value), 0);
      const liabilities = items.filter((i) => i.kind === 'liability').reduce((a, i) => a + Number(i.value), 0);
      const total = assets - liabilities;
      return { currency: profile.currency, assets: round(assets), liabilities: round(liabilities), total: round(total), goal: profile.networth_goal, goal_progress_percent: profile.networth_goal ? round((total / profile.networth_goal) * 100) : null, items: items.map((i) => ({ name: i.name, kind: i.kind, category: i.category, value: Number(i.value) })) };
    },
  },
  {
    name: 'web_search', risk: 'external', required: ['query'],
    properties: {
      query: { type: 'string', maxLength: 300, description: 'A focused search query. Never include account balances, trade details, or personal information.' },
      topic: { type: 'string', enum: ['general', 'news'], description: 'Use news for recent events and market news.' },
    },
    description: 'Search the live web. Use for current events, news, prices, recent releases, or anything that may have changed since your training. Not for his own account data (use the account tools).',
    run: (args) => webSearch(args),
  },
  {
    name: 'get_weather', risk: 'external',
    properties: {
      location: { type: 'string', description: 'City name. Omit to use the configured default location.' },
      days: { type: 'integer', minimum: 1, maximum: 3, description: 'Forecast days, default 2.' },
    },
    description: 'Current weather and a short forecast for a city.',
    run: (args) => getWeather(args),
  },
  {
    name: 'navigate_to_tab', risk: 'ui', required: ['page'],
    properties: { page: { type: 'string', enum: Object.keys(NAVIGATION_PAGES), description: 'overview = Dashboard, trade-journal = trades/journal, analytics, accounts, finance = Net Worth, settings, ai = NOVA home.' } },
    description: 'Open a section of the NOVA dashboard. Use when he wants to go to, open, or see a page, including loosely worded requests such as "show me where my trades are" (trade-journal).',
    run: async (args) => {
      const page = args.page;
      if (typeof page !== 'string' || !Object.prototype.hasOwnProperty.call(NAVIGATION_PAGES, page)) throw fail('TOOL_NOT_ALLOWED', 'Requested dashboard page is not allowed.');
      return { opened: true, page, label: NAVIGATION_PAGES[page as AgentPage] };
    },
  },
  {
    name: 'remember', risk: 'memory', required: ['content', 'kind', 'evidence'],
    properties: {
      content: { type: 'string', maxLength: 300, description: 'The note, written as a short standalone statement.' },
      kind: { type: 'string', enum: MEMORY_KINDS },
      evidence: { type: 'string', description: "The exact words from the user's latest message asking to remember it." },
    },
    description: 'Store a long-term note ONLY when the user explicitly asks you to remember something or states a standing preference. Never for casual chat.',
    run: async (args, ctx) => {
      const evidence = typeof args.evidence === 'string' ? normalize(args.evidence) : '';
      const explicit = /\b(remember|don'?t forget|do not forget|keep in mind|note that|make a note|from now on|going forward|always|never)\b/i.test(ctx.userMessage);
      if (!explicit || evidence.length < 4 || !normalize(ctx.userMessage).includes(evidence)) throw fail('MEMORY_NOT_AUTHORISED', 'The user did not explicitly ask to remember this, so nothing was stored.');
      if (!MEMORY_KINDS.includes(args.kind as MemoryKind) || typeof args.content !== 'string') throw fail('INVALID_ARGUMENT', 'content and a valid kind are required');
      const { memory, duplicate } = await addMemory(args.kind as MemoryKind, args.content);
      return { saved: !duplicate, already_known: duplicate, id: memory.id };
    },
  },
  {
    name: 'forget', risk: 'memory', required: ['description'],
    properties: { description: { type: 'string', description: 'What to forget, in his words.' } },
    description: 'Delete stored notes matching a description, ONLY when the user asks you to forget something.',
    run: async (args, ctx) => {
      if (!/\b(forget|delete|remove|erase|clear)\b/i.test(ctx.userMessage)) throw fail('MEMORY_NOT_AUTHORISED', 'The user did not ask to forget anything, so nothing was removed.');
      if (typeof args.description !== 'string') throw fail('INVALID_ARGUMENT', 'description is required');
      const { removed, ambiguous } = await forgetMatching(args.description);
      return ambiguous.length ? { removed: 0, needs_clarification: true, candidates: ambiguous } : { removed: removed.length, forgotten: removed };
    },
  },
];

const ALL_TOOLS: AssistantTool[] = TOOLS.map((t) => ({
  name: t.name, description: t.description,
  parametersJsonSchema: { type: 'object', properties: t.properties, ...(t.required ? { required: t.required } : {}), additionalProperties: false },
})) as AssistantTool[];

/** web_search is only offered when a search key exists, so NOVA never claims a capability it lacks. */
export const getAgentTools = (): AssistantTool[] => ALL_TOOLS.filter((t) => t.name !== 'web_search' || isWebSearchConfigured());

export async function executeAgentTool(name: string, args: Args, ctx: AgentToolContext): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw fail('TOOL_NOT_ALLOWED', 'Tool is not allowed.');
  return tool.run(args && typeof args === 'object' ? args : {}, ctx);
}
