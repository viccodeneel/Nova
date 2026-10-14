import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMyfxbookRouter } from '../routes/myfxbook.ts';
import type { SavedMyfxbookAccountSettings, MyfxbookAccountSettingsStore } from '../services/myfxbookAccountSettings.ts';
import { createMyfxbookService, MyfxbookServiceError } from '../services/myfxbookService.ts';

function responseSink() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

function routeHandler(router: ReturnType<typeof createMyfxbookRouter>, path: string, method: string) {
  const route = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (...args: never[]) => unknown }> } }> }).stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  assert.ok(route?.route, `expected ${method.toUpperCase()} ${path}`);
  return route.route.stack[0].handle as unknown as (req: { params: Record<string, string>; body?: unknown }, res: ReturnType<typeof responseSink>) => Promise<unknown>;
}

test('Myfxbook NOVA settings are persisted by verified provider account ID and returned on later account loads', async () => {
  const saved: Record<string, SavedMyfxbookAccountSettings> = {};
  const store: MyfxbookAccountSettingsStore = {
    async getAll() { return { ...saved }; },
    async save(accountId, settings) { saved[accountId] = settings; },
  };
  let providerCalls = 0;
  const provider = {
    isConfigured: () => true,
    async getAccounts() { providerCalls += 1; return { provider: 'Myfxbook' as const, fetchedAt: 'now', timestampSemantics: 'provider local', accounts: [{ id: '321', demo: false }] }; },
  };
  const router = createMyfxbookRouter(provider as unknown as ReturnType<typeof createMyfxbookService>, store);
  const patch = routeHandler(router, '/accounts/:id/settings', 'patch');
  const getAccounts = routeHandler(router, '/accounts', 'get');
  const initialAccounts = responseSink();
  await getAccounts({ params: {} }, initialAccounts);
  assert.equal(providerCalls, 1);
  const validPayload = {
    account_name: 'Nova funded label',
    account_settings: {
      classification: 'PROP_FIRM', starting_balance: 100000,
      prop_firm_name: 'My firm', notes: 'My personal reference',
      challenge: { type: 'TWO_STEP', stage: 'PHASE_2', phase1_target_percent: 6, phase2_target_percent: 5, daily_drawdown_percent: 5, max_drawdown_percent: 10 },
    },
  };
  const response = responseSink();
  await patch({ params: { id: '321' }, body: validPayload }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(providerCalls, 1, 'settings save reuses the server-verified account list instead of logging into Myfxbook again');
  assert.equal(saved['321'].account_name, 'Nova funded label');
  assert.equal((saved['321'].account_settings.challenge as Record<string, unknown>).phase2_target_percent, 5);
  assert.equal((saved['321'].account_settings as Record<string, unknown>).starting_balance, 100000);

  const reload = responseSink();
  await getAccounts({ params: {} }, reload);
  const payload = reload.body as { data: { accounts: Array<Record<string, unknown>> } };
  assert.equal(payload.data.accounts[0].novaDisplayName, 'Nova funded label');
  assert.deepEqual(payload.data.accounts[0].novaSettings, saved['321'].account_settings);
});

test('provider verification and database persistence failures return distinct safe errors', async () => {
  const validPayload = { account_name: 'My account', account_settings: { classification: 'PROP_FIRM', challenge: { type: 'ONE_STEP', stage: 'PHASE_1' } } };
  const failingProvider = {
    isConfigured: () => true,
    async getAccounts() { throw new MyfxbookServiceError('UPSTREAM_FAILURE'); },
  };
  const memoryStore: MyfxbookAccountSettingsStore = { async getAll() { return {}; }, async save() {} };
  const providerRouter = createMyfxbookRouter(failingProvider as unknown as ReturnType<typeof createMyfxbookService>, memoryStore);
  const providerPatch = routeHandler(providerRouter, '/accounts/:id/settings', 'patch');
  const providerResult = responseSink();
  await providerPatch({ params: { id: '321' }, body: validPayload }, providerResult);
  assert.equal(providerResult.statusCode, 502);
  assert.equal((providerResult.body as { error: string }).error, 'Could not verify the selected account with Myfxbook. Refresh the account list and try again.');

  const databaseError = Object.assign(new Error('private database host or connection details'), { code: '42P01' });
  const failingStore: MyfxbookAccountSettingsStore = { async getAll() { throw databaseError; }, async save() {} };
  const provider = { isConfigured: () => true, async getAccounts() { return { provider: 'Myfxbook' as const, fetchedAt: 'now', timestampSemantics: 'provider local', accounts: [{ id: '321', demo: false }] }; } };
  const settingsRouter = createMyfxbookRouter(provider as unknown as ReturnType<typeof createMyfxbookService>, failingStore);
  const settingsPatch = routeHandler(settingsRouter, '/accounts/:id/settings', 'patch');
  const settingsResult = responseSink();
  await settingsPatch({ params: { id: '321' }, body: validPayload }, settingsResult);
  assert.equal(settingsResult.statusCode, 503);
  assert.equal((settingsResult.body as { error: string }).error, 'NOVA could not save these account settings. Check the database migration and try again.');
  assert.doesNotMatch(JSON.stringify(settingsResult.body), /private database host|42P01/);
});

test('Myfxbook account settings reject unknown accounts, invalid challenge combinations, and connection misclassification', async () => {
  const saves: string[] = [];
  const store: MyfxbookAccountSettingsStore = { async getAll() { return {}; }, async save(id) { saves.push(id); } };
  const provider = {
    isConfigured: () => true,
    async getAccounts() { return { provider: 'Myfxbook' as const, fetchedAt: 'now', timestampSemantics: 'provider local', accounts: [{ id: '321', demo: true }] }; },
  };
  const router = createMyfxbookRouter(provider as unknown as ReturnType<typeof createMyfxbookService>, store);
  const patch = routeHandler(router, '/accounts/:id/settings', 'patch');
  const payload = { account_name: 'My demo', account_settings: { classification: 'DEMO', challenge: { type: 'TWO_STEP', stage: 'PHASE_2', phase2_target_percent: 5 } } };
  for (const [id, body, expected] of [
    ['999', payload, 404],
    ['321', { ...payload, account_settings: { ...payload.account_settings, classification: 'LIVE_BROKERAGE' } }, 400],
    ['321', { ...payload, account_settings: { ...payload.account_settings, challenge: { type: 'ONE_STEP', stage: 'PHASE_2' } } }, 400],
  ] as const) {
    const response = responseSink();
    await patch({ params: { id }, body }, response);
    assert.equal(response.statusCode, expected);
    assert.equal(saves.length, 0);
  }
});

test('Myfxbook settings routes remain behind strict NOVA authentication middleware', () => {
  const router = createMyfxbookRouter();
  const uses = (router as unknown as { stack: Array<{ name?: string; handle?: unknown }> }).stack;
  assert.equal(uses[0]?.name, 'requireStrictAuth');
});
