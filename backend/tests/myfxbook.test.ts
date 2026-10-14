import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import type { Request, Response as ExpressResponse } from 'express';
import { requireStrictAuth } from '../routes/auth.ts';
import { createMyfxbookRouter } from '../routes/myfxbook.ts';
import { createMyfxbookService, MyfxbookServiceError } from '../services/myfxbookService.ts';

const EMAIL = 'myfxbook-user@example.test';
const PASSWORD = 'never-return-this-password';
const SESSION = 'private-upstream-session-token';

function jsonResponse(body: unknown, status = 200): globalThis.Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function configured<T>(operation: () => Promise<T> | T): Promise<T> {
  process.env.MYFXBOOK_EMAIL = EMAIL;
  process.env.MYFXBOOK_PASSWORD = PASSWORD;
  return Promise.resolve().then(operation).finally(() => {
    delete process.env.MYFXBOOK_EMAIL;
    delete process.env.MYFXBOOK_PASSWORD;
  });
}

function makeFetch(handler: (url: URL) => Response | Promise<Response>) {
  const requested: URL[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requested.push(url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'www.myfxbook.com');
    return handler(url);
  }) as typeof fetch;
  return { fetcher, requested };
}

function apiReply(url: URL): Response {
  switch (url.pathname.split('/').pop()) {
    case 'login.json': return jsonResponse({ error: false, message: '', session: SESSION });
    case 'logout.json': return jsonResponse({ error: false, message: 'Logged out.' });
    case 'get-my-accounts.json': return jsonResponse({ error: false, accounts: [{
      id: 321, name: 'Private account', accountId: 987654, currency: 'USD', demo: false,
      balance: 12500.5, equity: 12600.5, profit: 100.5, gain: 0.8, lastUpdateDate: '10/14/2026 09:30', server: { name: 'Example Server' },
    }] });
    case 'get-open-trades.json': return jsonResponse({ error: false, openTrades: [{
      openTime: '10/14/2026 09:15', symbol: 'EURUSD', action: 'Buy', sizing: { type: 'lots', value: '0.20' },
      openPrice: 1.1, sl: 1.09, tp: 1.12, profit: 18.4, swap: -0.2,
    }] });
    case 'get-history.json': return jsonResponse({ error: false, history: [{
      openTime: '10/13/2026 08:00', closeTime: '10/13/2026 09:00', symbol: 'GBPUSD', action: 'Sell',
      sizing: { type: 'lots', value: 0.1 }, openPrice: 1.3, closePrice: 1.29, sl: 1.31, tp: 1.28,
      profit: 50, commission: -1.2, interest: 0.3, swap: -0.1,
    }] });
    default: return jsonResponse({ error: true, message: 'unexpected endpoint' }, 404);
  }
}

test('Myfxbook status reports configuration without revealing credentials', () => {
  delete process.env.MYFXBOOK_EMAIL;
  delete process.env.MYFXBOOK_PASSWORD;
  assert.equal(createMyfxbookService().isConfigured(), false);
});
test('missing credentials fail explicitly without contacting Myfxbook', async () => {
  delete process.env.MYFXBOOK_EMAIL;
  delete process.env.MYFXBOOK_PASSWORD;
  const service = createMyfxbookService(async () => { throw new Error('fetch should not be called'); });
  await assert.rejects(service.getAccounts(), (error: unknown) => error instanceof MyfxbookServiceError && error.code === 'NOT_CONFIGURED');
});

test('normalizes actual account metrics, open trades and trade history and always logs out', async () => configured(async () => {
  const { fetcher, requested } = makeFetch(apiReply);
  const service = createMyfxbookService(fetcher);
  const accounts = await service.getAccounts();
  assert.equal(accounts.provider, 'Myfxbook');
  assert.equal(accounts.accounts[0].id, '321');
  assert.equal(accounts.accounts[0].mtAccountNumber, '987654');
  assert.equal(accounts.accounts[0].balance, 12500.5);
  assert.equal(accounts.accounts[0].server, 'Example Server');
  assert.ok(accounts.fetchedAt);
  assert.equal('session' in accounts, false);

  const open = await service.getOpenTrades('321');
  assert.equal(open.trades[0].symbol, 'EURUSD');
  assert.equal(open.trades[0].direction, 'Buy');
  assert.equal(open.trades[0].size, 0.2);
  assert.equal(open.trades[0].floatingProfit, 18.4);
  assert.equal(open.provider, 'Myfxbook');

  const history = await service.getHistory('321');
  assert.equal(history.trades[0].closeTime, '10/13/2026 09:00');
  assert.equal(history.trades[0].exitPrice, 1.29);
  assert.equal(history.trades[0].commission, -1.2);
  assert.equal(history.trades[0].swap, -0.1);
  const diagnostic = await service.getDiagnostic('321');
  assert.equal(diagnostic.account.balance, 12500.5);
  assert.equal(diagnostic.openTrades[0].floatingProfit, 18.4);
  assert.equal(diagnostic.history[0].profit, 50);
  assert.match(diagnostic.timestampSemantics, /without a timezone offset/);
  assert.equal(requested.filter((url) => url.pathname.endsWith('/logout.json')).length, 4);
  assert.equal(requested.find((url) => url.pathname.endsWith('/login.json'))?.searchParams.get('email'), EMAIL);
  assert.ok(requested.filter((url) => !url.pathname.endsWith('/login.json')).every((url) => url.searchParams.get('email') === null));
  assert.equal(requested.find((url) => url.pathname.endsWith('/login.json'))?.searchParams.get('password'), PASSWORD);
  assert.ok(requested.filter((url) => !url.pathname.endsWith('/login.json')).every((url) => url.searchParams.get('password') === null));
}));

test('account-scoped reads reject account IDs that are not in this configured Myfxbook account list', async () => configured(async () => {
  const { fetcher, requested } = makeFetch(apiReply);
  const service = createMyfxbookService(fetcher);
  await assert.rejects(service.getOpenTrades('999'), (error: unknown) => error instanceof MyfxbookServiceError && error.code === 'ACCOUNT_NOT_FOUND');
  assert.equal(requested.some((url) => url.pathname.endsWith('/get-open-trades.json')), false);
  assert.ok(requested.some((url) => url.pathname.endsWith('/logout.json')));
  await assert.rejects(service.getHistory('not-an-id'), (error: unknown) => error instanceof MyfxbookServiceError && error.code === 'INVALID_ACCOUNT_ID');
}));

test('invalid provider session and malformed payload fail closed with safe errors', async () => configured(async () => {
  const { fetcher: invalidSessionFetch } = makeFetch((url) => url.pathname.endsWith('/login.json')
    ? jsonResponse({ error: false, session: SESSION })
    : jsonResponse({ error: true, message: `invalid session ${PASSWORD} ${SESSION}` }));
  const invalidSessionService = createMyfxbookService(invalidSessionFetch);
  const logs: string[] = [];
  const previousWarn = console.warn;
  console.warn = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  try {
    await assert.rejects(invalidSessionService.getAccounts(), (error: unknown) => error instanceof MyfxbookServiceError && error.code === 'INVALID_SESSION');
  } finally {
    console.warn = previousWarn;
  }
  assert.ok(logs.length > 0);
  assert.equal(logs.join(' ').includes(PASSWORD), false);
  assert.equal(logs.join(' ').includes(SESSION), false);

  const { fetcher: malformedFetch } = makeFetch((url) => url.pathname.endsWith('/login.json')
    ? jsonResponse({ error: false, session: SESSION })
    : url.pathname.endsWith('/get-my-accounts.json') ? jsonResponse({ error: false, accounts: 'not-an-array' }) : apiReply(url));
  const malformedService = createMyfxbookService(malformedFetch);
  await assert.rejects(malformedService.getAccounts(), (error: unknown) => error instanceof MyfxbookServiceError && error.code === 'INVALID_RESPONSE');
}));

test('provider timeouts are surfaced as an explicit safe timeout error', async () => configured(async () => {
  const fetcher = (async () => { throw new DOMException('timeout', 'TimeoutError'); }) as typeof fetch;
  await assert.rejects(createMyfxbookService(fetcher).getAccounts(), (error: unknown) => error instanceof MyfxbookServiceError && error.code === 'UPSTREAM_TIMEOUT');
}));

test('Myfxbook route is strict-authenticated and returns generic errors without provider secrets', async () => {
  const secret = 'unit-test-auth-secret-with-at-least-32-characters';
  process.env.NOVA_AUTH_SECRET = secret;
  const router = createMyfxbookRouter(createMyfxbookService(async () => jsonResponse({ error: true, message: `${PASSWORD} ${SESSION}` })));
  const statusHandler = (router as any).stack.find((layer: any) => layer.route?.path === '/status').route.stack[0].handle;
  const unauthenticated = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  let called = false;
  requireStrictAuth({ headers: {}, ip: '127.0.0.1' } as Request, unauthenticated as unknown as ExpressResponse, () => { called = true; });
  assert.equal(called, false);
  assert.equal(unauthenticated.statusCode, 401);

  const payload = Buffer.from(JSON.stringify({ sub: 'nova-owner', exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const token = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
  const authorized = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  called = false;
  requireStrictAuth({ headers: { authorization: `Bearer ${token}` } } as Request, authorized as unknown as ExpressResponse, () => { called = true; });
  assert.equal(called, true);
  await statusHandler({}, authorized as unknown as ExpressResponse);
  assert.equal(JSON.stringify(authorized.body).includes(PASSWORD), false);
  assert.equal(JSON.stringify(authorized.body).includes(SESSION), false);

  process.env.MYFXBOOK_EMAIL = EMAIL;
  process.env.MYFXBOOK_PASSWORD = PASSWORD;
  const accountHandler = (router as any).stack.find((layer: any) => layer.route?.path === '/accounts').route.stack[0].handle;
  const failedProviderResponse = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  await accountHandler({}, failedProviderResponse as unknown as ExpressResponse);
  assert.equal(failedProviderResponse.statusCode, 502);
  assert.equal(JSON.stringify(failedProviderResponse.body).includes(PASSWORD), false);
  assert.equal(JSON.stringify(failedProviderResponse.body).includes(SESSION), false);
  delete process.env.MYFXBOOK_EMAIL;
  delete process.env.MYFXBOOK_PASSWORD;
  delete process.env.NOVA_AUTH_SECRET;
});
