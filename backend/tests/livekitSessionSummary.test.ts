import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';

import { createLivekitRouter } from '../routes/livekit.ts';
import {
  createMemorySummaryStore,
  validateSessionSummary,
  LIMITS,
  type SessionSummaryStore,
} from '../services/livekitSummaryService.ts';

const TOKEN = 'test-livekit-token-0123456789abcdef0123456789abcdef';
const BRIDGE_SECRET = 'a-different-mt5-bridge-secret-0123456789abcdef';

const validBody = () => ({
  job_id: 'AJ_qsV4cAeZCDPF',
  room_id: 'RM_abc123',
  room: 'nova-voice-room',
  started_at: '2026-10-10T12:00:00Z',
  ended_at: '2026-10-10T12:05:30.123Z',
  summary: 'The trader reviewed risk limits for the day.',
  results: { risk_note: { text: 'stay under 1%', confirmed: true }, symbols: [{ name: 'EURUSD' }] },
});

let server: Server;
let baseUrl: string;
let store: ReturnType<typeof createMemorySummaryStore>;
let activeStore: SessionSummaryStore;
let tokenInEnv: string | undefined;

async function post(body: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }, raw = false) {
  return fetch(`${baseUrl}/api/livekit/session-summary`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

before(async () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // The store is swappable per test via `activeStore`.
  app.use('/api/livekit', createLivekitRouter({
    store: { save: (s) => activeStore.save(s) },
    getToken: () => tokenInEnv,
  }));
  server = await new Promise<Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => { await new Promise((r) => server.close(r)); });

beforeEach(() => {
  store = createMemorySummaryStore();
  activeStore = store;
  tokenInEnv = TOKEN;
});

describe('authentication', () => {
  test('503 and nothing stored when LIVEKIT_SUMMARY_TOKEN is not configured', async () => {
    tokenInEnv = undefined;
    const res = await post(validBody());
    assert.equal(res.status, 503);
    assert.equal(store.size(), 0);
  });

  test('503 when the configured token is too short to be safe', async () => {
    tokenInEnv = 'short';
    const res = await post(validBody(), { authorization: 'Bearer short' });
    assert.equal(res.status, 503);
    assert.equal(store.size(), 0);
  });

  test('401 with no Authorization header', async () => {
    const res = await post(validBody(), {});
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer');
    assert.equal(store.size(), 0);
  });

  test('401 for a wrong token, wrong scheme, and empty bearer', async () => {
    for (const authorization of ['Bearer wrong-token', `Basic ${TOKEN}`, `Token ${TOKEN}`, 'Bearer ', TOKEN]) {
      const res = await post(validBody(), { authorization });
      assert.equal(res.status, 401, `expected 401 for "${authorization.slice(0, 12)}"`);
    }
    assert.equal(store.size(), 0);
  });

  test('MT5_BRIDGE_SECRET and the X-MT5-Bridge-Key header are not accepted', async () => {
    const previous = process.env.MT5_BRIDGE_SECRET;
    process.env.MT5_BRIDGE_SECRET = BRIDGE_SECRET;
    try {
      assert.equal((await post(validBody(), { authorization: `Bearer ${BRIDGE_SECRET}` })).status, 401);
      assert.equal((await post(validBody(), { 'x-mt5-bridge-key': BRIDGE_SECRET })).status, 401);
    } finally {
      if (previous === undefined) delete process.env.MT5_BRIDGE_SECRET; else process.env.MT5_BRIDGE_SECRET = previous;
    }
    assert.equal(store.size(), 0);
  });

  test('responses never contain the token', async () => {
    const res = await post(validBody(), { authorization: 'Bearer nope' });
    assert.ok(!(await res.text()).includes(TOKEN));
  });
});

describe('storing summaries', () => {
  test('201 on first delivery and the payload is stored', async () => {
    const res = await post(validBody());
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { success: true, job_id: 'AJ_qsV4cAeZCDPF', duplicate: false });
    const saved = store.get('AJ_qsV4cAeZCDPF');
    assert.equal(saved?.room, 'nova-voice-room');
    assert.equal(saved?.started_at, '2026-10-10T12:00:00.000Z');
    assert.deepEqual(saved?.results, validBody().results);
  });

  test('idempotent: a retried job_id returns 200 duplicate and does not overwrite', async () => {
    assert.equal((await post(validBody())).status, 201);
    const retry = await post({ ...validBody(), summary: 'DIFFERENT TEXT' });
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), { success: true, job_id: 'AJ_qsV4cAeZCDPF', duplicate: true });
    assert.equal(store.size(), 1);
    assert.equal(store.get('AJ_qsV4cAeZCDPF')?.summary, validBody().summary);
  });

  test('accepts the minimal payload (job_id only) and summary-only / results-only payloads', async () => {
    assert.equal((await post({ job_id: 'AJ_min' })).status, 201);
    assert.equal((await post({ job_id: 'AJ_sum', summary: 'hi' })).status, 201);
    assert.equal((await post({ job_id: 'AJ_res', results: { a: { b: 1 } } })).status, 201);
    assert.equal(store.size(), 3);
  });

  test('ignores unknown top-level fields instead of storing them', async () => {
    await post({ ...validBody(), job_id: 'AJ_extra', admin: true, __proto__: { polluted: true } });
    const saved = store.get('AJ_extra') as unknown as Record<string, unknown>;
    assert.equal(saved.admin, undefined);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });

  test('500 with a generic message when the store fails, without leaking details', async () => {
    activeStore = { save: async () => { throw new Error('connection to db.secret-host:5432 refused'); } };
    const res = await post(validBody());
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.ok(!text.includes('secret-host'));
  });
});

describe('validation (400)', () => {
  test('rejects a missing, empty, non-string, oversized or malformed job_id', async () => {
    const { job_id: _omit, ...withoutJobId } = validBody();
    for (const body of [
      withoutJobId,
      { ...validBody(), job_id: '' },
      { ...validBody(), job_id: 123 },
      { ...validBody(), job_id: 'x'.repeat(LIMITS.JOB_ID_MAX + 1) },
      { ...validBody(), job_id: "AJ_1'; DROP TABLE trades;--" },
      { ...validBody(), job_id: '../../etc/passwd' },
    ]) {
      assert.equal((await post(body)).status, 400);
    }
    assert.equal(store.size(), 0);
  });

  test('rejects bad field types and invalid timestamps', async () => {
    for (const patch of [
      { room: 5 }, { room_id: {} }, { summary: ['a'] }, { results: 'text' }, { results: [1, 2] },
      { started_at: 'yesterday' }, { ended_at: 12345 },
    ]) {
      assert.equal((await post({ ...validBody(), ...patch })).status, 400, JSON.stringify(patch));
    }
    assert.equal(store.size(), 0);
  });

  test('rejects oversized summary and results', async () => {
    assert.equal((await post({ ...validBody(), summary: 'a'.repeat(LIMITS.SUMMARY_MAX_CHARS + 1) })).status, 400);
    assert.equal((await post({ ...validBody(), results: { blob: 'a'.repeat(LIMITS.RESULTS_MAX_BYTES) } })).status, 400);
    assert.equal(store.size(), 0);
  });

  test('rejects non-object bodies and does not echo submitted values in errors', async () => {
    const res = await post([{ job_id: 'AJ_x' }]);
    assert.equal(res.status, 400);
    const secretish = await post({ ...validBody(), room: 'SENSITIVE-VALUE'.repeat(100) });
    assert.equal(secretish.status, 400);
    assert.ok(!(await secretish.text()).includes('SENSITIVE-VALUE'));
  });

  test('validateSessionSummary normalizes absent optionals to null', () => {
    const r = validateSessionSummary({ job_id: 'AJ_1' });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.value, { job_id: 'AJ_1', room_id: null, room: null, started_at: null, ended_at: null, summary: null, results: null });
  });
});

describe('scope guardrails', () => {
  // Strip comments so documentation mentioning these names doesn't trip the scan; only executable code counts.
  const read = (rel: string) => fs.readFileSync(path.resolve(import.meta.dirname, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const files = ['../routes/livekit.ts', '../services/livekitSummaryService.ts', '../services/livekitSummaryStore.ts'];

  test('summary ingestion never touches NOVA AI memory', () => {
    for (const f of files) {
      const src = read(f);
      assert.ok(!/ai\/memory|nova_memories|addMemory/.test(src), `${f} must not reference AI memory`);
    }
  });

  test('summary ingestion does not reference MT5_BRIDGE_SECRET', () => {
    for (const f of files) assert.ok(!read(f).includes('MT5_BRIDGE_SECRET'), `${f} must not use the MT5 bridge secret`);
  });

  test('the route is mounted outside requireAuth in server.ts and under its own path', () => {
    const server = fs.readFileSync(path.resolve(import.meta.dirname, '../../server.ts'), 'utf8');
    const line = server.split('\n').find((l) => l.includes("'/api/livekit'"));
    assert.ok(line, 'expected /api/livekit to be mounted');
    assert.ok(!line.includes('requireAuth'));
  });
});
