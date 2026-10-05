import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';

const router = Router();
const SESSION_SECONDS = 12 * 60 * 60;
const attemptsByAddress = new Map<string, { count: number; resetAt: number }>();

function authSecret(): string {
  return process.env.NOVA_AUTH_SECRET || '';
}

function sign(value: string): Buffer {
  return createHmac('sha256', authSecret()).update(value).digest();
}

function derivePassword(password: string): Buffer {
  const salt = createHmac('sha256', authSecret()).update('nova-single-user-password-salt').digest();
  return scryptSync(password, salt, 64);
}

function createToken(now = Math.floor(Date.now() / 1000)): string {
  const payload = Buffer.from(JSON.stringify({ sub: 'nova-owner', iat: now, exp: now + SESSION_SECONDS })).toString('base64url');
  return `${payload}.${sign(payload).toString('base64url')}`;
}

function isValidToken(token: string): boolean {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  try {
    const supplied = Buffer.from(signature, 'base64url');
    const expected = sign(payload);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string; exp?: number };
    return claims.sub === 'nova-owner' && typeof claims.exp === 'number' && claims.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

router.post('/login', (req: Request, res: Response) => {
  const now = Date.now();
  if (attemptsByAddress.size > 10_000) {
    for (const [addressKey, savedAttempt] of attemptsByAddress) {
      if (savedAttempt.resetAt <= now) attemptsByAddress.delete(addressKey);
    }
  }
  const address = req.ip || req.socket.remoteAddress || 'unknown';
  const attempt = attemptsByAddress.get(address);
  if (attempt && attempt.resetAt > now && attempt.count >= 5) {
    res.setHeader('Retry-After', Math.ceil((attempt.resetAt - now) / 1000));
    return res.status(429).json({ success: false, message: 'Too many sign-in attempts. Try again in 15 minutes.' });
  }

  const configuredPassword = process.env.NOVA_AUTH_PASSWORD;
  const secret = authSecret();
  if (!configuredPassword || configuredPassword.length < 12 || secret.length < 32) {
    return res.status(503).json({ success: false, message: 'Sign-in needs a password of at least 12 characters and a generated server secret.' });
  }

  const suppliedPassword = typeof req.body?.password === 'string' ? req.body.password : '';
  const valid = suppliedPassword.length > 0 && suppliedPassword.length <= 1024 &&
    timingSafeEqual(derivePassword(suppliedPassword), derivePassword(configuredPassword));
  if (!valid) {
    const current = attempt && attempt.resetAt > now ? attempt : { count: 0, resetAt: now + 15 * 60 * 1000 };
    attemptsByAddress.set(address, { ...current, count: current.count + 1 });
    return res.status(401).json({ success: false, message: 'The password is incorrect.' });
  }

  attemptsByAddress.delete(address);
  res.json({ success: true, token: createToken(), expires_in: SESSION_SECONDS });
});

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV !== 'production' && !process.env.NOVA_AUTH_PASSWORD && !authSecret()) {
    next();
    return;
  }
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (authSecret().length < 32 || !token || !isValidToken(token)) {
    res.status(401).json({ success: false, message: 'Sign-in required.' });
    return;
  }
  next();
}

export default router;
