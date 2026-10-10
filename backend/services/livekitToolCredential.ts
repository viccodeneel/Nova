import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const ISSUER = 'nova-livekit-voice';
const AUDIENCE = 'nova-livekit-tools';
const SCOPES = ['account:read', 'trades:read', 'memory:manage'] as const;
const MAX_TTL_SECONDS = 10 * 60;

export interface LiveKitToolClaims {
  iss: typeof ISSUER;
  aud: typeof AUDIENCE;
  sub: 'nova-owner';
  room: string;
  participant: string;
  accountId?: string;
  scope: readonly string[];
  iat: number;
  exp: number;
  jti: string;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signLiveKitToolCredential(input: { secret: string; room: string; participant: string; accountId?: string; expiresAt: number; now?: number }): string {
  if (input.secret.length < 32) throw new Error('LiveKit tool signing is not configured.');
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    iss: ISSUER, aud: AUDIENCE, sub: 'nova-owner', room: input.room,
    participant: input.participant, scope: SCOPES, iat: now,
    ...(input.accountId ? { account_id: input.accountId } : {}),
    exp: Math.min(input.expiresAt, now + MAX_TTL_SECONDS), jti: randomUUID(),
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${createHmac('sha256', input.secret).update(unsigned).digest('base64url')}`;
}

export function verifyLiveKitToolCredential(token: string, secret: string, now = Math.floor(Date.now() / 1000)): LiveKitToolClaims | null {
  if (secret.length < 32 || token.length > 4096) return null;
  const pieces = token.split('.');
  if (pieces.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = pieces;
  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
    const supplied = Buffer.from(signaturePart, 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as LiveKitToolClaims;
    if (claims.iss !== ISSUER || claims.aud !== AUDIENCE || claims.sub !== 'nova-owner') return null;
    if (typeof claims.room !== 'string' || typeof claims.participant !== 'string' || typeof claims.jti !== 'string') return null;
    if (!/^nova-[0-9a-f-]{36}$/i.test(claims.room) || !/^nova-owner-[0-9a-f-]{36}$/i.test(claims.participant)) return null;
    const accountId = (claims as LiveKitToolClaims & { account_id?: unknown }).account_id;
    if (accountId !== undefined && (typeof accountId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId))) return null;
    claims.accountId = accountId as string | undefined;
    if (!Array.isArray(claims.scope) || claims.scope.length !== SCOPES.length || !SCOPES.every((scope) => claims.scope.includes(scope))) return null;
    if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.exp <= now || claims.iat > now + 30 || claims.exp <= claims.iat || claims.exp - claims.iat > MAX_TTL_SECONDS) return null;
    return claims;
  } catch {
    return null;
  }
}

export const LIVEKIT_TOOL_SCOPES = SCOPES;
