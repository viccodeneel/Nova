import test from 'node:test';
import assert from 'node:assert/strict';
import { getMyfxbookLoadState, mapMyfxbookAccountToDashboard, mapMyfxbookActivityToTrades, MyfxbookRequestError, parseMyfxbookAccountsResponse, resolveActiveAccount, tradesForAccount } from './myfxbookAccounts.ts';

const response = {
  success: true,
  data: {
    provider: 'Myfxbook',
    fetchedAt: '2026-10-14T12:00:00.000Z',
    timestampSemantics: 'Provider timestamps are preserved.',
    accounts: [{
      id: 42,
      mtAccountNumber: '123456',
      name: 'Primary',
      server: 'Broker-Server',
      currency: 'USD',
      demo: false,
      balance: 1050.25,
      equity: 1064.5,
      profit: 14.25,
      gain: 1.4,
      lastUpdateDate: '14.10.2026 12:00',
      sourceUpdatedAt: '14.10.2026 12:00',
    }],
  },
};

test('maps the deployed Myfxbook response without changing timestamp meaning', () => {
  const mapped = parseMyfxbookAccountsResponse(response);
  assert.equal(mapped.provider, 'Myfxbook');
  assert.equal(mapped.fetchedAt, '2026-10-14T12:00:00.000Z');
  assert.equal(mapped.accounts[0].id, '42');
  assert.equal(mapped.accounts[0].name, 'Primary');
  assert.equal(mapped.accounts[0].currency, 'USD');
  assert.equal(mapped.accounts[0].balance, 1050.25);
  assert.equal(mapped.accounts[0].equity, 1064.5);
  assert.equal(mapped.accounts[0].demo, false);
  assert.equal(mapped.accounts[0].sourceUpdatedAt, '14.10.2026 12:00');
});

test('leaves missing values unavailable instead of filling them with fabricated defaults', () => {
  const mapped = parseMyfxbookAccountsResponse({ success: true, data: { provider: 'Myfxbook', fetchedAt: '2026-10-14T12:00:00Z', accounts: [{ id: 'account-2' }] } });
  assert.equal(mapped.accounts[0].balance, undefined);
  assert.equal(mapped.accounts[0].equity, undefined);
  assert.equal(mapped.accounts[0].currency, undefined);
});

test('rejects malformed envelopes and account records', () => {
  assert.throws(() => parseMyfxbookAccountsResponse({ success: true, data: { provider: 'Other', accounts: [] } }), /unreadable response/);
  assert.throws(() => parseMyfxbookAccountsResponse({ success: true, data: { provider: 'Myfxbook', fetchedAt: 'now', accounts: [{}] } }), /unreadable account record/);
});

test('reports loading, authentication, provider, empty, and ready UI states', () => {
  const data = parseMyfxbookAccountsResponse(response);
  assert.equal(getMyfxbookLoadState({ loading: true, error: null, data: null }), 'loading');
  assert.equal(getMyfxbookLoadState({ loading: false, error: new MyfxbookRequestError('Sign in', 401), data: null }), 'authentication-error');
  assert.equal(getMyfxbookLoadState({ loading: false, error: new MyfxbookRequestError('Unavailable', 503), data: null }), 'provider-error');
  assert.equal(getMyfxbookLoadState({ loading: false, error: null, data: { ...data, accounts: [] } }), 'empty');
  assert.equal(getMyfxbookLoadState({ loading: false, error: null, data }), 'ready');
});

test('selects Myfxbook accounts by namespaced provider ID and filters activity to that account', () => {
  const first = mapMyfxbookAccountToDashboard(parseMyfxbookAccountsResponse(response).accounts[0]);
  const second = mapMyfxbookAccountToDashboard({ ...parseMyfxbookAccountsResponse(response).accounts[0], id: '43', name: first.name });
  assert.equal(resolveActiveAccount([first, second], second.id)?.id, 'myfxbook:43');
  assert.equal(resolveActiveAccount([first, second], 'unknown')?.id, first.id);
  const providerActivity = { provider: 'Myfxbook' as const, accountId: '42', fetchedAt: '2026-10-14T12:00:00.000Z', history: [{ openTime: '14.10.2026 10:00', closeTime: '14.10.2026 11:00', symbol: 'EURUSD', direction: 'Buy', size: 0.2, entryPrice: 1.1, exitPrice: 1.2, profit: 20 }], openTrades: [{ openTime: '14.10.2026 12:00', symbol: 'GBPUSD', direction: 'Sell', size: 0.1, floatingProfit: -2 }] };
  const mapped = mapMyfxbookActivityToTrades(first, providerActivity);
  assert.equal(mapped[0].accountId, first.id);
  assert.equal(mapped[0].entry, '1.1');
  assert.equal(mapped[0].exit, '1.2');
  assert.equal(mapped[0].pnlValue, 20);
  assert.equal(mapped[0].rValueAvailable, false);
  assert.equal(mapped[0].quality, 'Not recorded');
  assert.equal(mapped[1].tradeStatus, 'OPEN');
  assert.equal(mapped[1].outcome, 'OPEN');
  assert.deepEqual(tradesForAccount(mapped, second.id), []);
  assert.deepEqual(tradesForAccount(mapped, first.id), mapped);
  assert.deepEqual(mapMyfxbookActivityToTrades(first, providerActivity).map((trade) => trade.id), mapped.map((trade) => trade.id));
});

test('does not treat missing provider values as zero-valued realized performance', () => {
  const account = mapMyfxbookAccountToDashboard({ id: '44', provider: 'Myfxbook' });
  const mapped = mapMyfxbookActivityToTrades(account, { provider: 'Myfxbook', accountId: '44', fetchedAt: '2026-10-14T12:00:00.000Z', history: [{ symbol: 'XAUUSD' }], openTrades: [] });
  assert.equal(account.balanceAvailable, false);
  assert.equal(account.equityAvailable, false);
  assert.equal(mapped[0].outcome, 'UNKNOWN');
  assert.equal(mapped[0].pnlAvailable, false);
  assert.equal(mapped[0].entry, '');
  assert.equal(mapped[0].rValueAvailable, false);
  assert.equal(mapped[0].netPnl, 'Unavailable');
});
