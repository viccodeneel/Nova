import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AccessToken, AgentDispatchClient, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';
import { Router, type Request, type Response } from 'express';
import { getLiveKitVoiceSession, saveLiveKitVoiceSession } from '../services/livekitVoiceSessionStore.ts';
import { signLiveKitToolCredential } from '../services/livekitToolCredential.ts';
import { getAccountById } from '../services/accountService.ts';

const TOKEN_TTL_SECONDS = 10 * 60;
const VOICE_SESSION_SECONDS = 60 * 60;

interface LiveKitConfig {
  serverUrl: string;
  apiKey: string;
  apiSecret: string;
  toolTokenSecret: string;
  agentBridgeSecret: string;
  agentName: string;
}

function readLiveKitConfig(): LiveKitConfig | null {
  if (process.env.LIVEKIT_VOICE_ENABLED !== 'true') return null;
  const serverUrl = (process.env.LIVEKIT_URL || '').trim();
  const apiKey = (process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET || '').trim();
  const toolTokenSecret = (process.env.LIVEKIT_TOOL_TOKEN_SECRET || '').trim();
  const agentBridgeSecret = (process.env.LIVEKIT_AGENT_BRIDGE_SECRET || '').trim();
  const agentName = (process.env.LIVEKIT_AGENT_NAME || '').trim();
  if (!serverUrl || !apiKey || !apiSecret || toolTokenSecret.length < 32 || agentBridgeSecret.length < 32 || !agentName || agentName.length > 128) return null;
  try {
    const parsed = new URL(serverUrl);
    const secure = parsed.protocol === 'wss:';
    const localDevelopment = process.env.NODE_ENV !== 'production' && parsed.protocol === 'ws:';
    if ((!secure && !localDevelopment) || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  } catch {
    return null;
  }
  return { serverUrl, apiKey, apiSecret, toolTokenSecret, agentBridgeSecret, agentName };
}


export function liveKitVoiceStatus() {
  const enabled = process.env.LIVEKIT_VOICE_ENABLED === 'true';
  const ready = Boolean(readLiveKitConfig());
  return {
    enabled,
    ready,
    message: !enabled
      ? 'LiveKit voice is disabled on this NOVA service. Browser voice remains available.'
      : ready
        ? 'LiveKit voice is ready to connect.'
        : 'LiveKit voice is enabled but its server configuration is incomplete or invalid.',
  };
}

export function createLivekitVoiceRouter(): Router {
  const router = Router();

  router.get('/status', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: liveKitVoiceStatus() });
  });

  router.post('/token', async (_req: Request, res: Response) => {
    const config = readLiveKitConfig();
    if (!config) {
      return res.status(503).json({ success: false, error: 'LiveKit voice is not configured on this NOVA service.' });
    }

    // The owner identity is fixed by NOVA's current single-owner authentication model.
    // Never accept room names, participant identities, or permissions from the browser.
    const roomName = `nova-${randomUUID()}`;
    const identity = `nova-owner-${randomUUID()}`;
    const expiresAt = Math.floor(Date.now() / 1000) + VOICE_SESSION_SECONDS;
    try {
      const requestedAccountId = typeof _req.body?.accountId === 'string' ? _req.body.accountId : undefined;
      if (requestedAccountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedAccountId)) {
        return res.status(400).json({ success: false, error: 'Selected trading account is invalid.' });
      }
      const selectedAccount = requestedAccountId ? await getAccountById(requestedAccountId) : null;
      if (requestedAccountId && !selectedAccount) return res.status(400).json({ success: false, error: 'Selected trading account is unavailable.' });
      await saveLiveKitVoiceSession({ roomName, participantIdentity: identity, ownerId: 'nova-owner', accountId: selectedAccount?.id, expiresAt });
      const accessToken = new AccessToken(config.apiKey, config.apiSecret, {
        identity,
        name: 'NOVA Dashboard',
        ttl: `${TOKEN_TTL_SECONDS}s`,
      });
      accessToken.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canPublishSources: [TrackSource.MICROPHONE],
        canSubscribe: true,
        canPublishData: false,
      });
      // The room is created with browser+agent capacity. Explicit dispatch happens only
      // after the authenticated browser has joined, so its tool credential never appears
      // in the participant JWT returned to the browser.
      accessToken.roomConfig = new RoomConfiguration({
        emptyTimeout: 15,
        departureTimeout: 15,
        maxParticipants: 2,
      });
      const participantToken = await accessToken.toJwt();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({
        success: true,
        data: { serverUrl: config.serverUrl, roomName, participantIdentity: identity, participantToken },
      });
    } catch {
      console.error('[LiveKit voice] Could not issue a participant token.');
      return res.status(503).json({ success: false, error: 'LiveKit voice could not be started. Check the server configuration.' });
    }
  });

  router.post('/start-agent', async (req: Request, res: Response) => {
    const config = readLiveKitConfig();
    const roomName = typeof req.body?.roomName === 'string' ? req.body.roomName : '';
    const participantIdentity = typeof req.body?.participantIdentity === 'string' ? req.body.participantIdentity : '';
    if (!config || !/^nova-[0-9a-f-]{36}$/i.test(roomName) || !/^nova-owner-[0-9a-f-]{36}$/i.test(participantIdentity)) {
      return res.status(400).json({ success: false, error: 'LiveKit voice session is invalid or not configured.' });
    }
    try {
      const session = await getLiveKitVoiceSession(roomName);
      if (!session || session.participantIdentity !== participantIdentity || session.ownerId !== 'nova-owner' || session.expiresAt <= Math.floor(Date.now() / 1000)) {
        return res.status(403).json({ success: false, error: 'LiveKit voice session is not authorized.' });
      }
      const livekitHost = config.serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
      const rooms = new RoomServiceClient(livekitHost, config.apiKey, config.apiSecret);
      const participants = await rooms.listParticipants(roomName);
      if (!participants.some((participant) => participant.identity === participantIdentity)) {
        return res.status(409).json({ success: false, error: 'Dashboard participant is not connected to this room.' });
      }

      const toolToken = signLiveKitToolCredential({ secret: config.toolTokenSecret, room: session.roomName, participant: session.participantIdentity, accountId: session.accountId, expiresAt: session.expiresAt });
      const dispatch = new AgentDispatchClient(livekitHost, config.apiKey, config.apiSecret);
      const result = await dispatch.createDispatch(roomName, config.agentName, {
        metadata: JSON.stringify({ tool_token: toolToken, room_name: roomName, participant_identity: participantIdentity }),
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(202).json({ success: true, data: { dispatchId: result.id } });
    } catch {
      console.error('[LiveKit voice] Agent dispatch could not be started.');
      return res.status(503).json({ success: false, error: 'The NOVA voice agent could not be started for this session.' });
    }
  });

  router.post('/agent/credentials', async (req: Request, res: Response) => {
    const config = readLiveKitConfig();
    const supplied = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization!.slice(7).trim() : '';
    const expected = Buffer.from(config?.agentBridgeSecret || 'disabled');
    const actual = Buffer.from(supplied);
    const expectedDigest = createHmac('sha256', expected).update('bridge-auth').digest();
    const actualDigest = createHmac('sha256', actual).update('bridge-auth').digest();
    const authorized = expected.length >= 32 && expected.length === actual.length && timingSafeEqual(expectedDigest, actualDigest);
    const roomName = typeof req.body?.roomName === 'string' ? req.body.roomName : '';
    const agentIdentity = typeof req.body?.agentIdentity === 'string' ? req.body.agentIdentity : '';
    if (!config || !authorized || !/^nova-[0-9a-f-]{36}$/i.test(roomName) || agentIdentity.length > 128) {
      return res.status(401).json({ success: false, error: 'Voice agent authorization failed.' });
    }
    try {
      const session = await getLiveKitVoiceSession(roomName);
      if (!session || session.expiresAt <= Math.floor(Date.now() / 1000)) return res.status(403).json({ success: false, error: 'Voice session is no longer active.' });
      const livekitHost = config.serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
      const rooms = new RoomServiceClient(livekitHost, config.apiKey, config.apiSecret);
      const participants = await rooms.listParticipants(roomName);
      const liveParticipant = participants.find((participant) => participant.identity === session.participantIdentity);
      const liveAgent = participants.find((participant) => participant.identity === agentIdentity && participant.kind === 4);
      if (!liveParticipant || !liveAgent) return res.status(403).json({ success: false, error: 'The authenticated dashboard participant and NOVA agent must be active.' });
      const token = signLiveKitToolCredential({ secret: config.toolTokenSecret, room: roomName, participant: session.participantIdentity, accountId: session.accountId, expiresAt: session.expiresAt });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, data: { toolToken: token, roomName, participantIdentity: session.participantIdentity } });
    } catch {
      return res.status(503).json({ success: false, error: 'Voice session authorization is temporarily unavailable.' });
    }
  });

  return router;
}
