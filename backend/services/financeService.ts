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
export interface Snapshot { day: string; assets: number; liabilities: number; net_worth: number }
const memorySnaps = new Map<string, Snapshot>();
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

// Record today's totals (derived from the real items) so the trend chart has history.
async function snapshotNow(): Promise<void> {
  const items = await listItems();
  const assets = items.filter((i) => i.kind === 'asset').reduce((a, i) => a + i.value, 0);
  const liabilities = items.filter((i) => i.kind === 'liability').reduce((a, i) => a + i.value, 0);
  const day = new Date().toISOString().slice(0, 10);
  if (isDatabaseConnected()) {
    await query(`INSERT INTO net_worth_snapshots (day, assets, liabilities, net_worth) VALUES ($1,$2,$3,$4)
      ON CONFLICT (day) DO UPDATE SET assets=$2, liabilities=$3, net_worth=$4, updated_at=CURRENT_TIMESTAMP`, [day, assets, liabilities, assets - liabilities]);
  } else memorySnaps.set(day, { day, assets, liabilities, net_worth: assets - liabilities });
}

export async function getHistory(): Promise<Snapshot[]> {
  if ((await listItems()).length > 0) await snapshotNow();
  if (!isDatabaseConnected()) return [...memorySnaps.values()].sort((a, b) => a.day.localeCompare(b.day));
  const r = await query<any>("SELECT to_char(day,'YYYY-MM-DD') AS day, assets, liabilities, net_worth FROM net_worth_snapshots ORDER BY day ASC");
  return (r?.rows ?? []).map((x) => ({ day: x.day, assets: Number(x.assets), liabilities: Number(x.liabilities), net_worth: Number(x.net_worth) }));
}
export const recordSnapshot = () => snapshotNow().catch(() => undefined);
