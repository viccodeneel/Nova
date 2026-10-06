import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { query, isDatabaseConnected } from '../../database/db.ts';

export interface Profile { display_name: string; avatar: string | null; currency: string; networth_goal: number | null }
export const CURRENCIES = ['USD', 'GHS', 'EUR', 'GBP'];

let memory: Profile & { password_hash: string | null } = { display_name: 'Vicco', avatar: null, currency: 'USD', networth_goal: null, password_hash: null };
const COLS = 'display_name, avatar, currency, networth_goal';
const toProfile = (r: any): Profile => ({ display_name: r.display_name, avatar: r.avatar, currency: r.currency, networth_goal: r.networth_goal === null ? null : Number(r.networth_goal) });

async function ensureRow() { await query('INSERT INTO app_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING'); }

export async function getProfile(): Promise<Profile> {
  if (!isDatabaseConnected()) return toProfile(memory);
  await ensureRow();
  const r = await query(`SELECT ${COLS} FROM app_profile WHERE id = 1`);
  if (!r) throw new Error('Database read failed');
  return toProfile(r.rows[0]);
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const next = { ...(await getProfile()), ...patch };
  if (!isDatabaseConnected()) { memory = { ...memory, ...next }; return next; }
  const r = await query(`UPDATE app_profile SET display_name=$1, avatar=$2, currency=$3, networth_goal=$4, updated_at=CURRENT_TIMESTAMP WHERE id=1 RETURNING ${COLS}`,
    [next.display_name, next.avatar, next.currency, next.networth_goal]);
  if (!r) throw new Error('Database write failed');
  return toProfile(r.rows[0]);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyHash(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function getPasswordHash(): Promise<string | null> {
  if (!isDatabaseConnected()) return memory.password_hash;
  await ensureRow();
  const r = await query<{ password_hash: string | null }>('SELECT password_hash FROM app_profile WHERE id = 1');
  return r?.rows[0]?.password_hash ?? null;
}
export async function setPassword(plain: string): Promise<void> {
  const hash = hashPassword(plain);
  if (!isDatabaseConnected()) { memory.password_hash = hash; return; }
  await ensureRow();
  const r = await query('UPDATE app_profile SET password_hash=$1, updated_at=CURRENT_TIMESTAMP WHERE id=1', [hash]);
  if (!r) throw new Error('Database write failed');
}
