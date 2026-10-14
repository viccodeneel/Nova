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
