import React, { useState } from 'react';
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
  onSyncPastTrades?: (accountId: string, count?: number) => void;
  onOpenImportModal?: () => void;
}

export const TradeJournalScreen: React.FC<TradeJournalScreenProps> = ({
  trades,
  selectedTrade,
  accounts = [],
  activeAccountId,
  onSelectAccount,
  onSelectTrade,
  onAddTrade,
  onDeleteTrade,
  onSyncPastTrades,
  onOpenImportModal,
}) => {
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>(
    activeAccountId || 'ALL'
  );
  const [instrumentFilter, setInstrumentFilter] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);

  // Form states for manual trade logging
  const [newInstrument, setNewInstrument] = useState<'XAUUSD' | 'EURUSD' | 'US100' | 'GBPUSD'>(
    'XAUUSD'
  );
  const [newSide, setNewSide] = useState<'BUY' | 'SELL'>('BUY');
  const [newEntry, setNewEntry] = useState('');
  const [newLots, setNewLots] = useState('');
  const [newOutcome, setNewOutcome] = useState<'WIN' | 'LOSS' | 'BE'>('BE');
  const [newR, setNewR] = useState('');
  const [newPnl, setNewPnl] = useState('');
  const [newQuality, setNewQuality] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Filter trades by selected account, instrument, outcome, and search query
  const filteredTrades = trades.filter((t) => {
    if (selectedAccountFilter !== 'ALL') {
      if (t.accountId && t.accountId !== selectedAccountFilter) return false;
    }
    if (instrumentFilter !== 'ALL' && t.instrument !== instrumentFilter) return false;
    if (outcomeFilter !== 'ALL' && t.outcome !== outcomeFilter) return false;
    if (
      searchQuery.trim() &&
      !`${t.id} ${t.instrument} ${t.quality} ${t.notes} ${t.time}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const currentFilteredAccount = accounts.find((a) => a.id === selectedAccountFilter);
  const targetSyncAccount = currentFilteredAccount || accounts.find((a) => a.id === activeAccountId) || accounts[0];

  const handleSyncCurrentAccount = (count: number = 5) => {
    if (!targetSyncAccount || !onSyncPastTrades) return;
    setSyncing(true);
    setTimeout(() => {
      onSyncPastTrades(targetSyncAccount.id, count);
      setSyncing(false);
    }, 400);
  };

  const handleCreateTrade = (e: React.FormEvent) => {
    e.preventDefault();
    const rVal = parseFloat(newR) || 0;
    const pnlVal = parseFloat(newPnl) || 0;
    const signedR = newOutcome === 'LOSS' ? -Math.abs(rVal) : newOutcome === 'BE' ? 0 : Math.abs(rVal);
    const signedPnl =
      newOutcome === 'LOSS' ? -Math.abs(pnlVal) : newOutcome === 'BE' ? 0 : Math.abs(pnlVal);

    const created: TradeExecution = {
      id: `MT5-${Math.floor(88425 + Math.random() * 900)}`,
      accountId: targetSyncAccount?.id,
      time: 'Just now',
      instrument: newInstrument,
      side: newSide,
      entry: newEntry,
      lots: newLots,
      outcome: newOutcome,
      rMultiple: `${signedR >= 0 ? '+' : ''}${signedR.toFixed(1)}R`,
      rValue: signedR,
      netPnl: `${signedPnl >= 0 ? '+' : '-'}$${Math.abs(signedPnl).toFixed(2)}`,
      pnlValue: signedPnl,
      quality: newQuality,
      discipline: '100% (6/6)',
      disciplineScore: 100,
      session: 'London / NY Overlap',
      holdDuration: '22 mins',
      fees: '-$1.70',
      notes: newNotes,
      rulesPassed: 6,
    };
    onAddTrade(created);
    setShowAddModal(false);
    onSelectTrade(created);
  };

  // Quick stats for the filtered set
  const filteredWins = filteredTrades.filter((t) => t.outcome === 'WIN');
  const filteredPnl = filteredTrades.reduce((acc, t) => acc + t.pnlValue, 0);
  const filteredR = filteredTrades.reduce((acc, t) => acc + t.rValue, 0);
  const filteredWinRate =
    filteredTrades.length > 0
      ? `${Math.round((filteredWins.length / filteredTrades.length) * 100)}%`
      : '--';

  return (
    <div className="flex flex-col w-full gap-5">
      {/* Top Header Card */}
      <div className="terminal-glass rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-headline-sm text-lg font-bold text-white">
              Institutional Trade Journal &amp; Audit Trail
            </span>
            <span className="font-label-tech text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-bold">
              {filteredTrades.length} VERIFIED {filteredTrades.length === 1 ? 'DEAL' : 'DEALS'}
            </span>
          </div>
          <span className="font-body-sm text-xs text-slate-400 mt-0.5 block">
            Filter by connected MT5 account, inspect tick logs, R-multiples, and review past executed trades
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Account Filter Dropdown */}
          {accounts.length > 0 && (
            <div className="flex items-center bg-[#07090f] border border-white/10 rounded-xl px-2.5 py-1.5">
              <span className="material-symbols-outlined text-sm text-purple-400 mr-1.5">
                account_balance
              </span>
              <select
                value={selectedAccountFilter}
                onChange={(e) => {
                  setSelectedAccountFilter(e.target.value);
                  if (e.target.value !== 'ALL' && onSelectAccount) {
                    onSelectAccount(e.target.value);
                  }
                }}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer font-label-tech"
              >
                <option value="ALL">All Connected Accounts</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.shortRef || acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sync Past Trades button */}
          {targetSyncAccount && onSyncPastTrades && (
            <button
              type="button"
              disabled={syncing}
              onClick={() => handleSyncCurrentAccount(5)}
              className="px-3 py-2 rounded-xl bg-purple-500/15 border border-purple-500/35 hover:bg-purple-500/25 text-purple-300 font-label-tech text-[11px] font-bold transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">
                {syncing ? 'sync' : 'download'}
              </span>
              <span>{syncing ? 'Syncing...' : 'Sync Past MT5 Deals'}</span>
            </button>
          )}

          {/* Import Statement button */}
          {onOpenImportModal && (
            <button
              type="button"
              onClick={onOpenImportModal}
              className="px-3 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/35 hover:bg-cyan-500/25 text-cyan-300 font-label-tech text-[11px] font-bold transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">upload_file</span>
              <span>Import MT5 Report</span>
            </button>
          )}

          {/* Log Manual Execution */}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-label-tech text-[11px] font-bold hover:brightness-110 shadow-[0_0_15px_rgba(139,92,246,0.4)] transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            <span>Log Trade</span>
          </button>
        </div>
      </div>

      {/* Filter Chips & Metrics Bar */}
      <div className="terminal-glass-subtle rounded-xl p-3.5 border border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ticket, symbol, notes..."
            className="bg-[#07090f] border border-white/10 rounded-xl px-3 py-1.5 font-body-sm text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60"
          />

          <div className="flex items-center bg-black/40 border border-white/[0.08] p-1 rounded-xl">
            {['ALL', 'XAUUSD', 'EURUSD', 'US100', 'GBPUSD'].map((inst) => (
              <button
                key={inst}
                type="button"
                onClick={() => setInstrumentFilter(inst)}
                className={
                  instrumentFilter === inst
                    ? 'px-2.5 py-1 rounded-lg bg-purple-600/40 border border-purple-500/40 text-purple-200 font-bold font-label-tech text-[10px]'
                    : 'px-2.5 py-1 rounded-lg text-slate-400 hover:text-white font-label-tech text-[10px]'
                }
              >
                {inst}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-black/40 border border-white/[0.08] p-1 rounded-xl">
            {['ALL', 'WIN', 'LOSS', 'BE'].map((out) => (
              <button
                key={out}
                type="button"
                onClick={() => setOutcomeFilter(out)}
                className={
                  outcomeFilter === out
                    ? 'px-2.5 py-1 rounded-lg bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-bold font-label-tech text-[10px]'
                    : 'px-2.5 py-1 rounded-lg text-slate-400 hover:text-white font-label-tech text-[10px]'
                }
              >
                {out}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Telemetry Strip */}
        <div className="flex items-center gap-4 text-xs font-label-numeric-sm tabular-nums">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Win Rate:</span>
            <span className="font-bold text-white">{filteredWinRate}</span>
          </div>
          <div className="h-3 w-px bg-white/10"></div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Net R:</span>
            <span className="font-bold text-cyan-300">
              {filteredR >= 0 ? '+' : ''}{filteredR.toFixed(1)}R
            </span>
          </div>
          <div className="h-3 w-px bg-white/10"></div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Net Realized:</span>
            <span
              className={`font-bold ${
                filteredPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {filteredPnl >= 0 ? '+' : '-'}${Math.abs(filteredPnl).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Table & Inspector Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div
          className={`${
            selectedTrade ? 'xl:col-span-8' : 'xl:col-span-12'
          } terminal-glass rounded-2xl p-6 overflow-hidden`}
        >
          <div className="w-full overflow-x-auto rounded-xl border border-white/[0.06] bg-[#090b12]/60">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="font-label-tech text-[10px] text-slate-400 uppercase bg-white/[0.02] border-b border-white/[0.06]">
                  <th className="py-2.5 px-3.5">Ticket #</th>
                  <th className="py-2.5 px-3.5">Time (UTC)</th>
                  <th className="py-2.5 px-3.5">Symbol</th>
                  <th className="py-2.5 px-3.5">Side</th>
                  <th className="py-2.5 px-3.5">Volume</th>
                  <th className="py-2.5 px-3.5">Entry</th>
                  <th className="py-2.5 px-3.5">Outcome</th>
                  <th className="py-2.5 px-3.5">R-Multiple</th>
                  <th className="py-2.5 px-3.5">Net P&amp;L</th>
                  <th className="py-2.5 px-3.5">Setup Quality</th>
                  <th className="py-2.5 px-3.5">DLM Rules</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] font-body-sm text-xs">
                {filteredTrades.length > 0 ? (
                  filteredTrades.map((trade) => {
                    const isWin = trade.outcome === 'WIN';
                    const isLoss = trade.outcome === 'LOSS';
                    const isSelected = selectedTrade?.id === trade.id;
                    return (
                      <tr
                        key={trade.id}
                        onClick={() => onSelectTrade(trade)}
                        className={`transition-colors cursor-pointer ${
                          isSelected ? 'bg-purple-500/15' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="py-3 px-3.5 font-label-numeric-sm text-[11px] text-purple-300 tabular-nums">
                          {trade.id}
                        </td>
                        <td className="py-3 px-3.5 font-label-numeric-sm text-[11px] text-slate-400 tabular-nums">
                          {trade.time}
                        </td>
                        <td className="py-3 px-3.5 font-label-numeric-sm text-xs font-bold text-white">
                          {trade.instrument}
                        </td>
                        <td className="py-3 px-3.5">
                          {trade.side === 'BUY' ? (
                            <span className="font-label-tech text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                              BUY
                            </span>
                          ) : (
                            <span className="font-label-tech text-[10px] font-bold text-rose-400 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30">
                              SELL
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-slate-300 tabular-nums">
                          {trade.lots || '0.25'}
                        </td>
                        <td className="py-3 px-3.5 font-label-numeric-sm text-xs text-slate-200 tabular-nums font-mono">
                          {trade.entry}
                        </td>
                        <td className="py-3 px-3.5">
                          {isWin ? (
                            <span className="font-label-tech text-[10px] font-bold text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30">
                              WIN
                            </span>
                          ) : isLoss ? (
                            <span className="font-label-tech text-[10px] font-bold text-rose-400 px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/30">
                              LOSS
                            </span>
                          ) : (
                            <span className="font-label-tech text-[10px] font-bold text-slate-300 px-2 py-0.5 rounded bg-white/10 border border-white/20">
                              BE
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-3 px-3.5 font-label-numeric-sm text-xs font-bold tabular-nums ${
                            isWin
                              ? 'text-emerald-400'
                              : isLoss
                              ? 'text-rose-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {trade.rMultiple}
                        </td>
                        <td
                          className={`py-3 px-3.5 font-label-numeric-sm text-xs font-bold tabular-nums ${
                            isWin
                              ? 'text-emerald-400'
                              : isLoss
                              ? 'text-rose-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {trade.netPnl}
                        </td>
                        <td className="py-3 px-3.5 font-label-tech text-[10px] text-purple-300 font-semibold">
                          {trade.quality}
                        </td>
                        <td className="py-3 px-3.5">
                          <span
                            className={`font-label-numeric-sm text-xs font-semibold tabular-nums ${
                              trade.disciplineScore === 100
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {trade.discipline}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <span className="material-symbols-outlined text-4xl text-slate-500 mb-2">
                          receipt_long
                        </span>
                        <span className="font-headline-sm text-sm text-slate-300 font-semibold">
                          No Past Trades Found for this Filter
                        </span>
                        <p className="font-body-sm text-xs text-slate-500 max-w-sm mt-1 mb-4">
                          If trades were taken on this MT5 account, you can sync past closed deals, import your report file, or log an execution.
                        </p>
                        <div className="flex items-center gap-2.5">
                          {targetSyncAccount && onSyncPastTrades && (
                            <button
                              type="button"
                              onClick={() => handleSyncCurrentAccount(5)}
                              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-label-tech text-xs font-bold transition-all flex items-center gap-1.5"
                            >
                              <span className="material-symbols-outlined text-sm">download</span>
                              <span>Sync 5 Past Deals</span>
                            </button>
                          )}
                          {onOpenImportModal && (
                            <button
                              type="button"
                              onClick={onOpenImportModal}
                              className="px-3.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-200 font-label-tech text-xs font-bold transition-all flex items-center gap-1.5"
                            >
                              <span className="material-symbols-outlined text-sm">upload_file</span>
                              <span>Import Statement</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowAddModal(true)}
                            className="px-3.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-200 font-label-tech text-xs font-bold transition-all"
                          >
                            + Manual Entry
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Trade Telemetry Inspector */}
        {selectedTrade && (
          <div className="xl:col-span-4 terminal-glass rounded-2xl p-6 flex flex-col gap-4 relative">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <span className="font-label-tech text-[10px] text-purple-300 uppercase">
                  EXECUTION TELEMETRY INSPECTOR
                </span>
                <h3 className="font-headline-sm text-base font-bold text-white mt-0.5">
                  {selectedTrade.instrument} • {selectedTrade.side} ({selectedTrade.id})
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                {onDeleteTrade && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteTrade(selectedTrade.id);
                      onSelectTrade(null);
                    }}
                    title="Delete this trade record"
                    className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 flex items-center justify-center transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelectTrade(null)}
                  className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] flex items-center justify-center text-slate-400 hover:text-white"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
                <span className="font-label-tech text-[9px] text-slate-400 uppercase">
                  Realized P&amp;L
                </span>
                <div
                  className={`font-label-numeric-lg text-xl font-bold mt-0.5 tabular-nums ${
                    selectedTrade.pnlValue >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {selectedTrade.netPnl}
                </div>
              </div>
              <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
                <span className="font-label-tech text-[9px] text-slate-400 uppercase">
                  R-Multiple
                </span>
                <div className="font-label-numeric-lg text-xl font-bold text-cyan-300 mt-0.5 tabular-nums">
                  {selectedTrade.rMultiple}
                </div>
              </div>
              <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
                <span className="font-label-tech text-[9px] text-slate-400 uppercase">
                  Volume / Lots
                </span>
                <div className="font-label-numeric-md text-sm font-bold text-white mt-0.5">
                  {selectedTrade.lots || '0.25'} lots
                </div>
              </div>
              <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
                <span className="font-label-tech text-[9px] text-slate-400 uppercase">
                  DLM Compliance
                </span>
                <div className="font-label-numeric-md text-sm font-bold text-emerald-400 mt-0.5">
                  {selectedTrade.discipline}
                </div>
              </div>
            </div>

            <div className="terminal-glass-subtle p-3.5 rounded-xl border border-white/[0.05]">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">Execution Entry:</span>
                <span className="font-mono text-white font-bold">{selectedTrade.entry}</span>
              </div>
              {selectedTrade.exit && (
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-400">Exit Price:</span>
                  <span className="font-mono text-slate-300">{selectedTrade.exit}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">Session Window:</span>
                <span className="text-purple-300 font-semibold">{selectedTrade.session}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Fees / Comms:</span>
                <span className="text-rose-400">{selectedTrade.fees}</span>
              </div>
            </div>

            <div className="terminal-glass-subtle p-4 rounded-xl border border-white/[0.05]">
              <span className="font-label-tech text-[10px] text-purple-300 uppercase block mb-1.5 font-bold">
                Post-Trade Cognitive Audit Notes
              </span>
              <p className="font-body-sm text-xs text-slate-300 leading-relaxed">
                {selectedTrade.notes}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Manual Trade Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="terminal-glass rounded-2xl p-6 w-full max-w-md border border-white/15">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline-sm text-base font-bold text-white">
                Log MT5 Execution
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateTrade} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                    Instrument
                  </label>
                  <select
                    value={newInstrument}
                    onChange={(e) =>
                      setNewInstrument(
                        e.target.value as 'XAUUSD' | 'EURUSD' | 'US100' | 'GBPUSD'
                      )
                    }
                    className="w-full bg-[#07090f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="XAUUSD">XAUUSD (Gold)</option>
                    <option value="EURUSD">EURUSD</option>
                    <option value="US100">US100 (Nasdaq)</option>
                    <option value="GBPUSD">GBPUSD</option>
                  </select>
                </div>
                <div>
                  <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                    Side
                  </label>
                  <select
                    value={newSide}
                    onChange={(e) => setNewSide(e.target.value as 'BUY' | 'SELL')}
                    className="w-full bg-[#07090f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                    Entry Price
                  </label>
                  <input
                    type="text"
                    value={newEntry}
                    onChange={(e) => setNewEntry(e.target.value)}
                    className="w-full bg-[#07090f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                    Lots
                  </label>
                  <input
                    type="text"
                    value={newLots}
                    onChange={(e) => setNewLots(e.target.value)}
                    className="w-full bg-[#07090f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                    Outcome
                  </label>
                  <select
                    value={newOutcome}
                    onChange={(e) => setNewOutcome(e.target.value as 'WIN' | 'LOSS' | 'BE')}
                    className="w-full bg-[#07090f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="WIN">WIN</option>
                    <option value="LOSS">LOSS</option>
                    <option value="BE">BE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                    R-Multiple (R)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newR}
                    onChange={(e) => setNewR(e.target.value)}
                    className="w-full bg-[#07090f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                    Net P&amp;L ($)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={newPnl}
                    onChange={(e) => setNewPnl(e.target.value)}
                    className="w-full bg-[#07090f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                  Setup Notes &amp; Rationale
                </label>
                <textarea
                  rows={3}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full bg-[#07090f] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-label-tech text-xs font-bold"
                >
                  Save Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
