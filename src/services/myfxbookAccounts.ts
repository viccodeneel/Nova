import { PropAccount, TradeExecution } from '../data/terminalData';

export interface MyfxbookAccount {
  id: string;
  provider: 'Myfxbook';
  mtAccountNumber?: string;
  name?: string;
  server?: string;
  currency?: string;
  demo?: boolean;
  balance?: number;
  equity?: number;
  profit?: number;
  gain?: number;
  lastUpdateDate?: string;
  sourceUpdatedAt?: string;
}

export interface MyfxbookAccountsResponse {
  provider: 'Myfxbook';
  fetchedAt: string;
  timestampSemantics?: string;
  accounts: MyfxbookAccount[];
}

export interface MyfxbookOpenTrade {
  openTime?: string; symbol?: string; direction?: string; size?: number; sizeType?: string;
  entryPrice?: number; stopLoss?: number; takeProfit?: number; floatingProfit?: number; swap?: number;
}

export interface MyfxbookHistoryTrade {
  openTime?: string; closeTime?: string; symbol?: string; direction?: string; size?: number; sizeType?: string;
  entryPrice?: number; exitPrice?: number; stopLoss?: number; takeProfit?: number; profit?: number;
  commission?: number; interest?: number; swap?: number;
}

export interface MyfxbookAccountActivity {
  provider: 'Myfxbook'; accountId: string; fetchedAt: string; timestampSemantics?: string;
  openTrades: MyfxbookOpenTrade[]; history: MyfxbookHistoryTrade[];
}

export interface MyfxbookActivityCacheEntry {
  trades: TradeExecution[];
  loading: boolean;
  error: MyfxbookRequestError | null;
  loaded: boolean;
  requestId: number;
}

export type MyfxbookActivityCache = Record<string, MyfxbookActivityCacheEntry>;
export const MYFXBOOK_HISTORY_LIMIT = 50;

export type MyfxbookLoadState = 'loading' | 'authentication-error' | 'provider-error' | 'empty' | 'ready';

export class MyfxbookRequestError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = 'MyfxbookRequestError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function parseMyfxbookAccountsResponse(value: unknown): MyfxbookAccountsResponse {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) {
    throw new MyfxbookRequestError('Myfxbook returned an unreadable response.');
  }

  const data = value.data;
  if (data.provider !== 'Myfxbook' || typeof data.fetchedAt !== 'string' || !Array.isArray(data.accounts)) {
    throw new MyfxbookRequestError('Myfxbook returned an unreadable response.');
  }

  const accounts = data.accounts.map((item): MyfxbookAccount => {
    if (!isRecord(item) || (typeof item.id !== 'string' && typeof item.id !== 'number')) {
      throw new MyfxbookRequestError('Myfxbook returned an unreadable account record.');
    }
    const account: MyfxbookAccount = { id: String(item.id), provider: 'Myfxbook' };
    for (const key of ['mtAccountNumber', 'name', 'server', 'currency', 'lastUpdateDate', 'sourceUpdatedAt'] as const) {
      const field = optionalString(item[key]);
      if (field !== undefined) account[key] = field;
    }
    for (const key of ['balance', 'equity', 'profit', 'gain'] as const) {
      const field = optionalNumber(item[key]);
      if (field !== undefined) account[key] = field;
    }
    if (typeof item.demo === 'boolean') account.demo = item.demo;
    return account;
  });

  return {
    provider: 'Myfxbook',
    fetchedAt: data.fetchedAt,
    ...(typeof data.timestampSemantics === 'string' ? { timestampSemantics: data.timestampSemantics } : {}),
    accounts,
  };
}

export function mapMyfxbookAccountToDashboard(account: MyfxbookAccount): PropAccount {
  return {
    id: `myfxbook:${account.id}`, source: 'MYFXBOOK', providerAccountId: account.id,
    name: account.name || 'Myfxbook account', currency: account.currency,
    balanceAvailable: account.balance !== undefined, equityAvailable: account.equity !== undefined,
    startingBalanceAvailable: false, profitAvailable: account.profit !== undefined,
    provider: 'Myfxbook', accountType: typeof account.demo === 'boolean' ? (account.demo ? 'Demo' : 'Live') : undefined,
    connectionMode: account.demo === undefined ? null : account.demo ? 'DEMO' : 'REAL',
    classification: account.demo === undefined ? undefined : account.demo ? 'DEMO' : 'LIVE_BROKERAGE',
    connectionStatus: 'PROVIDER_READ_ONLY', ref: account.mtAccountNumber || account.id,
    shortRef: account.mtAccountNumber || 'Myfxbook', bridge: 'Myfxbook', phase: '',
    baseBalance: 0, currentBalance: account.balance ?? 0, liveEquity: account.equity ?? 0,
    floatingPnl: 0, netProfit: account.profit ?? 0, roiPercent: 0, targetProfit: 0,
    targetPercent: 0, passThreshold: 0, dailyLimit: 0, currentDailyDrawdown: 0,
    maxLossLimit: 0, currentMaxDrawdown: 0, peakWater: account.balance ?? 0,
    status: 'SAFE', isRealConnected: undefined, tradeCount: undefined,
  };
}

function stableTradeHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

function tradeSide(value: string | undefined): TradeExecution['side'] {
  const normalized = value?.toLowerCase();
  return normalized?.startsWith('buy') ? 'BUY' : normalized?.startsWith('sell') ? 'SELL' : 'UNKNOWN';
}

export function myfxbookRealizedTradePnl(record: MyfxbookHistoryTrade): number | undefined {
  if (record.profit === undefined) return undefined;
  return record.profit + (record.commission ?? 0) + (record.interest ?? 0) + (record.swap ?? 0);
}

function mapProviderTrade(
  account: PropAccount,
  record: MyfxbookHistoryTrade | MyfxbookOpenTrade,
  type: 'history' | 'open',
  occurrence: number,
  timestampSemantics?: string,
): TradeExecution {
  const history = type === 'history' ? record as MyfxbookHistoryTrade : undefined;
  const open = type === 'open' ? record as MyfxbookOpenTrade : undefined;
  const direction = record.direction;
  const side = tradeSide(direction);
  const isTradingRecord = Boolean(record.symbol) && side !== 'UNKNOWN';
  const pnl = isTradingRecord
    ? history ? myfxbookRealizedTradePnl(history) : open?.floatingProfit === undefined ? undefined : open.floatingProfit + (open.swap ?? 0)
    : undefined;
  const pnlAvailable = pnl !== undefined;
  const outcome: TradeExecution['outcome'] = type === 'open' ? 'OPEN' : !pnlAvailable ? 'UNKNOWN' : pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BE';
  const identity = JSON.stringify([type, record.openTime, history?.closeTime, record.symbol, direction, record.size, record.entryPrice, history?.exitPrice, pnl, record.stopLoss, record.takeProfit, history?.commission, history?.interest, record.swap, occurrence]);
  const fees = history && [history.commission, history.interest, history.swap].some((value) => value !== undefined)
    ? `Commission ${history.commission ?? '—'} · Interest ${history.interest ?? '—'} · Swap ${history.swap ?? '—'}`
    : 'Not reported';
  return {
    id: `myfxbook:${account.providerAccountId}:${type}:${stableTradeHash(identity)}`,
    accountId: account.id, source: 'MYFXBOOK', tradeStatus: type === 'open' ? 'OPEN' : 'CLOSED',
    pnlAvailable, rValueAvailable: false,
    openedAt: record.openTime, closedAt: history?.closeTime,
    stopLoss: record.stopLoss === undefined ? undefined : String(record.stopLoss),
    takeProfit: record.takeProfit === undefined ? undefined : String(record.takeProfit),
    time: history?.closeTime || record.openTime || 'Time unavailable',
    instrument: record.symbol || 'Symbol unavailable', side,
    entry: record.entryPrice === undefined ? '' : String(record.entryPrice),
    exit: history?.exitPrice === undefined ? undefined : String(history.exitPrice),
    lots: record.size === undefined ? undefined : String(record.size), outcome,
    rMultiple: '—', rValue: 0, netPnl: pnlAvailable ? `${pnl! >= 0 ? '+' : '−'}${Math.abs(pnl!).toFixed(2)}${account.currency ? ` ${account.currency}` : ''}` : 'Unavailable',
    pnlValue: pnl ?? 0, quality: 'Not recorded', discipline: 'Not recorded', disciplineScore: 0,
    session: 'Unknown', holdDuration: 'Unknown', fees, notes: '', rulesPassed: 0,
    ...(timestampSemantics ? { sourceTimestampSemantics: timestampSemantics } : {}),
  };
}

export function mapMyfxbookActivityToTrades(account: PropAccount, activity: MyfxbookAccountActivity): TradeExecution[] {
  const seen = new Map<string, number>();
  const mapRecords = <T extends MyfxbookHistoryTrade | MyfxbookOpenTrade>(records: T[], type: 'history' | 'open') => records.map((record) => {
    const signature = JSON.stringify([type, record.openTime, 'closeTime' in record ? record.closeTime : undefined, record.symbol, record.direction, record.size, record.entryPrice, 'exitPrice' in record ? record.exitPrice : undefined, 'profit' in record ? record.profit : 'floatingProfit' in record ? record.floatingProfit : undefined, record.stopLoss, record.takeProfit, 'commission' in record ? record.commission : undefined, 'interest' in record ? record.interest : undefined, record.swap]);
    const occurrence = seen.get(signature) || 0;
    seen.set(signature, occurrence + 1);
    return mapProviderTrade(account, record, type, occurrence, activity.timestampSemantics);
  });
  return [...mapRecords(activity.history, 'history'), ...mapRecords(activity.openTrades, 'open')];
}

export function getMyfxbookLoadState(input: {
  loading: boolean;
  error: MyfxbookRequestError | null;
  data: MyfxbookAccountsResponse | null;
}): MyfxbookLoadState {
  if (input.loading && !input.data) return 'loading';
  if (input.error?.status === 401) return 'authentication-error';
  if (input.error && !input.data) return 'provider-error';
  if (!input.data || input.data.accounts.length === 0) return 'empty';
  return 'ready';
}


export function resolveActiveAccount(accounts: PropAccount[], selectedId?: string): PropAccount | undefined {
  return accounts.find((account) => account.id === selectedId) || accounts[0];
}

export function tradesForAccount(trades: TradeExecution[], accountId?: string): TradeExecution[] {
  return accountId ? trades.filter((trade) => trade.accountId === accountId) : [];
}

export function beginMyfxbookActivityRequest(
  cache: MyfxbookActivityCache,
  accountId: string,
  requestId: number,
): MyfxbookActivityCache {
  const existing = cache[accountId];
  return {
    ...cache,
    [accountId]: {
      trades: existing?.trades ?? [], loading: true, error: null,
      loaded: existing?.loaded ?? false, requestId,
    },
  };
}

export function settleMyfxbookActivityRequest(
  cache: MyfxbookActivityCache,
  accountId: string,
  requestId: number,
  selectedAccountId: string | undefined,
  result: { trades: TradeExecution[] } | { error: MyfxbookRequestError },
): MyfxbookActivityCache {
  const existing = cache[accountId];
  if (!existing || existing.requestId !== requestId || selectedAccountId !== accountId) return cache;
  return {
    ...cache,
    [accountId]: 'trades' in result
      ? { trades: result.trades, loading: false, error: null, loaded: true, requestId }
      : { ...existing, trades: existing.trades, loading: false, error: result.error, requestId },
  };
}
