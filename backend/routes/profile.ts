import { Router, type Request, type Response } from 'express';
import { CURRENCIES, getProfile, setPassword, updateProfile, type Profile } from '../services/profileService.ts';
import { verifyOwnerPassword } from './auth.ts';

const router = Router();
const fail = (res: Response, e: unknown) => res.status(500).json({ success: false, error: (e as Error).message });
const attempts = { count: 0, resetAt: 0 };

router.get('/', async (_req: Request, res: Response) => {
  try { res.json({ success: true, data: await getProfile() }); } catch (e) { fail(res, e); }
});

router.patch('/', async (req: Request, res: Response) => {
  const b = req.body || {};
  const patch: Partial<Profile> = {};
  if ('display_name' in b) {
    const n = typeof b.display_name === 'string' ? b.display_name.trim() : '';
    if (!n || n.length > 60) return res.status(400).json({ success: false, error: 'Name must be 1-60 characters.' });
    patch.display_name = n;
  }
  if ('avatar' in b) {
    if (b.avatar !== null && !(typeof b.avatar === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(b.avatar) && b.avatar.length <= 90_000))
      return res.status(400).json({ success: false, error: 'Avatar must be a small JPEG, PNG or WebP image.' });
    patch.avatar = b.avatar;
  }
  if ('currency' in b) {
    if (!CURRENCIES.includes(b.currency)) return res.status(400).json({ success: false, error: 'Unsupported currency.' });
    patch.currency = b.currency;
  }
  if ('networth_goal' in b) {
    if (b.networth_goal !== null && !(Number.isFinite(Number(b.networth_goal)) && Number(b.networth_goal) >= 0 && Number(b.networth_goal) <= 1e12))
      return res.status(400).json({ success: false, error: 'Goal must be a non-negative number.' });
    patch.networth_goal = b.networth_goal === null ? null : Number(b.networth_goal);
  }
  try { res.json({ success: true, data: await updateProfile(patch) }); } catch (e) { fail(res, e); }
});

router.post('/password', async (req: Request, res: Response) => {
  const now = Date.now();
  if (attempts.resetAt > now && attempts.count >= 5) return res.status(429).json({ success: false, error: 'Too many attempts. Try again in 15 minutes.' });
  const { current, next } = req.body || {};
  if (typeof next !== 'string' || next.length < 12 || next.length > 1024)
    return res.status(400).json({ success: false, error: 'New password must be at least 12 characters.' });
  try {
    if (typeof current !== 'string' || !(await verifyOwnerPassword(current))) {
      if (attempts.resetAt <= now) { attempts.count = 0; attempts.resetAt = now + 15 * 60 * 1000; }
      attempts.count += 1;
      return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
    }
    await setPassword(next);
    attempts.count = 0;
    res.json({ success: true });
  } catch (e) { fail(res, e); }
});

export default router;
