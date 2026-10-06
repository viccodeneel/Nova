import { randomUUID } from 'node:crypto';
import { query, isDatabaseConnected } from '../../database/db.ts';

export interface FinanceItem {
  id: string; kind: 'asset' | 'liability'; category: string; name: string; value: number;
  created_at: string; updated_at: string;
}
export const CATEGORIES: Record<FinanceItem['kind'], string[]> = {
  asset: ['cash', 'savings', 'investment', 'phone', 'laptop', 'vehicle', 'property', 'other'],
  liability: ['loan', 'credit', 'other'],
};

const memory = new Map<string, FinanceItem>();
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const norm = (r: any): FinanceItem => ({ ...r, value: Number(r.value) });

export async function listItems(): Promise<FinanceItem[]> {
  if (isDatabaseConnected()) {
    const r = await query<FinanceItem>('SELECT * FROM finance_items ORDER BY created_at ASC');
    return (r?.rows ?? []).map(norm);
  }
  return [...memory.values()];
}

export async function createItem(i: Pick<FinanceItem, 'kind' | 'category' | 'name' | 'value'>): Promise<FinanceItem> {
  if (isDatabaseConnected()) {
    const r = await query<FinanceItem>(
      'INSERT INTO finance_items (kind, category, name, value) VALUES ($1,$2,$3,$4) RETURNING *',
      [i.kind, i.category, i.name, i.value]);
    if (!r) throw new Error('Database write failed');
    return norm(r.rows[0]);
  }
  const now = new Date().toISOString();
  const item = { ...i, id: randomUUID(), created_at: now, updated_at: now };
  memory.set(item.id, item);
  return item;
}

export async function updateValue(id: string, value: number): Promise<FinanceItem | null> {
  if (isDatabaseConnected()) {
    if (!isUuid(id)) return null;
    const r = await query<FinanceItem>('UPDATE finance_items SET value=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *', [value, id]);
    return r && r.rows[0] ? norm(r.rows[0]) : null;
  }
  const item = memory.get(id);
  if (!item) return null;
  const updated = { ...item, value, updated_at: new Date().toISOString() };
  memory.set(id, updated);
  return updated;
}

export async function removeItem(id: string): Promise<boolean> {
  if (isDatabaseConnected()) {
    if (!isUuid(id)) return false;
    const r = await query('DELETE FROM finance_items WHERE id=$1 RETURNING id', [id]);
    return !!r && r.rows.length > 0;
  }
  return memory.delete(id);
}
