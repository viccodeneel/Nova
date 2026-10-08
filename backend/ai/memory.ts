import { randomUUID } from 'node:crypto';
import { query, isDatabaseConnected } from '../../database/db.ts';

export const MEMORY_KINDS = ['preference', 'goal', 'fact', 'rule', 'project', 'event'] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];
export interface Memory { id: string; kind: MemoryKind; content: string; created_at: string; last_used_at: string | null; use_count: number }

const MAX_MEMORIES = 300;
const MAX_CONTENT = 300;
const memory = new Map<string, Memory>();
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const STOP = new Set('the and for are but you your with that this from have has was were what when where which who how why can could would should will shall about into over just not all any out our his her its they them then than there here been being also very more some such only own same too did does doing done get got let lets say said tell give make made'.split(' '));

export const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s: string) => normalize(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 6));

const norm = (r: any): Memory => ({
  id: r.id, kind: r.kind, content: r.content, use_count: Number(r.use_count || 0),
  created_at: new Date(r.created_at).toISOString(), last_used_at: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
});

export async function listMemories(): Promise<Memory[]> {
  if (isDatabaseConnected()) {
    const r = await query('SELECT * FROM nova_memories ORDER BY created_at DESC');
    return (r?.rows ?? []).map(norm);
  }
  return [...memory.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addMemory(kind: MemoryKind, content: string): Promise<{ memory: Memory; duplicate: boolean }> {
  const text = content.trim().slice(0, MAX_CONTENT);
  if (!text) throw Object.assign(new Error('Memory is empty.'), { code: 'MEMORY_INVALID' });
  const all = await listMemories();
  const existing = all.find((m) => normalize(m.content) === normalize(text));
  if (existing) return { memory: existing, duplicate: true };
  if (all.length >= MAX_MEMORIES) throw Object.assign(new Error('Memory is full. Ask NOVA to forget something first.'), { code: 'MEMORY_FULL' });
  if (isDatabaseConnected()) {
    const r = await query('INSERT INTO nova_memories (kind, content) VALUES ($1, $2) RETURNING *', [kind, text]);
    if (!r) throw new Error('Database write failed');
    return { memory: norm(r.rows[0]), duplicate: false };
  }
  const created: Memory = { id: randomUUID(), kind, content: text, created_at: new Date().toISOString(), last_used_at: null, use_count: 0 };
  memory.set(created.id, created);
  return { memory: created, duplicate: false };
}

export async function removeMemory(id: string): Promise<boolean> {
  if (isDatabaseConnected()) {
    if (!isUuid(id)) return false;
    const r = await query('DELETE FROM nova_memories WHERE id = $1 RETURNING id', [id]);
    return !!r && r.rows.length > 0;
  }
  return memory.delete(id);
}

/** Removes memories matching a description. Refuses when the match is ambiguous so a vague "forget it" can't wipe things. */
export async function forgetMatching(description: string): Promise<{ removed: string[]; ambiguous: string[] }> {
  const want = tokens(description);
  if (!want.length) return { removed: [], ambiguous: [] };
  const scored = (await listMemories())
    .map((m) => ({ m, hits: tokens(m.content).filter((t) => want.includes(t)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (!scored.length) return { removed: [], ambiguous: [] };
  const best = scored[0].hits;
  const top = scored.filter((x) => x.hits === best);
  if (top.length > 3) return { removed: [], ambiguous: top.slice(0, 5).map((x) => x.m.content) };
  for (const { m } of top) await removeMemory(m.id);
  return { removed: top.map((x) => x.m.content), ambiguous: [] };
}

/** Selective retrieval: only memories that overlap the request, so the prompt never carries the whole database. */
export async function retrieveRelevant(text: string, limit = 6): Promise<Memory[]> {
  const want = new Set(tokens(text));
  if (!want.size) return [];
  const now = Date.now();
  const ranked = (await listMemories()).map((m) => {
    const overlap = tokens(m.content).filter((t) => want.has(t)).length;
    if (!overlap) return { m, score: 0 };
    const ageDays = (now - new Date(m.last_used_at || m.created_at).getTime()) / 864e5;
    return { m, score: overlap * 2 + (m.kind === 'rule' || m.kind === 'preference' ? 0.5 : 0) + Math.max(0, 0.5 - ageDays / 60) };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.m);
  if (ranked.length) {
    if (isDatabaseConnected()) await query('UPDATE nova_memories SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ANY($1::uuid[])', [ranked.map((m) => m.id)]).catch(() => null);
    else ranked.forEach((m) => { const cur = memory.get(m.id); if (cur) memory.set(m.id, { ...cur, use_count: cur.use_count + 1, last_used_at: new Date().toISOString() }); });
  }
  return ranked;
}
