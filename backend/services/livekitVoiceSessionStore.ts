import { isDatabaseConnected, query } from '../../database/db.ts';

export interface LiveKitVoiceSession {
  roomName: string;
  participantIdentity: string;
  ownerId: 'nova-owner';
  accountId?: string;
  expiresAt: number;
}

const localSessions = new Map<string, LiveKitVoiceSession>();
const localCalls = new Set<string>();

function requireStore(): void {
  if (process.env.NODE_ENV === 'production' && !isDatabaseConnected()) {
    throw new Error('Voice session storage is unavailable.');
  }
}

export async function saveLiveKitVoiceSession(session: LiveKitVoiceSession): Promise<void> {
  requireStore();
  if (isDatabaseConnected()) {
    const result = await query(
      `INSERT INTO livekit_voice_sessions (room_name, participant_identity, owner_id, account_id, expires_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5)) RETURNING room_name`,
      [session.roomName, session.participantIdentity, session.ownerId, session.accountId || null, session.expiresAt],
    );
    if (!result?.rows.length) throw new Error('Voice session could not be saved.');
    return;
  }
  localSessions.set(session.roomName, session);
}

export async function getLiveKitVoiceSession(roomName: string): Promise<LiveKitVoiceSession | null> {
  requireStore();
  if (isDatabaseConnected()) {
    const result = await query<{ room_name: string; participant_identity: string; owner_id: string; account_id: string | null; expires_at: Date | string }>(
      `SELECT room_name, participant_identity, owner_id, account_id, expires_at
       FROM livekit_voice_sessions WHERE room_name = $1 AND revoked_at IS NULL`,
      [roomName],
    );
    const row = result?.rows[0];
    if (!row || row.owner_id !== 'nova-owner') return null;
    return {
      roomName: row.room_name,
      participantIdentity: row.participant_identity,
      ownerId: 'nova-owner',
      ...(row.account_id ? { accountId: row.account_id } : {}),
      expiresAt: Math.floor(new Date(row.expires_at).getTime() / 1000),
    };
  }
  const session = localSessions.get(roomName);
  return session && session.expiresAt > Math.floor(Date.now() / 1000) ? session : null;
}

/** Records a one-time tool request ID so captured bridge requests cannot be replayed. */
export async function consumeLiveKitToolRequest(roomName: string, requestId: string): Promise<boolean> {
  requireStore();
  if (isDatabaseConnected()) {
    await query(`DELETE FROM livekit_voice_tool_requests WHERE created_at < NOW() - INTERVAL '2 days'`);
    const result = await query(
      `INSERT INTO livekit_voice_tool_requests (room_name, request_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING request_id`,
      [roomName, requestId],
    );
    return Boolean(result?.rows.length);
  }
  const key = `${roomName}:${requestId}`;
  if (localCalls.has(key)) return false;
  localCalls.add(key);
  return true;
}

export async function revokeLiveKitVoiceSession(roomName: string): Promise<void> {
  if (isDatabaseConnected()) {
    await query('UPDATE livekit_voice_sessions SET revoked_at = NOW() WHERE room_name = $1', [roomName]);
  }
  localSessions.delete(roomName);
}
