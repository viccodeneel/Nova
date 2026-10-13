import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, ArrowUpDown, Activity, TrendingUp, Target, Trophy, Clock3 } from 'lucide-react';
import { PropAccount, TradeExecution } from '../data/terminalData';

interface TradeJournalScreenProps {
  trades: TradeExecution[];
  selectedTrade: TradeExecution | null;
  accounts?: PropAccount[];
  activeAccountId?: string;
  onSelectAccount?: (accountId: string) => void;
  onSelectTrade: (trade: TradeExecution | null) => void;
  onAddTrade: (trade: TradeExecution) => void;
  onDeleteTrade?: (tradeId: string) => void;
  onSyncPastTrades?: (accountId: string, count?: number) => Promise<void> | void;
  onOpenImportModal?: () => void;
}

type Period = 'ALL' | '30D' | '90D';
const controlClass = 'rounded-xl border border-white/[.09] bg-[#080d19]/85 px-3 py-2 text-xs text-slate-200 outline-none transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/10';
const money = (value: number) => `${value < 0 ? '−' : value > 0 ? '+' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timeValue = (time: string) => {
  const value = Date.parse(time);
  return Number.isFinite(value) ? value : null;
};

const JournalChart: React.FC<{ trades: TradeExecution[] }> = ({ trades }) => {
  const ordered = useMemo(() => [...trades].sort((a, b) => (timeValue(a.time) ?? 0) - (timeValue(b.time) ?? 0)), [trades]);
  if (ordered.length < 2) return <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-500">Record at least two trades to view your realized P&amp;L curve.</div>;
  const cumulative = ordered.reduce<number[]>((acc, trade) => [...acc, (acc.at(-1) ?? 0) + trade.pnlValue], []);
  const width = 760, height = 210, pad = 12;
  const min = Math.min(0, ...cumulative), max = Math.max(0, ...cumulative), span = max - min || 1;
  const points = cumulative.map((value, index) => [pad + index / (cumulative.length - 1) * (width - pad * 2), height - pad - (value - min) / span * (height - pad * 2)] as const);
  const path = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = cumulative[cumulative.length - 1];
  return <div className="min-w-0"><div className="mb-2 flex items-center justify-between text-xs"><span className="text-slate-500">Cumulative realized P&amp;L · trade sequence</span><strong className={last >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{money(last)}</strong></div><svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full overflow-visible" role="img" aria-label="Cumulative realized profit and loss from filtered completed trades" preserveAspectRatio="none"><defs><linearGradient id="journal-pnl-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".28"/><stop offset="1" stopColor="#8b5cf6" stopOpacity="0"/></linearGradient></defs><line x1="0" x2={width} y1={height - pad - (0 - min) / span * (height - pad * 2)} y2={height - pad - (0 - min) / span * (height - pad * 2)} stroke="rgba(148,163,184,.2)" strokeDasharray="4 6"/><path d={`${path} L${points.at(-1)![0]},${height} L${points[0][0]},${height} Z`} fill="url(#journal-pnl-fill)"/><path d={path} fill="none" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{points.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={index === points.length - 1 ? 4 : 2.3} fill={cumulative[index] >= 0 ? '#34d399' : '#fb7185'} stroke="#090d17" strokeWidth="2"><title>{`Trade ${index + 1}: ${money(cumulative[index])} cumulative`}</title></circle>)}</svg><div className="flex justify-between text-[10px] text-slate-600"><span>{ordered[0].time}</span><span>{ordered.at(-1)?.time}</span></div></div>;
};

export const TradeJournalScreen: React.FC<TradeJournalScreenProps> = ({
  trades, selectedTrade, accounts = [], activeAccountId, onSelectAccount, onSelectTrade,
  onAddTrade, onDeleteTrade, onSyncPastTrades, onOpenImportModal,
}) => {
  const [selectedAccountFilter, setSelectedAccountFilter] = useState(activeAccountId || 'ALL');
  const [instrumentFilter, setInstrumentFilter] = useState('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [sideFilter, setSideFilter] = useState('ALL');
  const [period, setPeriod] = useState<Period>('ALL');
  const [sortNewest, setSortNewest] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const [newInstrument, setNewInstrument] = useState<'XAUUSD' | 'EURUSD' | 'US100' | 'GBPUSD'>('XAUUSD');
  const [newSide, setNewSide] = useState<'BUY' | 'SELL'>('BUY');
  const [newEntry, setNewEntry] = useState('');
  const [newLots, setNewLots] = useState('');
  const [newOutcome, setNewOutcome] = useState<'WIN' | 'LOSS' | 'BE'>('BE');
  const [newR, setNewR] = useState('');
  const [newPnl, setNewPnl] = useState('');
  const [newQuality, setNewQuality] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const currentFilteredAccount = accounts.find((account) => account.id === selectedAccountFilter);
  const targetSyncAccount = currentFilteredAccount || accounts.find((account) => account.id === activeAccountId) || accounts[0];
  const instruments = useMemo(() => [...new Set(trades.map((trade) => trade.instrument).filter(Boolean))].sort(), [trades]);
  const filteredTrades = useMemo(() => {
    const cutoff = period === 'ALL' ? null : Date.now() - (period === '30D' ? 30 : 90) * 864e5;
    const needle = searchQuery.trim().toLowerCase();
    return trades.filter((trade) => {
      if (selectedAccountFilter !== 'ALL' && trade.accountId !== selectedAccountFilter) return false;
      if (instrumentFilter !== 'ALL' && trade.instrument !== instrumentFilter) return false;
      if (outcomeFilter !== 'ALL' && trade.outcome !== outcomeFilter) return false;
      if (sideFilter !== 'ALL' && trade.side !== sideFilter) return false;
      if (cutoff !== null && (timeValue(trade.time) === null || timeValue(trade.time)! < cutoff)) return false;
      return !needle || `${trade.id} ${trade.instrument} ${trade.quality} ${trade.notes} ${trade.time} ${trade.session}`.toLowerCase().includes(needle);
    }).sort((a, b) => {
      const byTime = (timeValue(a.time) ?? 0) - (timeValue(b.time) ?? 0);
      return byTime === 0 ? 0 : sortNewest ? -byTime : byTime;
    });
  }, [trades, selectedAccountFilter, instrumentFilter, outcomeFilter, sideFilter, period, searchQuery, sortNewest]);

  const wins = filteredTrades.filter((trade) => trade.outcome === 'WIN');
  const losses = filteredTrades.filter((trade) => trade.outcome === 'LOSS');
  const breakeven = filteredTrades.filter((trade) => trade.outcome === 'BE');
  const realizedPnl = filteredTrades.reduce((sum, trade) => sum + trade.pnlValue, 0);
  const averageR = filteredTrades.length ? filteredTrades.reduce((sum, trade) => sum + trade.rValue, 0) / filteredTrades.length : null;
  const averageWin = wins.length ? wins.reduce((sum, trade) => sum + trade.pnlValue, 0) / wins.length : null;
  const averageLoss = losses.length ? losses.reduce((sum, trade) => sum + trade.pnlValue, 0) / losses.length : null;
  const bestTrade = filteredTrades.length ? [...filteredTrades].sort((a, b) => b.pnlValue - a.pnlValue)[0] : null;
  const worstTrade = filteredTrades.length ? [...filteredTrades].sort((a, b) => a.pnlValue - b.pnlValue)[0] : null;
  const winRate = filteredTrades.length ? wins.length / filteredTrades.length * 100 : null;
  const instrumentPerformance = useMemo(() => {
    const grouped = new Map<string, TradeExecution[]>();
    for (const trade of filteredTrades) grouped.set(trade.instrument, [...(grouped.get(trade.instrument) ?? []), trade]);
    return [...grouped.entries()].map(([instrument, records]) => ({
      instrument,
      count: records.length,
      pnl: records.reduce((sum, trade) => sum + trade.pnlValue, 0),
      winRate: records.length ? records.filter((trade) => trade.outcome === 'WIN').length / records.length * 100 : 0,
    })).sort((a, b) => b.pnl - a.pnl);
  }, [filteredTrades]);

  const handleSync = async () => {
    if (!targetSyncAccount || !onSyncPastTrades) return;
    setSyncing(true);
    try { await onSyncPastTrades(targetSyncAccount.id, 5); } finally { setSyncing(false); }
  };

  const handleCreateTrade = (event: React.FormEvent) => {
    event.preventDefault();
    const rVal = Number.parseFloat(newR) || 0, pnlVal = Number.parseFloat(newPnl) || 0;
    const signedR = newOutcome === 'LOSS' ? -Math.abs(rVal) : newOutcome === 'BE' ? 0 : Math.abs(rVal);
    const signedPnl = newOutcome === 'LOSS' ? -Math.abs(pnlVal) : newOutcome === 'BE' ? 0 : Math.abs(pnlVal);
    const created: TradeExecution = {
      id: `MANUAL-${Date.now().toString(36).toUpperCase()}`, accountId: targetSyncAccount?.id,
      time: new Date().toLocaleString(), instrument: newInstrument, side: newSide, entry: newEntry,
      lots: newLots, outcome: newOutcome, rMultiple: `${signedR >= 0 ? '+' : ''}${signedR.toFixed(1)}R`, rValue: signedR,
      netPnl: `${signedPnl >= 0 ? '+' : '-'}$${Math.abs(signedPnl).toFixed(2)}`, pnlValue: signedPnl,
      quality: newQuality || 'Not reviewed', discipline: 'Not reviewed', disciplineScore: 0,
      session: 'Unknown', holdDuration: 'Unknown', fees: 'Not reported', notes: newNotes, rulesPassed: 0,
    };
    onAddTrade(created);
    setShowAddModal(false);
    onSelectTrade(created);
  };

  useEffect(() => {
    if (!selectedTrade) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onSelectTrade(null); }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [selectedTrade, onSelectTrade]);

  const accountName = (id?: string) => accounts.find((account) => account.id === id)?.name;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 pb-6">
      <section className="relative overflow-hidden rounded-2xl border border-blue-300/15 bg-[radial-gradient(ellipse_at_78%_0%,rgba(124,58,237,.18),transparent_38%),linear-gradient(130deg,rgba(12,19,39,.96),rgba(5,9,20,.95))] p-5 shadow-[0_20px_50px_rgba(0,0,0,.22)] sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-violet-500/[.08] blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div><p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-violet-300"><Activity size={13}/> Performance workspace</p><h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Trading Journal</h1><p className="mt-1 max-w-xl text-sm text-slate-400">Review executions, patterns, and realized outcomes from your connected accounts.</p></div>
          <div className="flex flex-wrap gap-2">
            {targetSyncAccount && onSyncPastTrades && <button type="button" disabled={syncing} onClick={() => void handleSync()} className="rounded-xl border border-violet-400/25 bg-violet-500/10 px-3.5 py-2 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-50">{syncing ? 'Syncing…' : 'Sync past deals'}</button>}
            {onOpenImportModal && <button type="button" onClick={onOpenImportModal} className="rounded-xl border border-cyan-400/20 bg-cyan-500/[.07] px-3.5 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/[.13]">Import statement</button>}
            <button type="button" onClick={() => setShowAddModal(true)} className="rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_5px_18px_rgba(93,68,202,.24)] transition hover:brightness-110">Log a trade</button>
          </div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: 'Completed trades', value: filteredTrades.length.toLocaleString(), hint: `${wins.length} wins · ${losses.length} losses`, icon: <Activity size={16}/>, tint: 'text-violet-300' },
            { label: 'Win rate', value: winRate === null ? '—' : `${winRate.toFixed(1)}%`, hint: `${breakeven.length} break-even`, icon: <Target size={16}/>, tint: 'text-cyan-300' },
            { label: 'Realized P&L', value: filteredTrades.length ? money(realizedPnl) : '—', hint: 'Filtered completed trades', icon: <TrendingUp size={16}/>, tint: realizedPnl >= 0 ? 'text-emerald-300' : 'text-rose-300' },
            { label: 'Average result', value: averageR === null ? '—' : `${averageR >= 0 ? '+' : ''}${averageR.toFixed(2)}R`, hint: averageWin === null ? 'Average win unavailable' : `Avg win ${money(averageWin)}`, icon: <Trophy size={16}/>, tint: 'text-amber-300' },
          ].map((metric) => <div key={metric.label} className="rounded-xl border border-white/[.07] bg-[#070b16]/60 p-3.5 sm:p-4"><div className={`flex items-center gap-2 text-[10px] uppercase tracking-[.12em] text-slate-500 ${metric.tint}`}>{metric.icon}<span className="text-slate-400">{metric.label}</span></div><div className="mt-2 truncate text-lg font-semibold tabular-nums text-white sm:text-xl">{metric.value}</div><div className="mt-1 truncate text-[10px] text-slate-500">{metric.hint}</div></div>)}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,.8fr)]">
        <section className="rounded-2xl border border-blue-300/15 bg-[#080d19]/80 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">Realized performance</h2><p className="mt-1 text-xs text-slate-500">Calculated from the trades visible under the current filters.</p></div><div className="flex rounded-lg border border-white/[.07] bg-black/20 p-1">{(['ALL', '30D', '90D'] as const).map((value) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`rounded-md px-3 py-1.5 text-[10px] font-semibold transition ${period === value ? 'bg-violet-500/20 text-violet-200' : 'text-slate-500 hover:text-white'}`}>{value === 'ALL' ? 'All time' : value}</button>)}</div></div>
          <JournalChart trades={filteredTrades}/>
        </section>
        <section className="rounded-2xl border border-blue-300/15 bg-[#080d19]/80 p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">Trade outcomes</h2><p className="mt-1 text-xs text-slate-500">Distribution · filtered records</p></div><span className="rounded-lg border border-white/[.07] bg-black/20 px-2 py-1 text-[10px] text-slate-400">{filteredTrades.length} trades</span></div>{filteredTrades.length ? <><div className="flex h-3 overflow-hidden rounded-full bg-white/5"><span className="bg-emerald-400" style={{ width: `${wins.length / filteredTrades.length * 100}%` }}/><span className="bg-slate-500" style={{ width: `${breakeven.length / filteredTrades.length * 100}%` }}/><span className="bg-rose-400" style={{ width: `${losses.length / filteredTrades.length * 100}%` }}/></div><div className="mt-5 space-y-3">{[['Wins', wins.length, 'bg-emerald-400'], ['Break even', breakeven.length, 'bg-slate-500'], ['Losses', losses.length, 'bg-rose-400']].map(([label, count, color]) => <div key={String(label)} className="flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${color}`}/><span className="flex-1 text-slate-400">{label}</span><span className="tabular-nums text-white">{count}</span></div>)}</div><div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/[.06] pt-4">{[['Average win', averageWin], ['Average loss', averageLoss], ['Best trade', bestTrade?.pnlValue ?? null], ['Worst trade', worstTrade?.pnlValue ?? null]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-white/[.025] p-2.5"><p className="text-[10px] text-slate-500">{label}</p><p className={`mt-1 text-xs font-semibold tabular-nums ${typeof value !== 'number' ? 'text-slate-500' : value >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{typeof value === 'number' ? money(value) : '—'}</p></div>)}</div></> : <p className="py-12 text-center text-sm text-slate-500">No trade outcomes for this selection.</p>}</section>
      </div>

      <section className="rounded-2xl border border-blue-300/15 bg-[#080d19]/80 p-4 sm:p-5"><div className="mb-4"><h2 className="text-sm font-semibold text-white">Performance by instrument</h2><p className="mt-1 text-xs text-slate-500">Realized results for the current account, date, and outcome filters.</p></div>{instrumentPerformance.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{instrumentPerformance.map((item) => <div key={item.instrument} className="flex items-center gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-violet-300/10 bg-violet-500/[.08] text-[10px] font-semibold text-violet-200">{item.instrument.slice(0, 3)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{item.instrument}</p><p className="mt-1 text-[10px] text-slate-500">{item.count} trades · {item.winRate.toFixed(0)}% wins</p></div><p className={`text-xs font-semibold tabular-nums ${item.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(item.pnl)}</p></div>)}</div> : <p className="py-6 text-center text-sm text-slate-500">No instruments in the selected records.</p>}</section>

      <section className="overflow-hidden rounded-2xl border border-blue-300/15 bg-[#080d19]/80">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.06] p-4 sm:p-5"><div><h2 className="text-sm font-semibold text-white">Trade history</h2><p className="mt-1 text-xs text-slate-500">Select a row to inspect its recorded execution details.</p></div><div className="text-xs text-slate-500"><span className="text-white">{filteredTrades.length}</span> visible</div></div>
        <div className="flex flex-wrap gap-2 border-b border-white/[.05] p-3 sm:p-4">
          <label className="relative min-w-[190px] flex-1 sm:max-w-xs"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input aria-label="Search trades" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search symbol, ticket, notes…" className={`${controlClass} w-full pl-9`}/></label>
          {accounts.length > 0 && <select aria-label="Filter by account" value={selectedAccountFilter} onChange={(event) => { setSelectedAccountFilter(event.target.value); if (event.target.value !== 'ALL') onSelectAccount?.(event.target.value); }} className={controlClass}><option value="ALL">All accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>}
          <select aria-label="Filter by instrument" value={instrumentFilter} onChange={(event) => setInstrumentFilter(event.target.value)} className={controlClass}><option value="ALL">All instruments</option>{instruments.map((instrument) => <option key={instrument} value={instrument}>{instrument}</option>)}</select>
          <select aria-label="Filter by outcome" value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value)} className={controlClass}><option value="ALL">All outcomes</option><option value="WIN">Wins</option><option value="LOSS">Losses</option><option value="BE">Break even</option></select>
          <select aria-label="Filter by direction" value={sideFilter} onChange={(event) => setSideFilter(event.target.value)} className={controlClass}><option value="ALL">Buy &amp; sell</option><option value="BUY">Buy</option><option value="SELL">Sell</option></select>
          <button type="button" onClick={() => setSortNewest((value) => !value)} className={`${controlClass} inline-flex items-center gap-2`}><ArrowUpDown size={13}/>{sortNewest ? 'Newest' : 'Oldest'}</button>
        </div>
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[860px] border-collapse text-left"><thead className="sticky top-0 z-[1] bg-[#0b1120] text-[9px] uppercase tracking-[.12em] text-slate-500"><tr>{['Instrument / ticket', 'Date & time', 'Side', 'Size', 'Entry', 'Outcome', 'Result', 'Realized P&L', 'Account'].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 font-medium">{heading}</th>)}</tr></thead><tbody className="divide-y divide-white/[.045]">{filteredTrades.map((trade) => <tr key={trade.id} tabIndex={0} aria-label={`${trade.instrument} ${trade.side} trade details`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectTrade(trade); } }} onClick={() => onSelectTrade(trade)} className={`cursor-pointer transition-colors hover:bg-violet-500/[.055] focus:bg-violet-500/[.08] focus:outline-none ${selectedTrade?.id === trade.id ? 'bg-violet-500/[.08]' : ''}`}><td className="px-4 py-3"><strong className="block text-xs font-semibold text-white">{trade.instrument}</strong><span className="mt-1 block max-w-32 truncate font-mono text-[9px] text-slate-600">{trade.id}</span></td><td className="whitespace-nowrap px-4 py-3 text-[11px] text-slate-400">{trade.time}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[9px] font-bold ${trade.side === 'BUY' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}>{trade.side}</span></td><td className="px-4 py-3 text-xs tabular-nums text-slate-300">{trade.lots || '—'}</td><td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-300">{trade.entry || '—'}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[9px] font-bold ${trade.outcome === 'WIN' ? 'bg-emerald-400/10 text-emerald-300' : trade.outcome === 'LOSS' ? 'bg-rose-400/10 text-rose-300' : 'bg-slate-500/15 text-slate-300'}`}>{trade.outcome === 'BE' ? 'BREAK EVEN' : trade.outcome}</span></td><td className="px-4 py-3 text-xs tabular-nums text-cyan-200">{trade.rMultiple || '—'}</td><td className={`px-4 py-3 text-xs font-semibold tabular-nums ${trade.pnlValue > 0 ? 'text-emerald-300' : trade.pnlValue < 0 ? 'text-rose-300' : 'text-slate-300'}`}>{money(trade.pnlValue)}</td><td className="max-w-36 truncate px-4 py-3 text-[11px] text-slate-400">{accountName(trade.accountId) || '—'}</td></tr>)}{filteredTrades.length === 0 && <tr><td colSpan={9} className="px-5 py-16 text-center"><Clock3 className="mx-auto mb-3 text-slate-600" size={22}/><p className="text-sm text-slate-300">No trades match these filters</p><p className="mt-1 text-xs text-slate-500">Adjust the filters or sync/import recorded trades.</p><div className="mt-4 flex justify-center gap-2">{targetSyncAccount && onSyncPastTrades && <button type="button" onClick={() => void handleSync()} className="rounded-lg border border-violet-400/20 px-3 py-2 text-xs text-violet-200">Sync past deals</button>}{onOpenImportModal && <button type="button" onClick={onOpenImportModal} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Import statement</button>}</div></td></tr>}</tbody></table>
        </div>
      </section>

      {selectedTrade && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#02040a]/70 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onSelectTrade(null); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="trade-detail-title" className="nova-dialog-enter max-h-[min(740px,92dvh)] w-full max-w-lg overflow-y-auto rounded-2xl border border-violet-300/20 bg-[linear-gradient(145deg,rgba(15,21,40,.98),rgba(5,9,18,.99))] p-5 shadow-[0_30px_100px_rgba(0,0,0,.65),0_0_40px_rgba(124,58,237,.12)] sm:p-6"><div className="mb-5 flex items-start justify-between gap-4 border-b border-white/[.07] pb-4"><div className="min-w-0"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.2em] text-violet-300">Execution detail</p><h2 id="trade-detail-title" className="truncate text-lg font-semibold text-white">{selectedTrade.instrument} · {selectedTrade.side}</h2><p className="mt-1 truncate font-mono text-[10px] text-slate-500">{selectedTrade.id}</p></div><div className="flex items-center gap-2"><span className={`rounded-lg px-2.5 py-1.5 text-[9px] font-bold ${selectedTrade.outcome === 'WIN' ? 'bg-emerald-400/10 text-emerald-300' : selectedTrade.outcome === 'LOSS' ? 'bg-rose-400/10 text-rose-300' : 'bg-slate-500/15 text-slate-300'}`}>{selectedTrade.outcome === 'BE' ? 'BREAK EVEN' : selectedTrade.outcome}</span><button ref={closeRef} type="button" aria-label="Close trade details" onClick={() => onSelectTrade(null)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/[.08] text-slate-400 transition hover:bg-white/[.06] hover:text-white"><X size={16}/></button></div></div><div className="mb-4 grid grid-cols-2 gap-3"><div className="rounded-xl border border-white/[.07] bg-black/20 p-3"><span className="text-[9px] uppercase tracking-wider text-slate-500">Realized P&amp;L</span><p className={`mt-1 text-lg font-semibold tabular-nums ${selectedTrade.pnlValue >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(selectedTrade.pnlValue)}</p></div><div className="rounded-xl border border-white/[.07] bg-black/20 p-3"><span className="text-[9px] uppercase tracking-wider text-slate-500">Risk multiple</span><p className="mt-1 text-lg font-semibold tabular-nums text-cyan-200">{selectedTrade.rMultiple || '—'}</p></div></div><dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-white/[.06] bg-white/[.02] p-4">{[['Account', accountName(selectedTrade.accountId)], ['Direction', selectedTrade.side], ['Date & time', selectedTrade.time], ['Volume', selectedTrade.lots], ['Entry price', selectedTrade.entry], ['Exit price', selectedTrade.exit], ['Market session', selectedTrade.session], ['Hold duration', selectedTrade.holdDuration], ['Fees / commission', selectedTrade.fees], ['Setup quality', selectedTrade.quality], ['Discipline', selectedTrade.discipline]].filter(([, value]) => Boolean(value) && value !== 'Unknown' && value !== 'Not reported' && value !== 'Not reviewed').map(([label, value]) => <div key={String(label)}><dt className="text-[9px] uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 break-words text-xs text-slate-200">{value}</dd></div>)}</dl>{selectedTrade.notes && <section className="mt-4 rounded-xl border border-violet-300/10 bg-violet-500/[.045] p-4"><h3 className="text-[9px] font-semibold uppercase tracking-[.15em] text-violet-200">Journal notes</h3><p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{selectedTrade.notes}</p></section>}{onDeleteTrade && <div className="mt-5 flex justify-end"><button type="button" onClick={() => { onDeleteTrade(selectedTrade.id); onSelectTrade(null); }} className="rounded-lg border border-rose-400/15 px-3 py-2 text-xs text-rose-300 transition hover:bg-rose-400/10">Remove trade record</button></div>}</div></div>}

      {showAddModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}><div role="dialog" aria-modal="true" aria-label="Log trade" onClick={(event) => event.stopPropagation()} className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-violet-300/15 bg-[#0b101d] p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold text-white">Log a trade</h3><button type="button" aria-label="Close" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white"><X size={17}/></button></div><form onSubmit={handleCreateTrade} className="flex flex-col gap-3"><div className="grid grid-cols-2 gap-3"><label className="text-[10px] text-slate-400">Instrument<select value={newInstrument} onChange={(event) => setNewInstrument(event.target.value as typeof newInstrument)} className={`${controlClass} mt-1 w-full`}><option>XAUUSD</option><option>EURUSD</option><option>US100</option><option>GBPUSD</option></select></label><label className="text-[10px] text-slate-400">Side<select value={newSide} onChange={(event) => setNewSide(event.target.value as typeof newSide)} className={`${controlClass} mt-1 w-full`}><option>BUY</option><option>SELL</option></select></label><label className="text-[10px] text-slate-400">Entry price<input value={newEntry} onChange={(event) => setNewEntry(event.target.value)} className={`${controlClass} mt-1 w-full`}/></label><label className="text-[10px] text-slate-400">Position size<input value={newLots} onChange={(event) => setNewLots(event.target.value)} className={`${controlClass} mt-1 w-full`}/></label><label className="text-[10px] text-slate-400">Outcome<select value={newOutcome} onChange={(event) => setNewOutcome(event.target.value as typeof newOutcome)} className={`${controlClass} mt-1 w-full`}><option>WIN</option><option>LOSS</option><option>BE</option></select></label><label className="text-[10px] text-slate-400">Result (R)<input type="number" step="0.1" value={newR} onChange={(event) => setNewR(event.target.value)} className={`${controlClass} mt-1 w-full`}/></label><label className="col-span-2 text-[10px] text-slate-400">Realized P&amp;L<input type="number" step="0.01" value={newPnl} onChange={(event) => setNewPnl(event.target.value)} className={`${controlClass} mt-1 w-full`}/></label><label className="col-span-2 text-[10px] text-slate-400">Strategy / setup<input value={newQuality} onChange={(event) => setNewQuality(event.target.value)} className={`${controlClass} mt-1 w-full`}/></label><label className="col-span-2 text-[10px] text-slate-400">Notes<textarea rows={3} value={newNotes} onChange={(event) => setNewNotes(event.target.value)} className={`${controlClass} mt-1 w-full resize-y`}/></label></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowAddModal(false)} className="px-3 py-2 text-xs text-slate-400">Cancel</button><button type="submit" className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white">Save trade</button></div></form></div></div>}
    </div>
  );
};
