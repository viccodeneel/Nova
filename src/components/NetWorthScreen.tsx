import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient } from '../services/apiClient.ts';

interface Item { id: string; kind: 'asset' | 'liability'; category: string; name: string; value: number }
interface Snap { day: string; net_worth: number }

const META: Record<string, { label: string; icon: string; color: string }> = {
  cash: { label: 'Cash', icon: 'payments', color: '#34d399' },
  savings: { label: 'Savings', icon: 'savings', color: '#22d3ee' },
  investment: { label: 'Investments', icon: 'trending_up', color: '#a78bfa' },
  phone: { label: 'Phones', icon: 'smartphone', color: '#f472b6' },
  laptop: { label: 'Laptops', icon: 'laptop_mac', color: '#60a5fa' },
  vehicle: { label: 'Vehicles', icon: 'directions_car', color: '#fbbf24' },
  property: { label: 'Property', icon: 'home', color: '#fb923c' },
  other: { label: 'Other', icon: 'category', color: '#94a3b8' },
  loan: { label: 'Loans', icon: 'request_quote', color: '#fb7185' },
  credit: { label: 'Credit', icon: 'credit_card', color: '#f87171' },
};
const ASSET_CATS = ['cash', 'savings', 'investment', 'phone', 'laptop', 'vehicle', 'property', 'other'];
const DEBT_CATS = ['loan', 'credit', 'other'];
const RANGES: Array<[string, number]> = [['1M', 30], ['3M', 90], ['1Y', 365], ['ALL', 36500]];

function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now(), a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700), e = 1 - Math.pow(1 - k, 3);
      const v = a + (target - a) * e; setShown(v); from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

const TrendChart: React.FC<{ data: Snap[]; fmt: (n: number) => string }> = ({ data, fmt }) => {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10 px-4 text-center text-sm text-slate-500">Your trend appears once NOVA has recorded two days of data.</div>;
  const W = 600, H = 200, P = 8;
  const vals = data.map((d) => d.net_worth), min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = data.map((d, i) => [P + (i / (data.length - 1)) * (W - 2 * P), H - P - ((d.net_worth - min) / span) * (H - 2 * P - 16)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const hi = hover ?? data.length - 1;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((e.clientX - r.left) / r.width) * (data.length - 1)))));
  };
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-400"><span>{data[hi].day}</span><span className="tabular-nums text-white">{fmt(data[hi].net_worth)}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full touch-pan-y select-none" onPointerMove={move} onPointerLeave={() => setHover(null)} role="img" aria-label="Net worth over time">
        <defs><linearGradient id="nwfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22d3ee" stopOpacity=".35" /><stop offset="1" stopColor="#7c3aed" stopOpacity="0" /></linearGradient></defs>
        <path d={`${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`} fill="url(#nwfill)" />
        <path d={line} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={pts[hi][0]} x2={pts[hi][0]} y1="0" y2={H} stroke="#fff" strokeOpacity=".15" />
        <circle cx={pts[hi][0]} cy={pts[hi][1]} r="5" fill="#0a0c13" stroke="#22d3ee" strokeWidth="2.5" />
      </svg>
    </div>
  );
};

const Donut: React.FC<{ parts: Array<[string, number]> }> = ({ parts }) => {
  const total = parts.reduce((a, [, v]) => a + v, 0) || 1, R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label="Asset allocation">
      <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="16" />
      {parts.map(([c, v]) => { const len = (v / total) * C, el = <circle key={c} cx="70" cy="70" r={R} fill="none" stroke={META[c].color} strokeWidth="16" strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-acc} style={{ transition: 'stroke-dasharray .7s' }} />; acc += len; return el; })}
    </svg>
  );
};

interface Props { currency: string; goal: number | null; onGoalChange: (g: number | null) => Promise<void> }

export const NetWorthScreen: React.FC<Props> = ({ currency, goal, onGoalChange }) => {
  const [items, setItems] = useState<Item[] | null>(null);
  const [history, setHistory] = useState<Snap[]>([]);
  const [error, setError] = useState('');
  const [range, setRange] = useState(90);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState(false);
  const [kind, setKind] = useState<Item['kind']>('asset');
  const [cat, setCat] = useState('cash');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [goalInput, setGoalInput] = useState<string | null>(null);

  const fmt = useCallback((n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n), [currency]);
  const load = useCallback(async () => {
    try { const [i, h] = await Promise.all([ApiClient.getFinanceItems(), ApiClient.getFinanceHistory()]); setItems(i); setHistory(h); setError(''); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const t = useMemo(() => {
    const list = items || [];
    const sum = (k: Item['kind']) => list.filter((i) => i.kind === k).reduce((a, i) => a + i.value, 0);
    const by = (k: Item['kind']) => { const m = new Map<string, Item[]>(); list.filter((i) => i.kind === k).forEach((i) => m.set(i.category, [...(m.get(i.category) || []), i])); return [...m.entries()].sort((a, b) => b[1].reduce((x, i) => x + i.value, 0) - a[1].reduce((x, i) => x + i.value, 0)); };
    return { assets: sum('asset'), debts: sum('liability'), a: by('asset'), l: by('liability') };
  }, [items]);

  const net = t.assets - t.debts;
  const shown = useCountUp(net);
  const visible = useMemo(() => { const cut = Date.now() - range * 864e5; const v = history.filter((h) => new Date(h.day).getTime() >= cut); return v.length >= 2 ? v : history; }, [history, range]);
  const prev = visible.length >= 2 ? visible[0] : null;
  const delta = prev ? net - prev.net_worth : null;

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const submit = (e: React.FormEvent) => { e.preventDefault(); void act(async () => { await ApiClient.addFinanceItem({ kind, category: cat, name: name.trim(), value: Number(value) }); setSheet(false); setName(''); setValue(''); }); };
  const cats = kind === 'asset' ? ASSET_CATS : DEBT_CATS;
  const goalPct = goal && goal > 0 ? Math.max(0, Math.min(100, (net / goal) * 100)) : null;

  const Group = (c: string, list: Item[], k: string) => {
    const total = list.reduce((a, i) => a + i.value, 0), m = META[c], isOpen = open[k + c] ?? true;
    return (
      <div key={k + c} className="hud-panel overflow-hidden">
        <button onClick={() => setOpen({ ...open, [k + c]: !isOpen })} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={isOpen}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${m.color}22`, color: m.color }}><span className="material-symbols-outlined">{m.icon}</span></span>
          <span className="flex-1"><span className="block text-sm font-semibold text-white">{m.label}</span><span className="text-xs text-slate-500">{list.length} {list.length === 1 ? 'item' : 'items'}</span></span>
          <span className="text-sm font-semibold tabular-nums text-white">{fmt(total)}</span>
          <span className={`material-symbols-outlined text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
        </button>
        {isOpen && <div className="divide-y divide-white/5 border-t border-white/5">
          {list.map((i) => (
            <div key={i.id} className="flex items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{i.name}</span>
              <input key={i.value} type="number" inputMode="decimal" min="0" step="0.01" defaultValue={i.value} aria-label={`Value of ${i.name}`}
                onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && v !== i.value) void act(() => ApiClient.updateFinanceItem(i.id, v)); }}
                className="w-28 rounded-md border border-transparent bg-transparent px-2 py-1 text-right text-sm tabular-nums text-white outline-none hover:border-white/10 focus:border-cyan-400" />
              <button aria-label={`Delete ${i.name}`} disabled={busy} onClick={() => { if (window.confirm(`Delete “${i.name}”?`)) void act(() => ApiClient.deleteFinanceItem(i.id)); }} className="p-1 text-slate-600 transition hover:text-rose-400"><span className="material-symbols-outlined text-[18px]">delete</span></button>
            </div>
          ))}
        </div>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5 pb-20">
      <section className="hud-panel overflow-hidden p-5 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <p className="font-label-tech text-[11px] uppercase tracking-[0.3em] text-cyan-300">Total net worth</p>
        <p className="mt-2 break-words text-4xl font-bold tabular-nums text-white sm:text-6xl">{items ? fmt(shown) : '—'}</p>
        <p className={`mt-2 text-sm ${delta === null ? 'text-slate-500' : delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {delta === null ? 'Tracking starts today. Change appears after day two.' : `${delta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(delta))} since ${prev!.day}`}
        </p>
        <div className="mt-5 flex gap-1 rounded-lg bg-black/30 p-1 sm:w-fit">
          {RANGES.map(([l, d]) => <button key={l} onClick={() => setRange(d)} className={`flex-1 rounded-md px-4 py-1.5 text-xs font-semibold transition sm:flex-none ${range === d ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{l}</button>)}
        </div>
        <div className="mt-4"><TrendChart data={visible} fmt={fmt} /></div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error} <button className="ml-2 underline" onClick={() => void load()}>Retry</button></p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        <div className="hud-panel p-4 sm:p-5"><p className="text-xs text-slate-400">Assets</p><p className="mt-1 text-lg font-semibold tabular-nums text-emerald-300 sm:text-2xl">{fmt(t.assets)}</p></div>
        <div className="hud-panel p-4 sm:p-5"><p className="text-xs text-slate-400">Liabilities</p><p className="mt-1 text-lg font-semibold tabular-nums text-rose-300 sm:text-2xl">{fmt(t.debts)}</p></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="hud-panel p-5">
          <h2 className="font-label-tech text-[11px] uppercase tracking-[0.25em] text-cyan-300">Asset allocation</h2>
          {t.a.length === 0 ? <p className="mt-4 text-sm text-slate-500">Add an asset to see how your wealth is spread.</p> : (
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
              <Donut parts={t.a.map(([c, l]) => [c, l.reduce((x, i) => x + i.value, 0)])} />
              <ul className="w-full space-y-2">{t.a.map(([c, l]) => { const v = l.reduce((x, i) => x + i.value, 0); return (
                <li key={c} className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ background: META[c].color }} /><span className="flex-1 text-slate-300">{META[c].label}</span><span className="text-xs text-slate-500">{t.assets ? Math.round((v / t.assets) * 100) : 0}%</span><span className="w-24 text-right tabular-nums text-white">{fmt(v)}</span></li>); })}</ul>
            </div>)}
        </section>
        <section className="hud-panel p-5">
          <h2 className="font-label-tech text-[11px] uppercase tracking-[0.25em] text-cyan-300">Goal</h2>
          {goalPct !== null && goalInput === null ? (
            <div className="mt-4"><div className="flex items-end justify-between"><span className="text-3xl font-bold tabular-nums text-white">{Math.round(goalPct)}%</span><span className="text-sm text-slate-400">{fmt(net)} of {fmt(goal!)}</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-700" style={{ width: `${goalPct}%` }} /></div>
              <button onClick={() => setGoalInput(String(goal))} className="mt-4 text-xs text-slate-400 underline">Change goal</button></div>
          ) : goalInput === null ? (
            <div className="mt-4"><p className="text-sm text-slate-400">Set a target and track your progress toward it.</p><button onClick={() => setGoalInput('')} className="mt-3 rounded-lg border border-white/10 px-4 py-2 text-sm text-white transition hover:border-cyan-400">Set a goal</button></div>
          ) : (
            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void onGoalChange(goalInput === '' ? null : Number(goalInput)).then(() => setGoalInput(null)).catch((er) => setError((er as Error).message)); }}>
              <input autoFocus type="number" inputMode="decimal" min="0" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="Target amount" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400" />
              <button className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black">Save</button>
              <button type="button" onClick={() => setGoalInput(null)} className="px-2 text-sm text-slate-400">Cancel</button>
            </form>)}
        </section>
      </div>

      {items === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {items?.length === 0 && <div className="hud-panel p-8 text-center"><p className="text-white">Nothing tracked yet</p><p className="mt-1 text-sm text-slate-400">Add your cash, devices, vehicles and debts to see your real net worth.</p></div>}
      {t.a.length > 0 && <div className="flex flex-col gap-3"><h2 className="font-label-tech text-[11px] uppercase tracking-[0.25em] text-slate-400">Assets</h2>{t.a.map(([c, l]) => Group(c, l, 'a'))}</div>}
      {t.l.length > 0 && <div className="flex flex-col gap-3"><h2 className="font-label-tech text-[11px] uppercase tracking-[0.25em] text-slate-400">Liabilities</h2>{t.l.map(([c, l]) => Group(c, l, 'l'))}</div>}

      <button onClick={() => { setKind('asset'); setCat('cash'); setSheet(true); }} className="fixed bottom-24 right-5 z-30 flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-violet-600 px-5 font-semibold text-white shadow-[0_8px_30px_rgba(34,211,238,.35)] transition hover:scale-105 active:scale-95 lg:bottom-8 lg:right-8">
        <span className="material-symbols-outlined">add</span>Add
      </button>

      {sheet && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={() => setSheet(false)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="nova-enter max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0d1017] p-5 sm:max-w-md sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold text-white">Add to net worth</h3><button type="button" aria-label="Close" onClick={() => setSheet(false)} className="text-slate-400"><span className="material-symbols-outlined">close</span></button></div>
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-black/40 p-1">{(['asset', 'liability'] as const).map((k) => <button type="button" key={k} onClick={() => { setKind(k); setCat(k === 'asset' ? 'cash' : 'loan'); }} className={`rounded-md py-2 text-sm font-semibold capitalize transition ${kind === k ? 'bg-white/10 text-white' : 'text-slate-500'}`}>{k === 'asset' ? 'Asset' : 'Debt'}</button>)}</div>
            <div className="grid grid-cols-4 gap-2">{cats.map((c) => <button type="button" key={c} onClick={() => setCat(c)} className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-[11px] transition ${cat === c ? 'border-cyan-400 bg-cyan-400/10 text-white' : 'border-white/10 text-slate-400'}`}><span className="material-symbols-outlined" style={{ color: META[c].color }}>{META[c].icon}</span>{META[c].label}</button>)}</div>
            <input required autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. iPhone 15" className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-cyan-400" />
            <input required type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Value (${currency})`} className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-cyan-400" />
            <button disabled={busy || !name.trim() || value === ''} className="mt-5 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 py-3 font-semibold text-white transition disabled:opacity-40">Add</button>
            <p className="mt-3 text-center text-[11px] text-slate-500">Values are entered manually and treated as {currency}; no currency conversion.</p>
          </form>
        </div>)}
    </div>
  );
};
