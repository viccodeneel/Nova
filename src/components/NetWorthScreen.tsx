import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../services/apiClient.ts';

interface Item { id: string; kind: 'asset' | 'liability'; category: string; name: string; value: number }
const CATS = {
  asset: ['cash', 'savings', 'investment', 'phone', 'laptop', 'vehicle', 'property', 'other'],
  liability: ['loan', 'credit', 'other'],
} as const;
const CURRENCIES = ['USD', 'GHS', 'EUR', 'GBP'];

export const NetWorthScreen: React.FC = () => {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const [currency, setCurrency] = useState(() => localStorage.getItem('nova_currency') || 'USD');
  const [kind, setKind] = useState<'asset' | 'liability'>('asset');
  const [category, setCategory] = useState('cash');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const fmt = useCallback((n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n), [currency]);
  const load = useCallback(async () => {
    try { setItems(await ApiClient.getFinanceItems()); setError(''); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const list = items || [];
    const sum = (k: Item['kind']) => list.filter((i) => i.kind === k).reduce((a, i) => a + i.value, 0);
    const byCat = new Map<string, number>();
    list.filter((i) => i.kind === 'asset').forEach((i) => byCat.set(i.category, (byCat.get(i.category) || 0) + i.value));
    return { assets: sum('asset'), liabilities: sum('liability'), byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]) };
  }, [items]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    void act(async () => { await ApiClient.addFinanceItem({ kind, category, name: name.trim(), value: Number(value) }); setName(''); setValue(''); });
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="hud-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-label-tech text-[11px] uppercase tracking-[0.3em] text-cyan-300">Net worth</p>
            <p className="mt-2 font-headline-lg text-4xl font-bold tabular-nums text-white sm:text-5xl">{items ? fmt(totals.assets - totals.liabilities) : '—'}</p>
            <p className="mt-2 text-xs text-slate-500">Manual entries only. All values are treated as {currency}; no conversion is applied.</p>
          </div>
          <select value={currency} onChange={(e) => { setCurrency(e.target.value); localStorage.setItem('nova_currency', e.target.value); }}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200">
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><p className="text-xs text-slate-400">Assets</p><p className="mt-1 text-xl font-semibold tabular-nums text-emerald-300">{fmt(totals.assets)}</p></div>
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4"><p className="text-xs text-slate-400">Liabilities</p><p className="mt-1 text-xl font-semibold tabular-nums text-rose-300">{fmt(totals.liabilities)}</p></div>
        </div>
        {totals.byCat.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            {totals.byCat.map(([c, v]) => (
              <div key={c}>
                <div className="mb-1 flex justify-between text-xs text-slate-400"><span className="capitalize">{c}</span><span className="tabular-nums">{fmt(v)}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-700" style={{ width: `${(v / totals.assets) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error} <button className="ml-2 underline" onClick={() => void load()}>Retry</button></p>}

      <form onSubmit={add} className="hud-panel grid gap-3 p-5 sm:grid-cols-[110px_130px_1fr_150px_auto]">
        <select value={kind} onChange={(e) => { const k = e.target.value as Item['kind']; setKind(k); setCategory(CATS[k][0]); }} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200"><option value="asset">Asset</option><option value="liability">Liability</option></select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm capitalize text-slate-200">{CATS[kind].map((c) => <option key={c}>{c}</option>)}</select>
        <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. iPhone 15, Toyota Corolla" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400" />
        <input required type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400" />
        <button disabled={busy || !name.trim() || value === ''} className="rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-40">Add</button>
      </form>

      <section className="hud-panel divide-y divide-white/5">
        {items === null && !error && <p className="p-6 text-sm text-slate-500">Loading…</p>}
        {items?.length === 0 && <p className="p-6 text-sm text-slate-400">Nothing tracked yet. Add your first asset above.</p>}
        {items?.map((i) => (
          <div key={i.id} className="flex items-center gap-4 px-5 py-3 transition hover:bg-white/[0.03]">
            <span className={`rounded-md px-2 py-0.5 font-label-tech text-[10px] uppercase ${i.kind === 'asset' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{i.category}</span>
            <span className="flex-1 truncate text-sm text-slate-200">{i.name}</span>
            <input key={i.value} type="number" min="0" step="0.01" defaultValue={i.value} aria-label={`Value of ${i.name}`}
              onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && v !== i.value) void act(() => ApiClient.updateFinanceItem(i.id, v)); }}
              className="w-32 rounded-md border border-transparent bg-transparent px-2 py-1 text-right text-sm tabular-nums text-white outline-none hover:border-white/10 focus:border-cyan-400" />
            <button title="Delete" disabled={busy} onClick={() => { if (window.confirm(`Delete “${i.name}”?`)) void act(() => ApiClient.deleteFinanceItem(i.id)); }} className="text-slate-500 transition hover:text-rose-400"><span className="material-symbols-outlined text-[18px]">delete</span></button>
          </div>
        ))}
      </section>
    </div>
  );
};
