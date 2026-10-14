import test from 'node:test';
import assert from 'node:assert/strict';
import { getMyfxbookLoadState, MyfxbookRequestError, parseMyfxbookAccountsResponse } from './myfxbookAccounts.ts';

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
