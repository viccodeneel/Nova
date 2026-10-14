const API_BASE = 'https://www.myfxbook.com/api/';
const REQUEST_TIMEOUT_MS = 8_000;

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

export interface MyfxbookCredentials {
  email: string;
  password: string;
}
export interface MyfxbookAccount {
  id: string;
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
  provider: 'Myfxbook';
  sourceUpdatedAt?: string;
}

export interface MyfxbookOpenTrade {
  openTime?: string;
  symbol?: string;
  direction?: string;
  size?: number;
  sizeType?: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  floatingProfit?: number;
  swap?: number;
  provider: 'Myfxbook';
}

export interface MyfxbookHistoryTrade {
  openTime?: string;
  closeTime?: string;
  symbol?: string;
  direction?: string;
  size?: number;
  sizeType?: string;
  entryPrice?: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  profit?: number;
  commission?: number;
  interest?: number;
  swap?: number;
  provider: 'Myfxbook';
}

export class MyfxbookServiceError extends Error {
  readonly code: 'NOT_CONFIGURED' | 'INVALID_ACCOUNT_ID' | 'ACCOUNT_NOT_FOUND' | 'UPSTREAM_FAILURE' | 'UPSTREAM_TIMEOUT' | 'INVALID_SESSION' | 'INVALID_RESPONSE';

  constructor(code: MyfxbookServiceError['code']) {
    super(code);
    this.name = 'MyfxbookServiceError';
    this.code = code;
  }
}

const TIMESTAMP_SEMANTICS = 'Myfxbook timestamps are returned without a timezone offset; NOVA preserves the provider strings unchanged and does not assume or convert a timezone.';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function providerFailure(stage: string, code: MyfxbookServiceError['code']): MyfxbookServiceError {
  // Do not log provider messages, URLs, query parameters, credentials, or session IDs.
  console.warn('[Myfxbook] request failed', { stage, code });
  return new MyfxbookServiceError(code);
}

function getCredentials(): MyfxbookCredentials {
  const email = process.env.MYFXBOOK_EMAIL?.trim();
  const password = process.env.MYFXBOOK_PASSWORD;
  if (!email || !password) throw new MyfxbookServiceError('NOT_CONFIGURED');
  return { email, password };
}

async function requestJson(
  endpoint: string,
  params: Record<string, string>,
  fetcher: FetchLike,
): Promise<JsonRecord> {
  const url = new URL(endpoint, API_BASE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetcher(url, { method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw providerFailure(endpoint, timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FAILURE');
  }
  if (!response.ok) throw providerFailure(endpoint, 'UPSTREAM_FAILURE');
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw providerFailure(endpoint, 'INVALID_RESPONSE');
  }
  if (!isRecord(body)) throw providerFailure(endpoint, 'INVALID_RESPONSE');
  if (body.error === true) {
    const providerMessage = typeof body.message === 'string' ? body.message : '';
    if (endpoint !== 'login.json' && /session/i.test(providerMessage)) throw providerFailure(endpoint, 'INVALID_SESSION');
    throw providerFailure(endpoint, 'UPSTREAM_FAILURE');
  }
  if (body.error !== false) throw providerFailure(endpoint, 'INVALID_RESPONSE');
  return body;
}

async function withSession<T>(
  operation: (session: string) => Promise<T>,
  fetcher: FetchLike,
): Promise<T> {
  const credentials = getCredentials();
  const login = await requestJson('login.json', { email: credentials.email, password: credentials.password }, fetcher);
  const session = asOptionalString(login.session);
  if (!session) throw providerFailure('login.json', 'INVALID_RESPONSE');
  try {
    return await operation(session);
  } finally {
    try {
      await requestJson('logout.json', { session }, fetcher);
    } catch {
      // Session cleanup is best effort. Never surface or log provider details.
      console.warn('[Myfxbook] session cleanup failed');
    }
  }
}

function normalizeAccount(value: unknown): MyfxbookAccount {
  if (!isRecord(value) || (typeof value.id !== 'number' && typeof value.id !== 'string')) {
    throw new MyfxbookServiceError('INVALID_RESPONSE');
  }
  const account: MyfxbookAccount = { id: String(value.id), provider: 'Myfxbook' };
  const server = isRecord(value.server) ? asOptionalString(value.server.name) : undefined;
  const fields: Array<[keyof MyfxbookAccount, unknown]> = [
    ['mtAccountNumber', value.accountId], ['name', value.name], ['server', server],
    ['currency', value.currency], ['balance', value.balance], ['equity', value.equity],
    ['profit', value.profit], ['gain', value.gain], ['lastUpdateDate', value.lastUpdateDate],
  ];
  for (const [key, raw] of fields) {
    const normalized = key === 'mtAccountNumber' && (typeof raw === 'number' || typeof raw === 'string')
      ? String(raw)
      : (['balance', 'equity', 'profit', 'gain'].includes(key) ? asOptionalNumber(raw) : asOptionalString(raw));
    if (normalized !== undefined) Object.assign(account, { [key]: normalized });
  }
  if (typeof value.demo === 'boolean') account.demo = value.demo;
  if (account.lastUpdateDate) account.sourceUpdatedAt = account.lastUpdateDate;
  return account;
}

function normalizeOpenTrade(value: unknown): MyfxbookOpenTrade {
  if (!isRecord(value)) throw new MyfxbookServiceError('INVALID_RESPONSE');
  const sizing = isRecord(value.sizing) ? value.sizing : {};
  const trade: MyfxbookOpenTrade = { provider: 'Myfxbook' };
  const fields: Array<[keyof MyfxbookOpenTrade, unknown]> = [
    ['openTime', value.openTime], ['symbol', value.symbol], ['direction', value.action],
    ['size', sizing.value], ['sizeType', sizing.type], ['entryPrice', value.openPrice],
    ['stopLoss', value.sl], ['takeProfit', value.tp], ['floatingProfit', value.profit], ['swap', value.swap],
  ];
  for (const [key, raw] of fields) {
    const normalized = ['size', 'entryPrice', 'stopLoss', 'takeProfit', 'floatingProfit', 'swap'].includes(key)
      ? asOptionalNumber(raw) : asOptionalString(raw);
    if (normalized !== undefined) Object.assign(trade, { [key]: normalized });
  }
  return trade;
}

function normalizeHistoryTrade(value: unknown): MyfxbookHistoryTrade {
  if (!isRecord(value)) throw new MyfxbookServiceError('INVALID_RESPONSE');
  const sizing = isRecord(value.sizing) ? value.sizing : {};
  const trade: MyfxbookHistoryTrade = { provider: 'Myfxbook' };
  const fields: Array<[keyof MyfxbookHistoryTrade, unknown]> = [
    ['openTime', value.openTime], ['closeTime', value.closeTime], ['symbol', value.symbol],
    ['direction', value.action], ['size', sizing.value], ['sizeType', sizing.type],
    ['entryPrice', value.openPrice], ['exitPrice', value.closePrice], ['stopLoss', value.sl],
    ['takeProfit', value.tp], ['profit', value.profit], ['commission', value.commission], ['interest', value.interest], ['swap', value.swap],
  ];
  for (const [key, raw] of fields) {
    const normalized = ['size', 'entryPrice', 'exitPrice', 'stopLoss', 'takeProfit', 'profit', 'commission', 'interest', 'swap'].includes(key)
      ? asOptionalNumber(raw) : asOptionalString(raw);
    if (normalized !== undefined) Object.assign(trade, { [key]: normalized });
  }
  return trade;
}

async function getAccountsForSession(session: string, fetcher: FetchLike): Promise<MyfxbookAccount[]> {
  const body = await requestJson('get-my-accounts.json', { session }, fetcher);
  if (!Array.isArray(body.accounts)) throw providerFailure('get-my-accounts.json', 'INVALID_RESPONSE');
  return body.accounts.map(normalizeAccount);
}

async function getOwnedAccount(session: string, accountId: string, fetcher: FetchLike): Promise<void> {
  if (!/^\d{1,20}$/.test(accountId)) throw new MyfxbookServiceError('INVALID_ACCOUNT_ID');
  const accounts = await getAccountsForSession(session, fetcher);
  if (!accounts.some((account) => account.id === accountId)) throw new MyfxbookServiceError('ACCOUNT_NOT_FOUND');
}

export function createMyfxbookService(fetcher: FetchLike = fetch) {
  return {
    isConfigured(): boolean {
      return !!process.env.MYFXBOOK_EMAIL?.trim() && !!process.env.MYFXBOOK_PASSWORD;
    },
    async getAccounts(): Promise<{ provider: 'Myfxbook'; fetchedAt: string; timestampSemantics: string; accounts: MyfxbookAccount[] }> {
      return withSession(async (session) => ({ provider: 'Myfxbook', fetchedAt: new Date().toISOString(), timestampSemantics: TIMESTAMP_SEMANTICS, accounts: await getAccountsForSession(session, fetcher) }), fetcher);
    },
    async getOpenTrades(accountId: string): Promise<{ provider: 'Myfxbook'; accountId: string; fetchedAt: string; timestampSemantics: string; trades: MyfxbookOpenTrade[] }> {
      return withSession(async (session) => {
        await getOwnedAccount(session, accountId, fetcher);
        const body = await requestJson('get-open-trades.json', { session, id: accountId }, fetcher);
        if (!Array.isArray(body.openTrades)) throw providerFailure('get-open-trades.json', 'INVALID_RESPONSE');
        return { provider: 'Myfxbook', accountId, fetchedAt: new Date().toISOString(), timestampSemantics: TIMESTAMP_SEMANTICS, trades: body.openTrades.map(normalizeOpenTrade) };
      }, fetcher);
    },
    async getHistory(accountId: string): Promise<{ provider: 'Myfxbook'; accountId: string; fetchedAt: string; timestampSemantics: string; trades: MyfxbookHistoryTrade[] }> {
      return withSession(async (session) => {
        await getOwnedAccount(session, accountId, fetcher);
        const body = await requestJson('get-history.json', { session, id: accountId }, fetcher);
        if (!Array.isArray(body.history)) throw providerFailure('get-history.json', 'INVALID_RESPONSE');
        return { provider: 'Myfxbook', accountId, fetchedAt: new Date().toISOString(), timestampSemantics: TIMESTAMP_SEMANTICS, trades: body.history.map(normalizeHistoryTrade) };
      }, fetcher);
    },
    async getDiagnostic(accountId: string): Promise<{ provider: 'Myfxbook'; fetchedAt: string; timestampSemantics: string; account: MyfxbookAccount; openTrades: MyfxbookOpenTrade[]; history: MyfxbookHistoryTrade[] }> {
      return withSession(async (session) => {
        if (!/^\d{1,20}$/.test(accountId)) throw new MyfxbookServiceError('INVALID_ACCOUNT_ID');
        const accountBody = await getAccountsForSession(session, fetcher);
        const account = accountBody.find((item) => item.id === accountId);
        if (!account) throw new MyfxbookServiceError('ACCOUNT_NOT_FOUND');
        const [openBody, historyBody] = await Promise.all([
          requestJson('get-open-trades.json', { session, id: accountId }, fetcher),
          requestJson('get-history.json', { session, id: accountId }, fetcher),
        ]);
        if (!Array.isArray(openBody.openTrades) || !Array.isArray(historyBody.history)) throw new MyfxbookServiceError('INVALID_RESPONSE');
        return {
          provider: 'Myfxbook', fetchedAt: new Date().toISOString(), timestampSemantics: TIMESTAMP_SEMANTICS, account,
          openTrades: openBody.openTrades.map(normalizeOpenTrade), history: historyBody.history.map(normalizeHistoryTrade),
        };
      }, fetcher);
    },
  };
}
