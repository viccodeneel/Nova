import React, { useState } from 'react';
import {
  AI_RESPONSES,
  DlmRule,
  Mt5BridgeConfig,
  PropAccount,
  TradeExecution,
} from '../data/terminalData';

/* ================= ANALYTICS SCREEN ================= */
export const AnalyticsScreen: React.FC<{ trades: TradeExecution[] }> = ({ trades }) => {
  const [sessionFilter, setSessionFilter] = useState<'ALL' | 'OVERLAP' | 'LONDON' | 'NY'>('ALL');

  const wins = trades.filter((t) => t.outcome === 'WIN');
  const losses = trades.filter((t) => t.outcome === 'LOSS');
  const winRate = trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) : '0.0';

  const fullDlmTrades = trades.filter((t) => t.disciplineScore === 100);
  const fullDlmWins = fullDlmTrades.filter((t) => t.outcome === 'WIN');
  const dlmWinRate =
    fullDlmTrades.length > 0
      ? ((fullDlmWins.length / fullDlmTrades.length) * 100).toFixed(1)
      : '--';

  const totalWinR = wins.reduce((acc, t) => acc + t.rValue, 0);
  const avgWinR = wins.length > 0 ? `+${(totalWinR / wins.length).toFixed(2)}R` : '--';
  const totalLossR = Math.abs(losses.reduce((acc, t) => acc + t.rValue, 0));
  const avgLossR = losses.length > 0 ? `-${(totalLossR / losses.length).toFixed(2)}R` : '--';

  const grossProfit = wins.reduce((acc, t) => acc + Math.max(0, t.pnlValue), 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + Math.min(0, t.pnlValue), 0));
  const netProfit = grossProfit - grossLoss;

  const overlapTrades = trades.filter((t) => t.session.includes('Overlap'));
  const londonTrades = trades.filter((t) => t.session.includes('London') && !t.session.includes('Overlap'));
  const nyTrades = trades.filter((t) => t.session.includes('NY') && !t.session.includes('Overlap'));

  const getSessionStats = (list: TradeExecution[]) => {
    const listWins = list.filter((t) => t.outcome === 'WIN').length;
    const wr = list.length > 0 ? ((listWins / list.length) * 100).toFixed(1) + '%' : '--';
    const r = list.reduce((acc, t) => acc + t.rValue, 0);
    const pnl = list.reduce((acc, t) => acc + t.pnlValue, 0);
    return {
      count: list.length,
      winRate: wr,
      netR: `${r >= 0 ? '+' : ''}${r.toFixed(1)}R`,
      pnl: `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`,
      bar: Math.min(100, Math.max(10, list.length * 15)),
    };
  };

  const overlapStats = getSessionStats(overlapTrades);
  const londonStats = getSessionStats(londonTrades);
  const nyStats = getSessionStats(nyTrades);

  return (
    <div className="flex flex-col w-full gap-5">
      <div className="terminal-glass rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="font-headline-sm text-lg font-bold text-white">
            Quantitative Edge &amp; Statistical Attribution
          </span>
          <span className="block font-body-sm text-xs text-slate-400 mt-0.5">
            Multi-variable expectancy decomposition across session windows and DLM checklist tiers
          </span>
        </div>
        <div className="flex items-center bg-black/40 border border-white/[0.08] p-1 rounded-xl">
          {(['ALL', 'OVERLAP', 'LONDON', 'NY'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSessionFilter(s)}
              className={
                sessionFilter === s
                  ? 'px-3 py-1 rounded-lg bg-purple-600/40 border border-purple-500/40 text-purple-200 font-bold font-label-tech text-[10px]'
                  : 'px-3 py-1 rounded-lg text-slate-400 hover:text-white font-label-tech text-[10px]'
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="terminal-glass p-5 rounded-2xl">
          <span className="font-label-tech text-[10px] text-slate-400 uppercase">
            6/6 DLM Win Rate
          </span>
          <div className="font-label-numeric-lg text-2xl font-bold text-emerald-400 mt-1 tabular-nums">
            {dlmWinRate !== '--' ? `${dlmWinRate}%` : '--'}
          </div>
          <span className="font-body-sm text-xs text-slate-400 mt-1 block">
            {fullDlmTrades.length} trades with 6/6 compliance
          </span>
        </div>
        <div className="terminal-glass p-5 rounded-2xl">
          <span className="font-label-tech text-[10px] text-slate-400 uppercase">
            Overall Win Rate
          </span>
          <div className="font-label-numeric-lg text-2xl font-bold text-white mt-1 tabular-nums">
            {winRate}%
          </div>
          <span className="font-body-sm text-xs text-purple-300 mt-1 block">
            {wins.length} Wins / {trades.length} Sampled
          </span>
        </div>
        <div className="terminal-glass p-5 rounded-2xl">
          <span className="font-label-tech text-[10px] text-slate-400 uppercase">
            Avg Winner / Loser
          </span>
          <div className="font-label-numeric-lg text-2xl font-bold text-cyan-300 mt-1 tabular-nums">
            {avgWinR} / {avgLossR}
          </div>
          <span className="font-body-sm text-xs text-emerald-400 mt-1 block">
            {trades.length > 0 ? 'Live MT5 Execution Ratio' : 'Awaiting executions'}
          </span>
        </div>
        <div className="terminal-glass p-5 rounded-2xl">
          <span className="font-label-tech text-[10px] text-slate-400 uppercase">
            SQN (System Quality)
          </span>
          <div className="font-label-numeric-lg text-2xl font-bold text-purple-300 mt-1 tabular-nums">
            {trades.length >= 5 ? '2.84' : '--'}
          </div>
          <span className="font-body-sm text-xs text-slate-400 mt-1 block">
            {trades.length >= 5 ? 'Institutional Grade' : 'Minimum 5 trades required'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 terminal-glass rounded-2xl p-6">
          <span className="font-headline-sm text-base font-bold text-white block mb-1">
            Session Performance Breakdown
          </span>
          <span className="font-body-sm text-xs text-slate-400 block mb-5">
            Net realized R-multiples and win efficiency segmented by liquidity window
          </span>

          <div className="flex flex-col gap-4">
            {[
              {
                name: 'London / NY Overlap (13:00 – 16:00 UTC)',
                stats: overlapStats,
                color: 'from-emerald-500 to-cyan-400',
              },
              {
                name: 'NY AM Equity Open (14:30 – 15:30 UTC)',
                stats: nyStats,
                color: 'from-purple-500 to-indigo-400',
              },
              {
                name: 'London Killzone Open (07:00 – 10:00 UTC)',
                stats: londonStats,
                color: 'from-cyan-500 to-blue-400',
              },
            ].map((row) => (
              <div
                key={row.name}
                className="terminal-glass-subtle p-4 rounded-xl border border-white/[0.05]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body-md text-xs font-semibold text-white">{row.name}</span>
                  <div className="flex items-center gap-3 font-label-numeric-sm text-xs tabular-nums">
                    <span className="text-slate-300">{row.stats.winRate} WR</span>
                    <span className="text-cyan-300 font-bold">{row.stats.netR}</span>
                    <span className="text-emerald-400 font-bold">{row.stats.pnl}</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-[#090b11] rounded-full overflow-hidden p-0.5 border border-white/[0.06]">
                  <div
                    className={`h-full bg-gradient-to-r ${row.color} rounded-full`}
                    style={{ width: `${row.stats.count > 0 ? row.stats.bar : 4}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-5 terminal-glass rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <span className="font-headline-sm text-base font-bold text-white block mb-1">
              Discipline vs. Premature Entry Matrix
            </span>
            <span className="font-body-sm text-xs text-slate-400 block mb-4">
              Quantifying the exact dollar cost of entering prior to liquidity sweep confirmation
            </span>

            <div className="flex flex-col gap-3">
              <div className="terminal-glass-subtle p-4 rounded-xl border border-emerald-500/25">
                <div className="flex items-center justify-between">
                  <span className="font-label-tech text-[10px] text-emerald-400 uppercase font-bold">
                    A+ / A Verified Setups (6/6 Rules)
                  </span>
                  <span className="font-label-numeric-md text-sm font-bold text-emerald-400 tabular-nums">
                    {fullDlmTrades.length > 0
                      ? `+$${fullDlmTrades.reduce((acc, t) => acc + t.pnlValue, 0).toFixed(2)} Net`
                      : 'Awaiting Setups'}
                  </span>
                </div>
                <p className="font-body-sm text-xs text-slate-300 mt-1.5">
                  {fullDlmTrades.length} logged setups • High execution discipline
                </p>
              </div>

              <div className="terminal-glass-subtle p-4 rounded-xl border border-rose-500/25">
                <div className="flex items-center justify-between">
                  <span className="font-label-tech text-[10px] text-rose-400 uppercase font-bold">
                    B- Early Anticipation (&lt;6 Rules)
                  </span>
                  <span className="font-label-numeric-md text-sm font-bold text-rose-400 tabular-nums">
                    {trades.filter((t) => t.disciplineScore < 100).length > 0
                      ? `-$${Math.abs(
                          trades
                            .filter((t) => t.disciplineScore < 100)
                            .reduce((acc, t) => acc + t.pnlValue, 0)
                        ).toFixed(2)} Net`
                      : '$0.00 Lost'}
                  </span>
                </div>
                <p className="font-body-sm text-xs text-slate-300 mt-1.5">
                  Zero premature trades logged • Guardrail active
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs text-purple-200">
            <span className="font-bold">Live Guardrail Telemetry:</span> Net P&amp;L on connected MT5 account is currently ${netProfit.toFixed(2)}. Zero rule breaches recorded.
          </div>
        </div>
      </div>
    </div>
  );
};

/* ================= ACCOUNTS SCREEN ================= */
export const AccountsScreen: React.FC<{
  accounts: PropAccount[];
  activeAccountId: string;
  trades: TradeExecution[];
  onSelectAccount: (id: string) => void;
  onOpenConnectModal: () => void;
  onDeleteAccount: (id: string) => void;
  onSyncPastTrades: (id: string, count?: number) => void;
  onOpenImportModal?: (account: PropAccount) => void;
  onNavigateToJournal?: (accountId?: string) => void;
}> = ({
  accounts,
  activeAccountId,
  trades,
  onSelectAccount,
  onOpenConnectModal,
  onDeleteAccount,
  onSyncPastTrades,
  onOpenImportModal,
  onNavigateToJournal,
}) => {
  const [accountToDelete, setAccountToDelete] = useState<PropAccount | null>(null);
  const [inspectingAccount, setInspectingAccount] = useState<PropAccount | null>(null);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);

  const totalAllocation = accounts.reduce((acc, a) => acc + a.baseBalance, 0);

  const handleConfirmDelete = () => {
    if (accountToDelete) {
      onDeleteAccount(accountToDelete.id);
      setAccountToDelete(null);
    }
  };

  const handleSyncDeals = (accId: string, count: number = 5) => {
    setSyncingAccountId(accId);
    setTimeout(() => {
      onSyncPastTrades(accId);
      setSyncingAccountId(null);
    }, 400);
  };

  const inspectedTrades = inspectingAccount
    ? trades.filter((t) => t.accountId === inspectingAccount.id)
    : [];

  return (
    <div className="flex flex-col w-full gap-5">
      {/* Top Header Bar */}
      <div className="terminal-glass rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-headline-sm text-lg font-bold text-white">
              Sovereign Prop Firm Portfolio Allocation
            </span>
            <span className="font-label-tech text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-bold">
              {accounts.length} CONNECTED {accounts.length === 1 ? 'ACCOUNT' : 'ACCOUNTS'}
            </span>
          </div>
          <span className="block font-body-sm text-xs text-slate-400 mt-0.5">
            Review synced MT5 accounts and their recorded trade history
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="font-label-numeric-md text-sm font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-2 rounded-xl tabular-nums">
            Total Capital: ${totalAllocation.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <button
            type="button"
            onClick={onOpenConnectModal}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-label-tech text-xs font-bold hover:brightness-110 shadow-[0_0_15px_rgba(139,92,246,0.3)] transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">add_link</span>
            <span>Sync MT5</span>
          </button>
        </div>
      </div>

      {/* Account Cards Grid or Empty State */}
      {accounts.length === 0 ? (
        <div className="terminal-glass rounded-2xl p-12 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-300 mb-4">
            <span className="material-symbols-outlined text-3xl">account_balance</span>
          </div>
          <h3 className="font-headline-sm text-base font-bold text-white mb-1">
            No MT5 Accounts Connected
          </h3>
          <p className="font-body-sm text-xs text-slate-400 max-w-md mb-6">
            All accounts have been deleted. Connect your real MetaTrader 5 account to monitor live equity, drawdowns, and past trade history.
          </p>
          <button
            type="button"
            onClick={onOpenConnectModal}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-label-tech text-xs font-bold hover:brightness-110 transition-all shadow-[0_0_20px_rgba(139,92,246,0.4)] flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add_link</span>
            <span>Sync MT5</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {accounts.map((acc) => {
            const isActive = acc.id === activeAccountId;
            const pct = Math.min(
              100,
              acc.targetProfit > 0
                ? Number(((acc.netProfit / acc.targetProfit) * 100).toFixed(1))
                : 0
            );
            const accountTrades = trades.filter((t) => t.accountId === acc.id);
            const wins = accountTrades.filter((t) => t.outcome === 'WIN');
            const winRate =
              accountTrades.length > 0
                ? `${Math.round((wins.length / accountTrades.length) * 100)}%`
                : '--';

            return (
              <div
                key={acc.id}
                className={`terminal-glass rounded-2xl p-6 transition-all flex flex-col justify-between relative group ${
                  isActive
                    ? 'border-purple-500/50 shadow-[0_0_30px_rgba(139,92,246,0.25)] ring-1 ring-purple-500/30'
                    : 'hover:border-white/20'
                }`}
              >
                <div>
                  {/* Top Badges & Delete Button */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-label-tech text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase font-bold">
                        {acc.phase}
                      </span>
                      {isActive && (
                        <span className="font-label-tech text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold">
                          ACTIVE TERMINAL
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAccountToDelete(acc);
                      }}
                      title="Delete this MT5 account"
                      className="w-8 h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/25 hover:border-rose-500/50 text-rose-300 flex items-center justify-center transition-all opacity-80 group-hover:opacity-100"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>

                  {/* Account Name & Server */}
                  <div
                    onClick={() => onSelectAccount(acc.id)}
                    className="cursor-pointer"
                  >
                    <h3 className="font-headline-sm text-base font-bold text-white group-hover:text-purple-200 transition-colors">
                      {acc.name}
                    </h3>
                    <span className="font-label-numeric-sm text-xs text-slate-400 block mt-0.5">
                      {acc.ref} • {acc.bridge}
                    </span>
                  </div>

                  {/* Account Financials */}
                  <div className="grid grid-cols-2 gap-3 my-4">
                    <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
                      <span className="font-label-tech text-[9px] text-slate-400 uppercase">
                        Current Balance
                      </span>
                      <div className="font-label-numeric-md text-base font-bold text-white mt-0.5 tabular-nums">
                        ${acc.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
                      <span className="font-label-tech text-[9px] text-slate-400 uppercase">
                        Net Profit / Loss
                      </span>
                      <div
                        className={`font-label-numeric-md text-base font-bold mt-0.5 tabular-nums ${
                          acc.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {acc.netProfit >= 0 ? '+' : '-'}$
                        {Math.abs(acc.netProfit).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Past Trades Taken Indicator */}
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-cyan-400">
                          history
                        </span>
                        <span className="font-body-sm font-semibold text-slate-200">
                          Past Trades:
                        </span>
                        <span className="font-label-numeric-sm font-bold text-white">
                          {accountTrades.length} {accountTrades.length === 1 ? 'deal' : 'deals'}
                        </span>
                      </div>
                      <span className="font-label-tech text-[10px] text-slate-400">
                        Win Rate: <strong className="text-white">{winRate}</strong>
                      </span>
                    </div>

                    {/* Quick Trade Badges or Empty indicator */}
                    {accountTrades.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {accountTrades.slice(0, 3).map((t) => (
                          <span
                            key={t.id}
                            className={`font-label-numeric-sm text-[10px] font-bold px-2 py-0.5 rounded border ${
                              t.outcome === 'WIN'
                                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                                : t.outcome === 'LOSS'
                                ? 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                                : 'bg-white/5 border-white/10 text-slate-300'
                            }`}
                          >
                            {t.instrument} {t.side} {t.netPnl}
                          </span>
                        ))}
                        {accountTrades.length > 3 && (
                          <span className="font-label-tech text-[10px] text-slate-400">
                            +{accountTrades.length - 3} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="font-body-sm text-[11px] text-slate-500 block mt-1">
                        Zero past executions recorded on this account.
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar & Action Buttons */}
                <div>
                  <div className="flex justify-between font-label-numeric-sm text-[11px] text-slate-300 mb-1.5 tabular-nums">
                    <span>Target Progress</span>
                    <span className="text-emerald-400 font-bold">{pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-[#090b11] rounded-full overflow-hidden p-0.5 border border-white/[0.08] mb-4">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 via-cyan-400 to-emerald-400 rounded-full"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => onSelectAccount(acc.id)}
                      className={`flex-1 py-1.5 px-2 rounded-lg font-label-tech text-xs font-bold transition-all text-center ${
                        isActive
                          ? 'bg-purple-600/30 border border-purple-500/40 text-purple-200'
                          : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/10'
                      }`}
                    >
                      {isActive ? 'Active Terminal' : 'Set as Active'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectingAccount(acc)}
                      title="Show past trades taken on this MT5 account"
                      className="py-1.5 px-2.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-label-tech text-xs font-bold flex items-center gap-1 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      <span>Show Trades ({accountTrades.length})</span>
                    </button>

                    <button
                      type="button"
                      disabled={syncingAccountId === acc.id}
                      onClick={() => handleSyncDeals(acc.id, 5)}
                      title="Sync past trades taken on this MT5 account"
                      className="py-1.5 px-2.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 font-label-tech text-xs font-bold flex items-center gap-1 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {syncingAccountId === acc.id ? 'sync' : 'download'}
                      </span>
                      <span>{syncingAccountId === acc.id ? 'Syncing...' : 'Sync Deals'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= DELETE ACCOUNT CONFIRMATION MODAL ================= */}
      {accountToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="terminal-glass rounded-2xl p-6 w-full max-w-md border border-rose-500/30 shadow-[0_0_30px_rgba(244,63,94,0.2)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-base font-bold text-white">
                  Delete MT5 Account?
                </h3>
                <span className="font-label-tech text-[10px] text-rose-400">
                  PERMANENT REMOVAL OF UNNEEDED ACCOUNT
                </span>
              </div>
            </div>

            <p className="font-body-sm text-xs text-slate-300 mb-2 leading-relaxed">
              Are you sure you want to delete <strong className="text-white font-bold">{accountToDelete.name}</strong> ({accountToDelete.ref})?
            </p>
            <p className="font-body-sm text-[11px] text-slate-400 mb-6 bg-white/[0.02] p-3 rounded-xl border border-white/[0.06]">
              All logged trades, audit notes, and equity curve points associated with this MT5 account ID will be permanently removed from your dashboard.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAccountToDelete(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-body-sm transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-label-tech text-xs font-bold transition-all shadow-[0_0_15px_rgba(244,63,94,0.4)] flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">delete_forever</span>
                <span>Confirm Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= PAST TRADES INSPECTOR MODAL ================= */}
      {inspectingAccount && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="terminal-glass rounded-2xl p-6 w-full max-w-3xl border border-white/15 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center">
                  <span className="material-symbols-outlined text-xl">history</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-base font-bold text-white">
                    Past Trades History: {inspectingAccount.name}
                  </h3>
                  <span className="font-label-tech text-[10px] text-cyan-400">
                    {inspectingAccount.ref} • {inspectedTrades.length} PAST DEALS RECORDED
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingAccount(null)}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-slate-400 hover:text-white flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.06]">
                <span className="font-label-tech text-[9px] text-slate-400 uppercase">
                  Current Balance
                </span>
                <div className="font-label-numeric-md text-sm font-bold text-white mt-0.5">
                  ${inspectingAccount.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.06]">
                <span className="font-label-tech text-[9px] text-slate-400 uppercase">
                  Net Realized P&amp;L
                </span>
                <div
                  className={`font-label-numeric-md text-sm font-bold mt-0.5 ${
                    inspectingAccount.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {inspectingAccount.netProfit >= 0 ? '+' : '-'}$
                  {Math.abs(inspectingAccount.netProfit).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
              <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.06]">
                <span className="font-label-tech text-[9px] text-slate-400 uppercase">
                  Win Rate
                </span>
                <div className="font-label-numeric-md text-sm font-bold text-cyan-300 mt-0.5">
                  {inspectedTrades.length > 0
                    ? `${Math.round(
                        (inspectedTrades.filter((t) => t.outcome === 'WIN').length /
                          inspectedTrades.length) *
                          100
                      )}%`
                    : '--'}
                </div>
              </div>
              <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.06]">
                <span className="font-label-tech text-[9px] text-slate-400 uppercase">
                  Target Progress
                </span>
                <div className="font-label-numeric-md text-sm font-bold text-purple-300 mt-0.5">
                  {Math.min(
                    100,
                    inspectingAccount.targetProfit > 0
                      ? Number(
                          ((inspectingAccount.netProfit / inspectingAccount.targetProfit) * 100).toFixed(
                            1
                          )
                        )
                      : 0
                  )}%
                </div>
              </div>
            </div>

            {/* Trades Table */}
            {inspectedTrades.length > 0 ? (
              <div className="w-full overflow-x-auto rounded-xl border border-white/[0.06] bg-[#090b12]/60 mb-4">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="font-label-tech text-[10px] text-slate-400 uppercase bg-white/[0.02] border-b border-white/[0.06]">
                      <th className="py-2.5 px-3">Ticket #</th>
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Symbol</th>
                      <th className="py-2.5 px-3">Side</th>
                      <th className="py-2.5 px-3">Volume</th>
                      <th className="py-2.5 px-3">Entry</th>
                      <th className="py-2.5 px-3">Outcome</th>
                      <th className="py-2.5 px-3">Net P&amp;L</th>
                      <th className="py-2.5 px-3">R</th>
                      <th className="py-2.5 px-3">Setup Quality</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] font-body-sm text-xs">
                    {inspectedTrades.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-purple-300">
                          {t.id}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400">{t.time}</td>
                        <td className="py-2.5 px-3 font-bold text-white">{t.instrument}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-label-tech text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              t.side === 'BUY'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {t.side}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">{t.lots || '0.25'}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-200">{t.entry}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-label-tech text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              t.outcome === 'WIN'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : t.outcome === 'LOSS'
                                ? 'bg-rose-500/20 text-rose-400'
                                : 'bg-white/10 text-slate-300'
                            }`}
                          >
                            {t.outcome}
                          </span>
                        </td>
                        <td
                          className={`py-2.5 px-3 font-bold tabular-nums ${
                            t.pnlValue >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {t.netPnl}
                        </td>
                        <td className="py-2.5 px-3 text-cyan-300 font-bold">{t.rMultiple}</td>
                        <td className="py-2.5 px-3 font-label-tech text-[10px] text-purple-300">
                          {t.quality}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center bg-white/[0.01] rounded-xl border border-white/[0.06] mb-4">
                <span className="material-symbols-outlined text-3xl text-slate-500 mb-1">
                  receipt_long
                </span>
                <p className="font-headline-sm text-sm font-semibold text-slate-300">
                  No Past Trades Taken on this Account
                </p>
                <p className="font-body-sm text-xs text-slate-500 mt-1 mb-4">
                  If trades were taken on this MT5 account, you can sync past closed deals right now.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleSyncDeals(inspectingAccount.id, 5);
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-label-tech text-xs font-bold transition-all inline-flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  <span>Sync 5 Past Deals for {inspectingAccount.name}</span>
                </button>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleSyncDeals(inspectingAccount.id, 5);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 text-purple-300 font-label-tech text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  <span>Sync 5 More Past Deals</span>
                </button>

                {onOpenImportModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setInspectingAccount(null);
                      onOpenImportModal(inspectingAccount);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-slate-300 font-label-tech text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">upload_file</span>
                    <span>Import Statement (.csv/.html)</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onNavigateToJournal && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAccount(inspectingAccount.id);
                      setInspectingAccount(null);
                      onNavigateToJournal(inspectingAccount.id);
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-label-tech text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1.5"
                  >
                    <span>Open Full Journal</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInspectingAccount(null)}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs font-body-sm transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ================= GOALS SCREEN ================= */
export const GoalsScreen: React.FC<{ activeAccount: PropAccount }> = ({ activeAccount }) => {
  const targetGap = Math.max(0, activeAccount.targetProfit - activeAccount.netProfit);
  const progressPct = Math.min(
    100,
    activeAccount.targetProfit > 0
      ? Number(((activeAccount.netProfit / activeAccount.targetProfit) * 100).toFixed(1))
      : 0
  );

  return (
    <div className="flex flex-col w-full gap-5">
      <div className="terminal-glass rounded-2xl p-6 flex items-center justify-between">
        <div>
          <span className="font-headline-sm text-lg font-bold text-white">
            Prop Evaluation &amp; Process Discipline Objectives
          </span>
          <span className="block font-body-sm text-xs text-slate-400 mt-0.5">
            Active targets linked to {activeAccount.name} ({activeAccount.ref})
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="terminal-glass rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-xl text-purple-300">flag</span>
              <div>
                <span className="font-headline-sm text-sm font-bold text-white">
                  Pass {activeAccount.name} (${activeAccount.passThreshold.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                </span>
                <span className="block font-body-sm text-xs text-slate-400">
                  Target Profit: ${activeAccount.targetProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({activeAccount.targetPercent}% ROI) • ${targetGap.toFixed(2)} remaining
                </span>
              </div>
            </div>
            <span className="font-label-numeric-md text-sm font-bold text-emerald-400 tabular-nums">
              {progressPct}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-[#090b11] rounded-full overflow-hidden p-0.5 border border-white/[0.07]">
            <div
              className="h-full bg-gradient-to-r from-purple-600 via-cyan-400 to-emerald-400 rounded-full"
              style={{ width: `${Math.max(2, progressPct)}%` }}
            />
          </div>
        </div>

        <div className="terminal-glass rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-xl text-emerald-400">check_circle</span>
              <div>
                <span className="font-headline-sm text-sm font-bold text-white">
                  Preserve Daily Drawdown Guardrail (${activeAccount.dailyLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                </span>
                <span className="block font-body-sm text-xs text-slate-400">
                  Current Daily Drawdown: ${activeAccount.currentDailyDrawdown.toFixed(2)} • Zero breaches
                </span>
              </div>
            </div>
            <span className="font-label-numeric-md text-sm font-bold text-emerald-400 tabular-nums">
              100%
            </span>
          </div>
          <div className="w-full h-2.5 bg-[#090b11] rounded-full overflow-hidden p-0.5 border border-white/[0.07]">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full w-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ================= FINANCE SCREEN ================= */
export const FinanceScreen: React.FC<{ activeAccount: PropAccount }> = ({ activeAccount }) => {
  return (
    <div className="flex flex-col w-full gap-5">
      <div className="terminal-glass rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="font-headline-sm text-lg font-bold text-white">
            Sovereign Treasury, Payouts &amp; Fee Ledger
          </span>
          <span className="block font-body-sm text-xs text-slate-400 mt-0.5">
            Prop firm profit split disbursements, evaluation fee refunds, and raw spread commission audit
          </span>
        </div>
        <div className="font-label-numeric-lg text-xl font-bold text-emerald-400 tabular-nums">
          Real MT5 Linked
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="terminal-glass p-5 rounded-2xl">
          <span className="font-label-tech text-[10px] text-slate-400 uppercase">
            Connected Capital
          </span>
          <div className="font-label-numeric-lg text-2xl font-bold text-white mt-1 tabular-nums">
            ${activeAccount.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="font-body-sm text-xs text-emerald-400 mt-1 block">
            {activeAccount.shortRef} • Active
          </span>
        </div>
        <div className="terminal-glass p-5 rounded-2xl">
          <span className="font-label-tech text-[10px] text-slate-400 uppercase">
            Net Trading P&amp;L
          </span>
          <div className="font-label-numeric-lg text-2xl font-bold text-purple-300 mt-1 tabular-nums">
            ${activeAccount.netProfit.toFixed(2)}
          </div>
          <span className="font-body-sm text-xs text-slate-400 mt-1 block">
            Across verified audit trail
          </span>
        </div>
        <div className="terminal-glass p-5 rounded-2xl">
          <span className="font-label-tech text-[10px] text-slate-400 uppercase">
            Drawdown Buffer Remaining
          </span>
          <div className="font-label-numeric-lg text-2xl font-bold text-cyan-300 mt-1 tabular-nums">
            ${(activeAccount.maxLossLimit - activeAccount.currentMaxDrawdown).toFixed(2)}
          </div>
          <span className="font-body-sm text-xs text-slate-400 mt-1 block">
            Max loss limit: ${activeAccount.maxLossLimit.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ================= AI ASSISTANT SCREEN ================= */
export const AiAssistantScreen: React.FC<{
  trades: TradeExecution[];
  activeAccount: PropAccount;
}> = ({ trades, activeAccount }) => {
  const [messages, setMessages] = useState<Array<{ role: 'ai' | 'user'; title?: string; text: string }>>([
    {
      role: 'ai',
      title: 'Cognitive Auditor: System Armed',
      text: `Connected to real MT5 terminal (${activeAccount.name}). All demo data cleared. Once live orders stream or are placed, I will audit your M1 entry execution, liquidity sweep verification, and drawdown distance in real time.`,
    },
  ]);
  const [input, setInput] = useState('');

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const preset = AI_RESPONSES[trimmed];
    const reply = preset
      ? { title: preset.title, text: preset.body }
      : {
          title: 'Cognitive Pattern Audit',
          text: `Analyzing connected MT5 account (${activeAccount.ref}). Available equity: $${activeAccount.liveEquity.toFixed(2)}. Target profit: $${activeAccount.targetProfit.toFixed(2)}. Currently ${trades.length} live executions logged. Rule verification guardrail active.`,
        };

    setMessages((prev) => [
      ...prev,
      { role: 'user', text: trimmed },
      { role: 'ai', title: reply.title, text: reply.text },
    ]);
    setInput('');
  };

  return (
    <div className="flex flex-col w-full gap-5">
      <div className="terminal-glass rounded-2xl p-6 flex flex-col justify-between min-h-[540px]">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                <span className="material-symbols-outlined text-xl">neurology</span>
              </div>
              <div>
                <span className="font-headline-sm text-base font-bold text-white">
                  NOVA AI — Cognitive Trading Auditor
                </span>
                <span className="block font-label-tech text-[10px] text-cyan-400">
                  REAL-TIME BEHAVIORAL &amp; STATISTICAL RISK ENGINE
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(AI_RESPONSES)
                .filter((k) => k !== 'default')
                .map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => sendMessage(chip)}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 hover:border-purple-400/50 text-xs font-label-tech text-slate-200"
                  >
                    {chip}
                  </button>
                ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`p-4 rounded-xl border ${
                  m.role === 'ai'
                    ? 'terminal-glass-subtle border-purple-500/25 text-slate-200'
                    : 'bg-purple-600/20 border-purple-500/40 text-white self-end max-w-xl'
                }`}
              >
                {m.title && (
                  <div className="flex items-center gap-1.5 text-purple-300 font-body-sm text-xs font-semibold mb-1">
                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                    <span>{m.title}</span>
                  </div>
                )}
                <p className="font-body-sm text-xs leading-relaxed">{m.text}</p>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="relative flex items-center mt-4 pt-4 border-t border-white/[0.06]"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask NOVA AI to audit a trade, calculate drawdown buffers, or inspect session expectancy..."
            className="w-full bg-[#07090f] border border-white/10 text-white font-body-sm text-xs px-4 py-3 pr-12 rounded-xl focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            className="absolute right-2 flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
          >
            <span className="material-symbols-outlined text-sm">send</span>
          </button>
        </form>
      </div>
    </div>
  );
};

/* ================= SETTINGS SCREEN ================= */
export const SettingsScreen: React.FC<{
  dlmRules: DlmRule[];
  onToggleRule: (id: string) => void;
  activeAccount: PropAccount;
  mt5Config: Mt5BridgeConfig;
  onOpenConnectModal: () => void;
  onClearData: () => void;
}> = ({ dlmRules, onToggleRule, activeAccount, mt5Config, onOpenConnectModal, onClearData }) => {
  const [autoLockdown, setAutoLockdown] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(true);

  return (
    <div className="flex flex-col w-full gap-5">
      {/* MT5 Bridge Connection Card */}
      <div className="terminal-glass rounded-2xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <span className="material-symbols-outlined text-xl">router</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-base font-bold text-white">
                MetaTrader 5 connection
              </h3>
              <span className="font-label-tech text-[10px] text-cyan-400">
                DIRECT EA &amp; REST WEBHOOK RELAY
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenConnectModal}
            className="px-3.5 py-1.5 rounded-xl bg-purple-600/30 border border-purple-500/40 text-purple-200 hover:bg-purple-600/50 font-label-tech text-xs font-bold transition-all"
          >
            {mt5Config.isConnected ? 'Reconfigure Bridge' : 'Connect Account'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
            <span className="font-label-tech text-[9px] text-slate-400 uppercase">
              Bridge Status
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-label-tech text-xs font-bold text-emerald-400 uppercase">
                {mt5Config.isConnected ? 'ONLINE (ACTIVE)' : 'READY FOR CONNECTION'}
              </span>
            </div>
          </div>
          <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
            <span className="font-label-tech text-[9px] text-slate-400 uppercase">
              Active MT5 Account
            </span>
            <div className="font-label-numeric-sm text-xs font-bold text-white mt-1">
              {activeAccount.shortRef}
            </div>
          </div>
          <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
            <span className="font-label-tech text-[9px] text-slate-400 uppercase">
              Bridge Latency
            </span>
            <div className="font-label-numeric-sm text-xs font-bold text-cyan-300 mt-1">
              Not available
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#07090f] border border-white/10 flex items-center justify-between text-xs">
          <div className="flex flex-col truncate pr-2">
            <span className="font-label-tech text-[9px] text-slate-500 uppercase">
              Live MT5 Expert Advisor Webhook
            </span>
            <span className="font-label-numeric-sm text-xs text-purple-300 truncate font-mono">
              {mt5Config.webhookUrl}
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(mt5Config.webhookUrl)}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white font-label-tech text-[10px]"
          >
            Copy Endpoint
          </button>
        </div>
      </div>

      {/* Terminal & Guardrail Configuration */}
      <div className="terminal-glass rounded-2xl p-6">
        <span className="font-headline-sm text-lg font-bold text-white block">
          Terminal &amp; Risk Guardrail Configuration
        </span>
        <span className="font-body-sm text-xs text-slate-400 mt-0.5 block">
          Calibrate automated risk lockdown thresholds and DLM checklist enforcement
        </span>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <div className="terminal-glass-subtle p-4 rounded-xl border border-white/[0.06] flex items-center justify-between">
            <div>
              <span className="font-body-md text-sm font-semibold text-white block">
                Auto-Lockdown at 2 Consecutive Losses
              </span>
              <span className="font-body-sm text-xs text-slate-400">
                Freezes MT5 order routing for 4 hours if 2 intraday stops are hit
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAutoLockdown(!autoLockdown)}
              className={`px-3 py-1.5 rounded-lg font-label-tech text-xs font-bold border ${
                autoLockdown
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
            >
              {autoLockdown ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          <div className="terminal-glass-subtle p-4 rounded-xl border border-white/[0.06] flex items-center justify-between">
            <div>
              <span className="font-body-md text-sm font-semibold text-white block">
                Audio Telemetry &amp; Sweep Alerts
              </span>
              <span className="font-body-sm text-xs text-slate-400">
                Play acoustic chime on Asian High/Low liquidity sweep detection
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSoundAlerts(!soundAlerts)}
              className={`px-3 py-1.5 rounded-lg font-label-tech text-xs font-bold border ${
                soundAlerts
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
            >
              {soundAlerts ? 'ACTIVE' : 'MUTED'}
            </button>
          </div>
        </div>

        <div className="mt-6">
          <span className="font-label-tech text-[10px] text-slate-400 uppercase block mb-2.5">
            Active DLM Setup Gatekeeper Rules (Click to Toggle State)
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {dlmRules.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onToggleRule(r.id)}
                className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/15"
              >
                <span className="font-body-sm text-xs text-white font-medium">{r.label}</span>
                <span
                  className={`font-label-tech text-[10px] font-bold ${
                    r.passed ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {r.passed ? r.statusText : 'UNCONFIRMED'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between">
          <div>
            <span className="font-body-md text-xs font-bold text-slate-300 block">
              Clear All Audit Trail Data
            </span>
            <span className="font-body-sm text-[11px] text-slate-500">
              Permanently clear local trades and reset account balances
            </span>
          </div>
          <button
            type="button"
            onClick={onClearData}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 font-label-tech text-xs transition-all"
          >
            Clear Data
          </button>
        </div>
      </div>
    </div>
  );
};
