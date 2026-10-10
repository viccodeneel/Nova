import { Router, type Request, type Response } from 'express';
import { RoomServiceClient } from 'livekit-server-sdk';
import { executeAgentTool } from '../ai/agentTools.ts';
import { consumeLiveKitToolRequest, getLiveKitVoiceSession } from '../services/livekitVoiceSessionStore.ts';
import { verifyLiveKitToolCredential, type LiveKitToolClaims } from '../services/livekitToolCredential.ts';

const READ_TOOLS = new Set(['get_account_info', 'get_pnl', 'get_trades', 'get_open_positions']);
const MEMORY_TOOLS = new Set(['remember', 'forget']);
const PERIODS = new Set(['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'all']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseArgs(name: string, raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const args = raw as Record<string, unknown>;
  const keys = Object.keys(args);
  const onlyKeys = (allowed: string[]) => keys.every((key) => allowed.includes(key));
  if (name === 'get_account_info' || name === 'get_open_positions') return keys.length ? null : {};
  if (name === 'get_pnl') {
    if (!onlyKeys(['period', 'date'])) return null;
    if (args.period !== undefined && (typeof args.period !== 'string' || !PERIODS.has(args.period))) return null;
    if (args.date !== undefined && (typeof args.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(args.date) || Number.isNaN(Date.parse(`${args.date}T00:00:00Z`)))) return null;
    return args;
  }
  if (name === 'get_trades') {
    if (!onlyKeys(['period', 'date', 'symbol', 'limit'])) return null;
    if (args.period !== undefined && (typeof args.period !== 'string' || !PERIODS.has(args.period))) return null;
    if (args.date !== undefined && (typeof args.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(args.date) || Number.isNaN(Date.parse(`${args.date}T00:00:00Z`)))) return null;
    if (args.symbol !== undefined && (typeof args.symbol !== 'string' || args.symbol.length > 20)) return null;
    if (args.limit !== undefined && (!Number.isInteger(args.limit) || Number(args.limit) < 1 || Number(args.limit) > 25)) return null;
    return args;
  }
  if (name === 'remember') {
    if (!onlyKeys(['content', 'kind', 'evidence'])) return null;
    if (typeof args.content !== 'string' || args.content.length < 1 || args.content.length > 300) return null;
    if (!['preference', 'goal', 'fact', 'rule', 'project', 'event'].includes(String(args.kind))) return null;
    if (typeof args.evidence !== 'string' || args.evidence.length < 4 || args.evidence.length > 500) return null;
    return args;
  }
  if (name === 'forget') {
    if (!onlyKeys(['description']) || typeof args.description !== 'string' || !args.description.trim() || args.description.length > 300) return null;
    return args;
  }
  return null;
}

function activeRoomConfig(): { host: string; apiKey: string; apiSecret: string } | null {
  if (process.env.LIVEKIT_VOICE_ENABLED !== 'true') return null;
  const url = (process.env.LIVEKIT_URL || '').trim();
  const apiKey = (process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET || '').trim();
  const toolSecret = (process.env.LIVEKIT_TOOL_TOKEN_SECRET || '').trim();
  if (!url || !apiKey || !apiSecret || toolSecret.length < 32) return null;
  try {
    const parsed = new URL(url);
    if (!['wss:', ...(process.env.NODE_ENV === 'production' ? [] : ['ws:'])].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  } catch { return null; }
  return { host: url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), apiKey, apiSecret };
}

async function assertActiveVoiceSession(claims: LiveKitToolClaims): Promise<boolean> {
  const config = activeRoomConfig();
  if (!config) return false;
  const session = await getLiveKitVoiceSession(claims.room);
  if (!session || session.ownerId !== claims.sub || session.participantIdentity !== claims.participant || session.accountId !== claims.accountId || session.expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const participants = await new RoomServiceClient(config.host, config.apiKey, config.apiSecret).listParticipants(claims.room);
  return participants.some((participant) => participant.identity === claims.participant) && participants.some((participant) => participant.kind === 4);
}

export interface LiveKitVoiceToolDependencies {
  isSessionActive?: (claims: LiveKitToolClaims) => Promise<boolean>;
  executeTool?: typeof executeAgentTool;
  consumeRequest?: typeof consumeLiveKitToolRequest;
}

export function createLivekitVoiceToolRouter(dependencies: LiveKitVoiceToolDependencies = {}): Router {
  const router = Router();
  const isSessionActive = dependencies.isSessionActive || assertActiveVoiceSession;
  const executeTool = dependencies.executeTool || executeAgentTool;
  const consumeRequest = dependencies.consumeRequest || consumeLiveKitToolRequest;
  router.post('/', async (req: Request, res: Response) => {
    const bearer = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization!.slice(7).trim() : '';
    const claims = verifyLiveKitToolCredential(bearer, (process.env.LIVEKIT_TOOL_TOKEN_SECRET || '').trim());
    if (!claims) return res.status(401).json({ success: false, error: 'Voice tool authorization failed.' });
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const requestId = typeof req.body?.request_id === 'string' ? req.body.request_id : '';
    const userMessage = typeof req.body?.user_message === 'string' ? req.body.user_message.trim() : '';
    const args = parseArgs(name, req.body?.arguments);
    const permitted = READ_TOOLS.has(name) ? claims.scope.includes('account:read') || claims.scope.includes('trades:read') : MEMORY_TOOLS.has(name) && claims.scope.includes('memory:manage');
    if (!permitted || !args || !UUID.test(requestId) || !userMessage || userMessage.length > 2000) {
      return res.status(400).json({ success: false, error: 'Voice tool name or arguments are not supported.' });
    }
    try {
      if (!await isSessionActive(claims)) return res.status(403).json({ success: false, error: 'Voice session authorization is no longer active.' });
      if (!await consumeRequest(claims.room, requestId)) return res.status(409).json({ success: false, error: 'This voice tool request was already processed.' });
      const result = await Promise.race([
        executeTool(name, args, { accountId: claims.accountId, userMessage }),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(Object.assign(new Error('Tool request timed out.'), { code: 'TOOL_TIMEOUT' })), 10000)),
      ]);
      return res.json({ success: true, data: result });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const status = code === 'TOOL_TIMEOUT' ? 504 : code === 'NO_ACCOUNT' || code === 'ACCOUNT_SELECTION_REQUIRED' ? 409 : 503;
      return res.status(status).json({ success: false, error: code === 'TOOL_TIMEOUT' ? 'The NOVA data service timed out. Please try again.' : (error as Error).message || 'NOVA could not retrieve that data.' });
    }
  });
  return router;
}

export { parseArgs as validateLiveKitToolArguments, assertActiveVoiceSession };
