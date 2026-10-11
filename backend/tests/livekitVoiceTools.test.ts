import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createLivekitVoiceToolRouter, validateLiveKitToolArguments } from '../routes/livekitVoiceTools.ts';
import { signLiveKitToolCredential, verifyLiveKitToolCredential } from '../services/livekitToolCredential.ts';
import { inMemoryStore } from '../services/inMemoryStore.ts';

const SECRET = 'unit-test-livekit-tool-signing-secret-0123456789';
const PARTICIPANT = `nova-owner-${randomUUID()}`;
const ROOM = `nova-${randomUUID()}`;
const ACCOUNT = randomUUID();
let server: Server;
let baseUrl: string;

function makeToken(accountId?: string, expiresAt = Math.floor(Date.now() / 1000) + 300) {
  return signLiveKitToolCredential({ secret: SECRET, room: ROOM, participant: PARTICIPANT, accountId, expiresAt });
}

async function post(body: Record<string, unknown>, token = makeToken()) {
  return fetch(`${baseUrl}/tools`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

before(async () => {
  process.env.LIVEKIT_TOOL_TOKEN_SECRET = SECRET;
  const now = new Date().toISOString();
  await inMemoryStore.updateAccountSync(ACCOUNT, {
    account_number: 80001, broker_name: 'Test Broker', server_name: 'Demo', balance: 1234.56,
    equity: 1230.56, currency: 'USD', leverage: 100, connection_status: 'CONNECTED',
  }, [{ position_ticket: 1, symbol: 'EURUSD', direction: 'BUY', volume: 0.1, open_price: 1.1, current_price: 1.11, current_profit: 1, opened_at: now }], [], [{
    id: randomUUID(), trading_account_id: ACCOUNT, position_id: 11, primary_ticket: 11,
    symbol: 'EURUSD', direction: 'BUY', volume: 0.1, entry_price: 1.1, exit_price: 1.11,
    gross_profit: 25, commission: 0, swap: 0, net_profit: 25, r_multiple: 1,
    outcome: 'WIN', opened_at: now, closed_at: now, is_closed: true,
  }]);
  const app = express();
  app.use(express.json());
  app.use('/tools', createLivekitVoiceToolRouter({ isSessionActive: async () => true }));
  server = await new Promise<Server>((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await inMemoryStore.deleteAccount(ACCOUNT);
  delete process.env.LIVEKIT_TOOL_TOKEN_SECRET;
});

describe('LiveKit delegated credentials', () => {
  test('binds owner, room, participant, selected account, permissions, and expiry', () => {
    const token = makeToken(ACCOUNT);
    const claims = verifyLiveKitToolCredential(token, SECRET);
    assert.equal(claims?.sub, 'nova-owner');
    assert.equal(claims?.room, ROOM);
    assert.equal(claims?.participant, PARTICIPANT);
    assert.equal(claims?.accountId, ACCOUNT);
    assert.ok(claims?.scope.includes('account:read'));
    assert.ok(claims?.scope.includes('memory:read'));
    assert.ok(claims?.scope.includes('memory:manage'));
    assert.ok(claims?.exp && claims.exp - claims.iat <= 600);
  });

  test('rejects expired, tampered, malformed, and cross-owner credentials', () => {
    assert.equal(verifyLiveKitToolCredential(makeToken(undefined, 100), SECRET, 101), null);
    assert.equal(verifyLiveKitToolCredential(`${makeToken()}.tampered`, SECRET), null);
    assert.equal(verifyLiveKitToolCredential('not-a-jwt', SECRET), null);
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: 'nova-livekit-voice', aud: 'nova-livekit-tools', sub: 'other-user', room: ROOM, participant: PARTICIPANT, scope: ['account:read', 'trades:read', 'memory:manage'], iat: 1, exp: 9999999999, jti: randomUUID() })).toString('base64url');
    const unsigned = `${head}.${payload}`;
    const forgedOwner = `${unsigned}.${createHmac('sha256', SECRET).update(unsigned).digest('base64url')}`;
    assert.equal(verifyLiveKitToolCredential(forgedOwner, SECRET), null);
  });
});

describe('LiveKit tool bridge', () => {
  test('validates allowlisted names and strict argument schemas', () => {
    assert.deepEqual(validateLiveKitToolArguments('get_account_info', {}), {});
    assert.deepEqual(validateLiveKitToolArguments('get_trades', { limit: 5, symbol: 'EURUSD' }), { limit: 5, symbol: 'EURUSD' });
    assert.deepEqual(validateLiveKitToolArguments('recall_memories', { query: 'chart timeframe' }), { query: 'chart timeframe' });
    assert.equal(validateLiveKitToolArguments('recall_memories', { query: ' ' }), null);
    assert.equal(validateLiveKitToolArguments('update_memory', { description: 'chart timeframe', content: 'H1', evidence: 'please update memory' })?.description, 'chart timeframe');
    assert.equal(validateLiveKitToolArguments('update_memory', { description: 'chart timeframe', content: 'H1', evidence: 'please update memory', owner_id: 'other' }), null);
    assert.equal(validateLiveKitToolArguments('get_trades', { limit: '5' }), null);
    assert.equal(validateLiveKitToolArguments('get_payouts', {}), null);
    assert.equal(validateLiveKitToolArguments('get_trades', { owner_id: 'other-user' }), null);
  });

  test('returns actual balances and trade history through NOVA service tools', async () => {
    const balance = await post({ name: 'get_account_info', arguments: {}, user_message: 'What is my balance?', request_id: randomUUID() }, makeToken(ACCOUNT));
    assert.equal(balance.status, 200);
    const balanceBody = await balance.json() as { success: boolean; data: { balance: number; currency: string } };
    assert.equal(balanceBody.data.balance, 1234.56);
    assert.equal(balanceBody.data.currency, 'USD');

    const history = await post({ name: 'get_trades', arguments: { period: 'all', limit: 5 }, user_message: 'Show my trades', request_id: randomUUID() }, makeToken(ACCOUNT));
    assert.equal(history.status, 200);
    const historyBody = await history.json() as { success: boolean; data: { trades: Array<{ symbol: string; net_profit: number }> } };
    assert.equal(historyBody.data.trades[0].symbol, 'EURUSD');
    assert.equal(historyBody.data.trades[0].net_profit, 25);
  });

  test('saves, recalls in a later request, updates, and forgets a user-approved memory through the authenticated bridge', async () => {
    const unique = randomUUID();
    const original = `NOVA test ${unique} prefers chart interval H4`;
    const replacement = `NOVA test ${unique} prefers chart interval H1`;
    const unapproved = await post({ name: 'remember', arguments: { content: original, kind: 'preference', evidence: 'I like this' }, user_message: 'I like this chart interval.', request_id: randomUUID() });
    assert.equal(unapproved.status, 403);

    const remember = await post({ name: 'remember', arguments: { content: original, kind: 'preference', evidence: 'remember my chart interval' }, user_message: 'Please remember my chart interval is H4.', request_id: randomUUID() });
    assert.equal(remember.status, 200);
    assert.equal((await remember.json() as { data: { saved: boolean } }).data.saved, true);

    const recall = await post({ name: 'recall_memories', arguments: { query: `chart interval ${unique}` }, user_message: 'What chart interval do I prefer?', request_id: randomUUID() });
    assert.equal(recall.status, 200);
    assert.match(JSON.stringify(await recall.json()), /H4/);

    const update = await post({ name: 'update_memory', arguments: { description: `chart interval ${unique}`, content: replacement, evidence: 'update my saved memory' }, user_message: `Please update my saved memory about chart interval ${unique} to H1.`, request_id: randomUUID() });
    assert.equal(update.status, 200);
    assert.equal((await update.json() as { data: { updated: boolean } }).data.updated, true);
    const recalledUpdated = await post({ name: 'recall_memories', arguments: { query: `chart interval ${unique}` }, user_message: 'What is my chart interval?', request_id: randomUUID() });
    assert.match(JSON.stringify(await recalledUpdated.json()), /H1/);

    const forget = await post({ name: 'forget', arguments: { description: `chart interval ${unique}` }, user_message: `Please forget my chart interval ${unique}.`, request_id: randomUUID() });
    assert.equal(forget.status, 200);
    assert.equal((await forget.json() as { data: { removed: number } }).data.removed, 1);
  });

  test('rejects unsupported tools and bad arguments without executing them', async () => {
    const unsupported = await post({ name: 'get_payouts', arguments: {}, user_message: 'What are my payouts?', request_id: randomUUID() });
    assert.equal(unsupported.status, 400);
    const invalid = await post({ name: 'get_trades', arguments: { limit: 'many' }, user_message: 'Show my trades', request_id: randomUUID() });
    assert.equal(invalid.status, 400);
  });

  test('fails closed when the bound voice session is no longer active', async () => {
    const app = express();
    app.use(express.json());
    app.use('/tools', createLivekitVoiceToolRouter({ isSessionActive: async () => false }));
    const other = await new Promise<Server>((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const port = (other.address() as AddressInfo).port;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/tools`, { method: 'POST', headers: { authorization: `Bearer ${makeToken()}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'get_account_info', arguments: {}, user_message: 'balance', request_id: randomUUID() }) });
      assert.equal(response.status, 403);
    } finally {
      await new Promise<void>((resolve) => other.close(() => resolve()));
    }
  });
});
