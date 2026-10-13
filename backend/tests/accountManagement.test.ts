import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import accountsRouter from '../routes/accounts.ts';
import { archiveAccount, getAccountById, updateAccountSettings } from '../services/accountService.ts';
import { inMemoryStore } from '../services/inMemoryStore.ts';
import { processMT5SyncPayload } from '../services/mt5SyncService.ts';
import type { LogicalTrade, TradingAccountRecord } from '../types.ts';

const accounts: TradingAccountRecord[] = [];

function makeAccount(mode: 'REAL' | 'DEMO' | 'CONTEST' = 'REAL'): TradingAccountRecord {
  const id = randomUUID();
  const account: TradingAccountRecord = {
    id, owner_id: 'nova-owner', account_name: 'Test MT5 Account', account_number: Math.floor(Math.random() * 1_000_000_000),
    broker_name: 'Test Broker', server_name: 'Test Server', account_type: 'evaluation', connection_mode: mode,
    account_settings: {}, currency: 'USD', leverage: 100, starting_balance: 10000, current_balance: 10000,
    current_equity: 10000, credit: 0, margin: 0, free_margin: 10000, margin_level: 0,
    connection_status: 'CONNECTED', mt5_data_verified: true, bridge_protocol: 'PYTHON_CONNECTOR', is_active: true,
  };
  accounts.push(account);
  return account;
}

async function patch(id: string, payload: unknown) {
  const patchRoute = (accountsRouter as any).stack.find((layer: any) => layer.route?.path === '/:id' && layer.route.methods.patch);
  if (!patchRoute) throw new Error('Account update route is not registered.');
  const response = { statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  await patchRoute.route.stack[0].handle({ params: { id }, body: payload } as any, response as any);
  return { status: response.statusCode, json: async () => response.body };
}

after(async () => {
  for (const account of accounts) await archiveAccount(account.id);
});

test('account settings validate and persist through the existing account route', async () => {
  const account = makeAccount();
  await inMemoryStore.createAccount(account);
  const payload = {
    account_name: 'My Funded Account',
    account_settings: {
      classification: 'PROP_FIRM', notes: 'Personal label', prop_firm_name: 'Example Firm',
      challenge: { type: 'TWO_STEP', stage: 'PHASE_2', fee: 199, size: 50000, phase1_target_percent: 6, phase2_target_percent: 5, daily_drawdown_percent: 5, max_drawdown_percent: 10, minimum_trading_days: 5 },
    },
  };
  const response = await patch(account.id, payload);
  assert.equal(response.status, 200);
  const saved = await response.json() as { data: TradingAccountRecord };
  assert.equal(saved.data.account_name, payload.account_name);
  assert.equal(saved.data.account_settings?.classification, 'PROP_FIRM');
  assert.equal(saved.data.account_settings?.challenge?.phase2_target_percent, 5);
  const reloaded = await getAccountById(account.id);
  assert.equal(reloaded?.account_settings?.prop_firm_name, 'Example Firm');
  assert.equal(reloaded?.current_balance, account.current_balance);
  assert.equal(reloaded?.starting_balance, account.starting_balance);
});

test('existing verified MT5 connect flow creates an owned account and captures its real/demo mode', async () => {
  const id = randomUUID();
  const result = await processMT5SyncPayload(id, {
    account: { account_number: Math.floor(Math.random() * 1_000_000_000), broker_name: 'MT5 Broker', server_name: 'MT5 Live', balance: 24000, equity: 24000, currency: 'USD', data_mode: 'MT5', connection_status: 'CONNECTED', account_mode: 'REAL' },
    positions: [], deals: [],
  }, { allowCreate: true });
  assert.equal(result.success, true);
  const created = await getAccountById(id);
  assert.equal(created?.owner_id, 'nova-owner');
  assert.equal(created?.connection_mode, 'REAL');
  assert.equal(created?.mt5_data_verified, true);
  accounts.push(created!);
});

test('one-step and instant-funded configurations validate compatible stages', async () => {
  const account = makeAccount();
  await inMemoryStore.createAccount(account);
  const oneStep = await patch(account.id, { account_name: account.account_name, account_settings: { classification: 'PROP_FIRM', challenge: { type: 'ONE_STEP', stage: 'PHASE_1', phase1_target_percent: 10 } } });
  assert.equal(oneStep.status, 200);
  const instant = await patch(account.id, { account_name: account.account_name, account_settings: { classification: 'PROP_FIRM', challenge: { type: 'INSTANT_FUNDING', stage: 'INSTANT_FUNDED', daily_drawdown_percent: 3, max_drawdown_percent: 6 } } });
  assert.equal(instant.status, 200);
});

test('account classifications follow the MT5 confirmed connection mode', async () => {
  const demo = makeAccount('DEMO');
  await inMemoryStore.createAccount(demo);
  const selectedDemo = await patch(demo.id, { account_name: demo.account_name, account_settings: { classification: 'DEMO' } });
  assert.equal(selectedDemo.status, 200);
  const asLive = await patch(demo.id, { account_name: demo.account_name, account_settings: { classification: 'LIVE_BROKERAGE' } });
  assert.equal(asLive.status, 400);
  const unknownClassification = await patch(demo.id, { account_name: demo.account_name, account_settings: { classification: 'OTHER' } });
  assert.equal(unknownClassification.status, 400);
});

test('challenge percentage limits, incompatible phases, and unapproved fields are rejected safely', async () => {
  const account = makeAccount();
  await inMemoryStore.createAccount(account);
  const outsideRange = await patch(account.id, { account_name: account.account_name, account_settings: { classification: 'PROP_FIRM', challenge: { type: 'ONE_STEP', phase1_target_percent: 101 } } });
  assert.equal(outsideRange.status, 400);
  const impossibleStage = await patch(account.id, { account_name: account.account_name, account_settings: { classification: 'PROP_FIRM', challenge: { type: 'ONE_STEP', stage: 'PHASE_2' } } });
  assert.equal(impossibleStage.status, 400);
  const missingPhaseTwo = await patch(account.id, { account_name: account.account_name, account_settings: { classification: 'PROP_FIRM', challenge: { type: 'TWO_STEP', phase1_target_percent: 6 } } });
  assert.equal(missingPhaseTwo.status, 400);
  const invalidAmount = await patch(account.id, { account_name: account.account_name, account_settings: { classification: 'PROP_FIRM', challenge: { type: 'ONE_STEP', fee: -1 } } });
  assert.equal(invalidAmount.status, 400);
});

test('cross-owner account updates are denied and archive removal preserves attached trade history', async () => {
  const account = makeAccount();
  await inMemoryStore.createAccount(account);
  const forbidden = await updateAccountSettings(account.id, 'another-owner', { account_name: 'Intrusion', account_settings: {} });
  assert.equal(forbidden, null);
  assert.equal(await getAccountById(account.id, 'another-owner'), null);

  const trade: LogicalTrade = {
    id: randomUUID(), trading_account_id: account.id, position_id: 11, primary_ticket: 12, symbol: 'EURUSD', direction: 'BUY', volume: 0.1,
    entry_price: 1.1, gross_profit: 10, commission: 0, swap: 0, net_profit: 10, r_multiple: 1, outcome: 'WIN', opened_at: new Date().toISOString(), is_closed: true,
  };
  inMemoryStore.updateAccountSync(account.id, { account_number: account.account_number, broker_name: account.broker_name, server_name: account.server_name, balance: 10010, equity: 10010, data_mode: 'MT5', connection_status: 'CONNECTED' }, [], [], [trade]);
  assert.equal(await archiveAccount(account.id), true);
  assert.equal(await getAccountById(account.id), null);
  assert.equal((await inMemoryStore.getTrades(account.id)).length, 1);
});
