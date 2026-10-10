import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import authRouter, { requireStrictAuth } from '../routes/auth.ts';
import { createLivekitVoiceRouter } from '../routes/livekitVoice.ts';
import { transitionLiveKitVoice } from '../../src/voice/livekitState.ts';

const ENV_KEYS = ['NOVA_AUTH_SECRET', 'NOVA_AUTH_PASSWORD', 'LIVEKIT_VOICE_ENABLED', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_AGENT_NAME'] as const;
const oldEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
let server: Server;
let baseUrl: string;

async function request(path: string, options: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function login(): Promise<string> {
  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: process.env.NOVA_AUTH_PASSWORD }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { token: string };
  return payload.token;
}

async function getStatus(token: string) {
  return request('/api/livekit/voice/status', { headers: { authorization: `Bearer ${token}` } });
}

before(async () => {
  process.env.NOVA_AUTH_SECRET = 'test-dashboard-signing-secret-0123456789';
  process.env.NOVA_AUTH_PASSWORD = 'test-dashboard-password-123';
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/livekit/voice', requireStrictAuth, createLivekitVoiceRouter());
  server = await new Promise<Server>((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const [key, value] of oldEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  delete process.env.LIVEKIT_VOICE_ENABLED;
  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
  delete process.env.LIVEKIT_AGENT_NAME;
});

describe('LiveKit voice token route', () => {
  test('always requires a valid NOVA dashboard session, even when the feature is disabled', async () => {
    const response = await request('/api/livekit/voice/token', { method: 'POST', body: '{}' });
    assert.equal(response.status, 401);
  });

  test('reports disabled and incomplete configuration without exposing credentials', async () => {
    const token = await login();
    const response = await getStatus(token);
    assert.equal(response.status, 200);
    const body = await response.json() as { data: { enabled: boolean; ready: boolean; message: string } };
    assert.equal(body.data.enabled, false);
    assert.equal(body.data.ready, false);
    assert.match(body.data.message, /disabled/);

    process.env.LIVEKIT_VOICE_ENABLED = 'true';
    const incomplete = await getStatus(token);
    const incompleteBody = await incomplete.json() as { data: { ready: boolean; message: string } };
    assert.equal(incompleteBody.data.ready, false);
    assert.match(incompleteBody.data.message, /incomplete/);
    assert.equal(JSON.stringify(incompleteBody).includes(process.env.NOVA_AUTH_SECRET!), false);
  });

  test('issues a short-lived microphone-only token and dispatches only the configured agent', async () => {
    const dashboardToken = await login();
    process.env.LIVEKIT_VOICE_ENABLED = 'true';
    process.env.LIVEKIT_URL = 'wss://voice.example.test';
    process.env.LIVEKIT_API_KEY = 'unit-test-api-key';
    process.env.LIVEKIT_API_SECRET = 'unit-test-api-secret';
    process.env.LIVEKIT_AGENT_NAME = 'nova-builder-agent';

    const response = await request('/api/livekit/voice/token', {
      method: 'POST',
      headers: { authorization: `Bearer ${dashboardToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ roomName: 'attacker-room', ownerId: 'another-user', permissions: ['roomAdmin'] }),
    });
    assert.equal(response.status, 201);
    const body = await response.json() as { data: { serverUrl: string; roomName: string; participantToken: string } };
    assert.equal(body.data.serverUrl, 'wss://voice.example.test');
    assert.match(body.data.roomName, /^nova-[0-9a-f-]{36}$/);

    const claims = JSON.parse(Buffer.from(body.data.participantToken.split('.')[1], 'base64url').toString('utf8')) as {
      sub: string; nbf: number; exp: number; video: Record<string, unknown>;
    };
    assert.match(claims.sub, /^nova-owner-[0-9a-f-]{36}$/);
    assert.ok(claims.exp > claims.nbf && claims.exp - claims.nbf <= 600);
    assert.equal(claims.video.room, body.data.roomName);
    assert.equal(claims.video.roomJoin, true);
    assert.equal(claims.video.canPublish, true);
    assert.equal(claims.video.canSubscribe, true);
    assert.equal(claims.video.canPublishData, false);
    assert.equal(claims.video.canPublishSources instanceof Array, true);
    assert.ok(JSON.stringify(claims).includes('microphone'));
    assert.ok(JSON.stringify(claims).includes('nova-builder-agent'));
  });

  test('does not issue credentials when the feature is enabled with an invalid URL', async () => {
    const token = await login();
    process.env.LIVEKIT_VOICE_ENABLED = 'true';
    process.env.LIVEKIT_URL = 'https://voice.example.test';
    process.env.LIVEKIT_API_KEY = 'unit-test-api-key';
    process.env.LIVEKIT_API_SECRET = 'unit-test-api-secret';
    process.env.LIVEKIT_AGENT_NAME = 'nova-builder-agent';
    const response = await request('/api/livekit/voice/token', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' });
    assert.equal(response.status, 503);
  });
});

describe('LiveKit voice state transitions', () => {
  test('moves from idle through connection, listening, speaking, listening, and disconnect', () => {
    let state = transitionLiveKitVoice('checking', 'READY');
    assert.equal(state, 'idle');
    state = transitionLiveKitVoice(state, 'CONNECT');
    assert.equal(state, 'connecting');
    state = transitionLiveKitVoice(state, 'CONNECTED');
    assert.equal(state, 'listening');
    state = transitionLiveKitVoice(state, 'SPEAKING');
    assert.equal(state, 'speaking');
    state = transitionLiveKitVoice(state, 'LISTENING');
    assert.equal(state, 'listening');
    state = transitionLiveKitVoice(state, 'DISCONNECT');
    assert.equal(state, 'idle');
  });

  test('does not start duplicate connections and lets a failed connection retry', () => {
    assert.equal(transitionLiveKitVoice('connecting', 'CONNECT'), 'connecting');
    assert.equal(transitionLiveKitVoice('listening', 'CONNECT'), 'listening');
    assert.equal(transitionLiveKitVoice('idle', 'FAILED'), 'error');
    assert.equal(transitionLiveKitVoice('error', 'CONNECT'), 'connecting');
  });
});
