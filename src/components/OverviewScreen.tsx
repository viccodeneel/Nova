import React from 'react';
import { PropAccount, TradeExecution } from '../data/terminalData';

interface OverviewScreenProps {
  activeAccount: PropAccount;
  trades: TradeExecution[];
  onSync: () => void;
  onOpenImportModal: () => void;
  onNavigateToJournal: () => void;
}

const money = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const OverviewScreen: React.FC<OverviewScreenProps> = ({
  activeAccount,
  trades,
  onSync,
  onOpenImportModal,
  onNavigateToJournal,
}) => {
  const accountTrades = trades.filter((trade) => trade.accountId === activeAccount.id);
  const recentTrades = accountTrades.slice(0, 5);
  const progress = activeAccount.targetProfit > 0
    ? Math.max(0, Math.min(100, (activeAccount.netProfit / activeAccount.targetProfit) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <section className="terminal-glass rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Account overview</h1>
          <p className="mt-1 text-sm text-slate-400">{activeAccount.name} · {activeAccount.shortRef}</p>
          <p className="mt-2 text-xs text-slate-400">
            MT5 {activeAccount.isRealConnected ? 'connected' : 'disconnected'} · {activeAccount.phase}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onSync} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white">Sync from MT5</button>
          <button type="button" onClick={onOpenImportModal} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200">Import statement</button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Balance', money(activeAccount.currentBalance)],
          ['Equity', money(activeAccount.liveEquity)],
          ['Net P&L', money(activeAccount.netProfit)],
          ['Trades synced', String(accountTrades.length)],
        ].map(([label, value]) => (
          <div key={label} className="terminal-glass rounded-xl p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="terminal-glass rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Prop phase progress</h2>
            <p className="mt-1 text-sm text-slate-400">{activeAccount.phase} · {activeAccount.targetPercent}% target</p>
          </div>
          <span className="text-sm text-slate-300">{progress.toFixed(1)}%</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-purple-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-400">Profit {money(activeAccount.netProfit)} of {money(activeAccount.targetProfit)}</p>
      </section>

      <section className="terminal-glass rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-white">Recent trades</h2>
          <button type="button" onClick={onNavigateToJournal} className="text-sm text-purple-300">Open journal</button>
        </div>
        {recentTrades.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No trades recorded for this account.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Time</th><th>Symbol</th><th>Side</th><th>Result</th></tr></thead>
              <tbody>{recentTrades.map((trade) => <tr key={trade.id} className="border-t border-white/10 text-slate-300"><td className="py-3">{trade.time}</td><td>{trade.instrument || '—'}</td><td>{trade.side}</td><td>{trade.netPnl || '—'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
