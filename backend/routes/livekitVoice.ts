import { randomUUID } from 'node:crypto';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { Router, type Request, type Response } from 'express';

const TOKEN_TTL_SECONDS = 10 * 60;

interface LiveKitConfig {
  serverUrl: string;
  apiKey: string;
  apiSecret: string;
  agentName: string;
}

function readLiveKitConfig(): LiveKitConfig | null {
  if (process.env.LIVEKIT_VOICE_ENABLED !== 'true') return null;
  const serverUrl = (process.env.LIVEKIT_URL || '').trim();
  const apiKey = (process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET || '').trim();
  const agentName = (process.env.LIVEKIT_AGENT_NAME || '').trim();
  if (!serverUrl || !apiKey || !apiSecret || !agentName || agentName.length > 128) return null;
  try {
    const parsed = new URL(serverUrl);
    const secure = parsed.protocol === 'wss:';
    const localDevelopment = process.env.NODE_ENV !== 'production' && parsed.protocol === 'ws:';
    if ((!secure && !localDevelopment) || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  } catch {
    return null;
  }
  return { serverUrl, apiKey, apiSecret, agentName };
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
    try {
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
      // Dispatch the deployed Agent Builder agent when this unique room is first created.
      accessToken.roomConfig = new RoomConfiguration({
        agents: [new RoomAgentDispatch({ agentName: config.agentName })],
        emptyTimeout: 15,
        departureTimeout: 15,
        maxParticipants: 1,
      });
      const participantToken = await accessToken.toJwt();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({
        success: true,
        data: { serverUrl: config.serverUrl, roomName, participantToken },
      });
    } catch {
      console.error('[LiveKit voice] Could not issue a participant token.');
      return res.status(503).json({ success: false, error: 'LiveKit voice could not be started. Check the server configuration.' });
    }
  });

  return router;
}
