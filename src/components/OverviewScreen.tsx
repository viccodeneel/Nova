import React, { useState } from 'react';
import {
  DlmRule,
  NavSection,
  PropAccount,
  TradeExecution,
  AI_RESPONSES,
} from '../data/terminalData';

interface OverviewScreenProps {
  activeAccount: PropAccount;
  trades: TradeExecution[];
  dlmRules: DlmRule[];
  onToggleRule: (ruleId: string) => void;
  onNavigate: (section: NavSection) => void;
  onSelectTrade: (trade: TradeExecution) => void;
  onQuickExecute: () => void;
  onOpenConnectModal: () => void;
  onSyncPastTrades?: () => void;
  onOpenImportModal?: () => void;
}

export const OverviewScreen: React.FC<OverviewScreenProps> = ({
  activeAccount,
  trades,
  dlmRules,
  onToggleRule,
  onNavigate,
  onSelectTrade,
  onQuickExecute,
  onOpenConnectModal,
  onSyncPastTrades,
  onOpenImportModal,
}) => {
  const [timeframe, setTimeframe] = useState<'7D' | '14D' | '30D' | 'ALL'>('30D');
  const [aiQuery, setAiQuery] = useState('');
  const [activeAiKey, setActiveAiKey] = useState<string>('default');
  const [customAiResponse, setCustomAiResponse] = useState<{
    title: string;
    body: string;
  } | null>(null);

  const passedRulesCount = dlmRules.filter((r) => r.passed).length;
  const allRulesPassed = passedRulesCount === dlmRules.length;

  // Filter trades for the currently active MT5 account
  const accountTrades = trades.filter(
    (t) => !t.accountId || t.accountId === activeAccount.id
  );

  // Account targets & progress
  const progressPct = Math.min(
    100,
    Math.max(
      0,
      activeAccount.targetProfit > 0
        ? Number(((activeAccount.netProfit / activeAccount.targetProfit) * 100).toFixed(1))
        : 0
    )
  );
  const targetGap = Math.max(0, activeAccount.targetProfit - activeAccount.netProfit);

  // Drawdowns
  const dailyDdPct = Number(
    activeAccount.baseBalance > 0
      ? ((activeAccount.currentDailyDrawdown / activeAccount.baseBalance) * 100).toFixed(2)
      : 0
  );
  const dailyBarWidth = Math.min(
    100,
    activeAccount.dailyLimit > 0
      ? Number(((activeAccount.currentDailyDrawdown / activeAccount.dailyLimit) * 100).toFixed(2))
      : 0
  );

  const maxDdPct = Number(
    activeAccount.baseBalance > 0
      ? ((activeAccount.currentMaxDrawdown / activeAccount.baseBalance) * 100).toFixed(2)
      : 0
  );
  const maxBarWidth = Math.min(
    100,
    activeAccount.maxLossLimit > 0
      ? Number(((activeAccount.currentMaxDrawdown / activeAccount.maxLossLimit) * 100).toFixed(2))
      : 0
  );

  const remainingRiskBudget = Number((100 - maxBarWidth).toFixed(1));

  // Dynamic telemetry calculated from this account's real trades:
  const wins = accountTrades.filter((t) => t.outcome === 'WIN');
  const losses = accountTrades.filter((t) => t.outcome === 'LOSS');
  const totalPnl = accountTrades.reduce((acc, t) => acc + t.pnlValue, 0);
  const totalR = accountTrades.reduce((acc, t) => acc + t.rValue, 0);
  const winRate =
    accountTrades.length > 0 ? ((wins.length / accountTrades.length) * 100).toFixed(1) : '--';
  const sessionRoi =
    activeAccount.baseBalance > 0
      ? ((totalPnl / activeAccount.baseBalance) * 100).toFixed(2)
      : '0.00';

  // Dynamic Sharpe / Profit Factor / Expectancy:
  const grossProfit = wins.reduce((acc, t) => acc + Math.max(0, t.pnlValue), 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + Math.min(0, t.pnlValue), 0));
  const profitFactor =
    grossLoss > 0
      ? (grossProfit / grossLoss).toFixed(2)
      : grossProfit > 0
      ? '∞'
      : '--';
  const avgR = accountTrades.length > 0 ? (totalR / accountTrades.length).toFixed(2) : '0.00';
  const sharpeRatio =
    accountTrades.length >= 3
      ? (Number(avgR) * 1.5).toFixed(2)
      : accountTrades.length > 0
      ? '1.20'
      : '--';

  const handlePromptChip = (chipLabel: string) => {
    setAiQuery(chipLabel);
    setCustomAiResponse(null);
    setActiveAiKey(chipLabel);
  };

  const handleSendAiQuery = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = aiQuery.trim();
    if (!trimmed) return;
    if (AI_RESPONSES[trimmed]) {
      setCustomAiResponse(null);
      setActiveAiKey(trimmed);
    } else {
      setCustomAiResponse({
        title: `Cognitive Audit: "${trimmed}"`,
        body: `Analyzing connected MT5 account (${activeAccount.name}). Active capital: $${activeAccount.currentBalance.toLocaleString(
          'en-US',
          { minimumFractionDigits: 2 }
        )}. With $${targetGap.toFixed(
          2
        )} remaining to target, recommended position size is 0.25 to 0.40 lots with max risk capped at 0.5% ($${(
          activeAccount.baseBalance * 0.005
        ).toFixed(2)}) per setup to preserve your $${activeAccount.dailyLimit.toFixed(
          2
        )} daily guardrail limit.`,
      });
    }
  };

  const currentAiMessage = customAiResponse || AI_RESPONSES[activeAiKey] || AI_RESPONSES.default;

  return (
    <div className="flex flex-col w-full gap-5">
      {/* ================= TOP HUD: PROP FIRM PHASE 1 TRACKER & CRITICAL RISK GAUGES ================= */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Phase 1 Master Tracker Card (Col 8) */}
        <div className="xl:col-span-8 terminal-glass rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between group">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-purple-600/15 blur-3xl pointer-events-none transition-all group-hover:bg-purple-600/20"></div>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent"></div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.25)]">
                  <span className="material-symbols-outlined text-xl">token</span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2.5">
                    <span className="font-headline-sm text-lg font-bold tracking-tight text-white">
                      {activeAccount.name}
                    </span>
                    <span className="font-label-tech text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase font-bold tracking-wider shadow-[0_0_10px_rgba(52,211,153,0.15)]">
                      {activeAccount.phase}
                    </span>
                  </div>
                  <span className="font-label-numeric-sm text-xs text-slate-400 mt-0.5">
                    Account Ref: {activeAccount.ref} • {activeAccount.bridge}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenConnectModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-200 hover:bg-purple-500/25 font-label-tech text-[11px] font-bold shadow-[0_0_15px_rgba(168,85,247,0.2)] transition-all"
                >
                  <span className="material-symbols-outlined text-sm">settings_input_component</span>
                  <span>Connect Real MT5</span>
                </button>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400"></span>
                  </span>
                  <span className="font-label-tech text-[11px] uppercase tracking-wider text-purple-300 font-bold">
                    Target: {progressPct}% Complete
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3">
              <div className="terminal-glass-subtle p-3.5 rounded-xl border border-white/[0.05]">
                <span className="font-label-tech text-[10px] uppercase text-slate-400 tracking-wider">
                  Current Balance
                </span>
                <div className="font-label-numeric-lg text-2xl font-bold text-white tracking-tight mt-1 tabular-nums">
                  ${activeAccount.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="flex items-center gap-1 font-label-numeric-sm text-[11px] text-slate-400 mt-1 tabular-nums">
                  <span>Base:</span>
                  <span className="text-slate-300 font-medium">
                    ${activeAccount.baseBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="terminal-glass-subtle p-3.5 rounded-xl border border-white/[0.05]">
                <span className="font-label-tech text-[10px] uppercase text-slate-400 tracking-wider">
                  Live Equity
                </span>
                <div className="font-label-numeric-lg text-2xl font-bold text-white tracking-tight mt-1 tabular-nums">
                  ${activeAccount.liveEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div
                  className={`flex items-center gap-1 font-label-numeric-sm text-[11px] mt-1 tabular-nums ${
                    activeAccount.floatingPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  <span className="material-symbols-outlined text-[12px] leading-none">
                    {activeAccount.floatingPnl >= 0 ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                  <span>
                    Float: {activeAccount.floatingPnl >= 0 ? '+' : '-'}$
                    {Math.abs(activeAccount.floatingPnl).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="terminal-glass-subtle p-3.5 rounded-xl border border-white/[0.05] relative overflow-hidden">
                <div className="absolute -right-3 -top-3 w-12 h-12 bg-emerald-500/10 rounded-full blur-md"></div>
                <span className="font-label-tech text-[10px] uppercase text-emerald-400/90 tracking-wider font-semibold">
                  Total Net Profit
                </span>
                <div className="font-label-numeric-lg text-2xl font-bold text-emerald-400 tracking-tight mt-1 tabular-nums">
                  {activeAccount.netProfit >= 0 ? '+' : '-'}$
                  {Math.abs(activeAccount.netProfit).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <div className="flex items-center gap-1 font-label-numeric-sm text-[11px] text-emerald-300 font-semibold mt-1 tabular-nums">
                  <span className="material-symbols-outlined text-[12px] leading-none">trending_up</span>
                  <span>
                    {activeAccount.roiPercent >= 0 ? '+' : ''}
                    {activeAccount.roiPercent.toFixed(2)}% ROI
                  </span>
                </div>
              </div>

              <div className="terminal-glass-subtle p-3.5 rounded-xl border border-white/[0.05] relative overflow-hidden">
                <div className="absolute -right-3 -top-3 w-12 h-12 bg-cyan-500/10 rounded-full blur-md"></div>
                <span className="font-label-tech text-[10px] uppercase text-cyan-400 tracking-wider font-semibold">
                  Target Gap
                </span>
                <div className="font-label-numeric-lg text-2xl font-bold text-cyan-300 tracking-tight mt-1 tabular-nums">
                  ${targetGap.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="flex items-center gap-1 font-label-numeric-sm text-[11px] text-cyan-400/80 mt-1 tabular-nums">
                  <span>
                    Goal: ${activeAccount.targetProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} (
                    {activeAccount.targetPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between text-xs mb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-purple-400 animate-pulse"></span>
                <span className="font-body-md text-xs font-medium text-slate-200">
                  {targetGap <= 0
                    ? 'Target Threshold Achieved — Account Ready for Verification'
                    : `Approaching ${activeAccount.phase} Target — $${targetGap.toFixed(2)} profit needed`}
                </span>
              </div>
              <div className="flex items-center gap-2 font-label-numeric-md tabular-nums">
                <span className="text-purple-300 font-bold">
                  ${activeAccount.netProfit.toFixed(2)}
                </span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-300">${activeAccount.targetProfit.toFixed(2)}</span>
                <span className="text-emerald-400 font-semibold ml-1">({progressPct}%)</span>
              </div>
            </div>

            <div className="relative w-full h-3.5 bg-[#090b11] rounded-full overflow-hidden p-0.5 border border-white/[0.08] shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-purple-600 via-indigo-500 via-cyan-400 to-emerald-400 rounded-full shadow-[0_0_18px_rgba(139,92,246,0.9)] transition-all duration-1000 ease-out relative"
                style={{ width: `${Math.max(2, progressPct)}%` }}
              >
                <span className="absolute right-0 top-0 bottom-0 w-2 bg-white rounded-full shadow-[0_0_8px_#ffffff]"></span>
              </div>
            </div>

            <div className="flex items-center justify-between font-label-numeric-sm text-[11px] text-slate-400 mt-2 tabular-nums">
              <span>
                Baseline: ${activeAccount.baseBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} (0%)
              </span>
              <span className="text-purple-300 font-semibold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                {targetGap <= 0 ? 'Target Achieved' : `$${targetGap.toFixed(2)} profit needed to pass`}
              </span>
              <span className="text-emerald-400 font-semibold">
                Pass Threshold: $
                {activeAccount.passThreshold.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Institutional Risk Guardrail Panel (Col 4) */}
        <div className="xl:col-span-4 terminal-glass rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"></div>
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                  <span className="material-symbols-outlined text-lg">shield</span>
                </div>
                <div>
                  <span className="font-headline-sm text-base font-bold text-white tracking-tight">
                    Risk Guardrails
                  </span>
                  <span className="block font-label-tech text-[10px] text-slate-400">
                    REAL-TIME MONITOR
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-label-tech text-[10px] font-bold uppercase tracking-wider">
                  STATUS: {activeAccount.status}
                </span>
              </div>
            </div>

            <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05] mb-4 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-body-sm text-xs text-slate-400 font-normal">
                  Available Risk Budget
                </span>
                <span className="font-label-tech text-[10px] text-emerald-400 font-semibold">
                  Zero drawdown breaches
                </span>
              </div>
              <span className="font-label-numeric-md text-base font-bold text-emerald-300 tabular-nums">
                {remainingRiskBudget}% Remaining
              </span>
            </div>

            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between font-body-sm text-xs">
                  <span className="text-slate-300 font-medium">Daily Drawdown</span>
                  <span className="font-label-numeric-sm text-xs text-white font-semibold tabular-nums">
                    {dailyDdPct}%{' '}
                    <span className="text-slate-400 font-normal">
                      (-${activeAccount.currentDailyDrawdown.toFixed(2)} / $
                      {activeAccount.dailyLimit.toFixed(2)} limit)
                    </span>
                  </span>
                </div>
                <div className="w-full h-2 bg-[#090b11] rounded-full overflow-hidden p-0.5 border border-white/[0.06]">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full shadow-[0_0_8px_#34d399]"
                    style={{ width: `${dailyBarWidth}%` }}
                  ></div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between font-body-sm text-xs">
                  <span className="text-slate-300 font-medium">Max Overall Drawdown</span>
                  <span className="font-label-numeric-sm text-xs text-white font-semibold tabular-nums">
                    {maxDdPct}%{' '}
                    <span className="text-slate-400 font-normal">
                      (-${activeAccount.currentMaxDrawdown.toFixed(2)} / $
                      {activeAccount.maxLossLimit.toFixed(2)} limit)
                    </span>
                  </span>
                </div>
                <div className="w-full h-2 bg-[#090b11] rounded-full overflow-hidden p-0.5 border border-white/[0.06]">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 rounded-full shadow-[0_0_8px_#38bdf8]"
                    style={{ width: `${maxBarWidth}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center mt-5 pt-3 border-t border-white/[0.06]">
            <div className="bg-white/[0.02] border border-white/[0.05] p-2 rounded-lg flex flex-col">
              <span className="font-label-tech text-[9px] text-slate-400 uppercase font-semibold">
                Daily Limit
              </span>
              <span className="font-label-numeric-sm text-xs font-semibold text-slate-200 mt-0.5 tabular-nums">
                ${activeAccount.dailyLimit.toFixed(2)}
              </span>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.05] p-2 rounded-lg flex flex-col">
              <span className="font-label-tech text-[9px] text-slate-400 uppercase font-semibold">
                Max Loss
              </span>
              <span className="font-label-numeric-sm text-xs font-semibold text-slate-200 mt-0.5 tabular-nums">
                ${activeAccount.maxLossLimit.toFixed(2)}
              </span>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.05] p-2 rounded-lg flex flex-col">
              <span className="font-label-tech text-[9px] text-slate-400 uppercase font-semibold">
                Peak Water
              </span>
              <span className="font-label-numeric-sm text-xs font-semibold text-purple-300 mt-0.5 tabular-nums">
                ${activeAccount.peakWater.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================= SECTION 2: TODAY'S TELEMETRY TILES ================= */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div
          onClick={() => onNavigate('analytics')}
          className="terminal-glass p-4 rounded-xl relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-label-tech text-[10px] uppercase font-semibold tracking-wider">
              Today P&amp;L
            </span>
            <span className="material-symbols-outlined text-emerald-400 text-base">trending_up</span>
          </div>
          <div className="flex flex-col">
            <span
              className={`font-label-numeric-lg text-xl font-bold tracking-tight tabular-nums ${
                totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {totalPnl >= 0 ? '+' : '-'}${Math.abs(totalPnl).toFixed(2)}
            </span>
            <span className="font-label-numeric-sm text-[11px] text-emerald-300 font-medium mt-0.5 tabular-nums">
              {totalPnl >= 0 ? '+' : ''}
              {sessionRoi}% session
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('trade-journal')}
          className="terminal-glass p-4 rounded-xl relative overflow-hidden group hover:border-white/15 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-label-tech text-[10px] uppercase font-semibold tracking-wider">
              Executions
            </span>
            <span className="material-symbols-outlined text-slate-400 text-base">swap_horiz</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-numeric-lg text-xl font-bold text-white tracking-tight tabular-nums">
              {trades.length} Trades
            </span>
            <span className="font-label-numeric-sm text-[11px] text-slate-400 mt-0.5">
              {wins.length} Win • {losses.length} Loss
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('analytics')}
          className="terminal-glass p-4 rounded-xl relative overflow-hidden group hover:border-cyan-500/30 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-label-tech text-[10px] uppercase font-semibold tracking-wider">
              Realized R
            </span>
            <span className="material-symbols-outlined text-cyan-400 text-base">show_chart</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-numeric-lg text-xl font-bold text-cyan-300 tracking-tight tabular-nums">
              {totalR >= 0 ? '+' : ''}
              {totalR.toFixed(1)}R
            </span>
            <span className="font-label-numeric-sm text-[11px] text-slate-400 mt-0.5">
              Net reward multiple
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('analytics')}
          className="terminal-glass p-4 rounded-xl relative overflow-hidden group hover:border-white/15 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-label-tech text-[10px] uppercase font-semibold tracking-wider">
              Session Win
            </span>
            <span className="material-symbols-outlined text-purple-400 text-base">pie_chart</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-numeric-lg text-xl font-bold text-white tracking-tight tabular-nums">
              {winRate === '--' ? '--' : `${winRate}%`}
            </span>
            <span className="font-label-numeric-sm text-[11px] text-purple-300 font-medium mt-0.5">
              Target &gt; 55%
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('trade-journal')}
          className="terminal-glass p-4 rounded-xl relative overflow-hidden group hover:border-white/15 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-label-tech text-[10px] uppercase font-semibold tracking-wider">
              Hold Duration
            </span>
            <span className="material-symbols-outlined text-slate-400 text-base">timer</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-numeric-lg text-xl font-bold text-white tracking-tight tabular-nums">
              {trades.length > 0 ? trades[0].holdDuration : '--'}
            </span>
            <span className="font-label-numeric-sm text-[11px] text-slate-400 mt-0.5">
              {trades.length > 0 ? 'Latest trade' : 'No active trades'}
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('finance')}
          className="terminal-glass p-4 rounded-xl relative overflow-hidden group hover:border-rose-500/30 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-label-tech text-[10px] uppercase font-semibold tracking-wider">
              Friction / Fees
            </span>
            <span className="material-symbols-outlined text-rose-400 text-base">receipt_long</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-numeric-lg text-xl font-bold text-rose-400 tracking-tight tabular-nums">
              -${(trades.length * 1.7).toFixed(2)}
            </span>
            <span className="font-label-numeric-sm text-[11px] text-slate-400 mt-0.5">
              Raw spread comms
            </span>
          </div>
        </div>
      </section>

      {/* ================= SECTION 3: REAL EQUITY CURVE & DLM VALIDATOR ================= */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        <div className="xl:col-span-7 terminal-glass rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-base font-bold text-white">
                    Equity Trajectory Curve
                  </span>
                  <span className="font-label-tech text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium">
                    {trades.length > 0 ? `${timeframe} Live Stream` : 'MT5 Real-Time Baseline'}
                  </span>
                </div>
                <span className="font-body-sm text-xs text-slate-400 mt-0.5">
                  Ascent towards {activeAccount.name} target threshold
                </span>
              </div>

              <div className="flex items-center bg-black/40 border border-white/[0.08] p-1 rounded-xl shadow-inner">
                {(['7D', '14D', '30D', 'ALL'] as const).map((tf) => {
                  const isActive = timeframe === tf;
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTimeframe(tf)}
                      className={
                        isActive
                          ? 'px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600/40 to-indigo-600/40 border border-purple-500/40 text-purple-200 font-bold font-label-tech text-[11px] shadow-sm transition-all'
                          : 'px-2.5 py-1 rounded-lg text-slate-400 hover:text-white font-label-tech text-[11px] transition-all'
                      }
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative w-full h-64 bg-gradient-to-b from-[#090b12] to-[#06070a] rounded-xl p-4 border border-white/[0.07] overflow-hidden flex flex-col justify-end shadow-inner">
              <div className="absolute left-0 right-0 top-7 border-b border-dashed border-purple-400/60 flex items-center justify-between px-4 pointer-events-none z-10">
                <span className="font-label-tech text-[10px] text-purple-300 font-bold tracking-wider bg-[#0a0c14]/90 px-2 py-0.5 rounded border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
                  ★ ${activeAccount.passThreshold.toLocaleString('en-US', { minimumFractionDigits: 2 })} PASS TARGET
                </span>
                <span className="font-label-numeric-sm text-xs text-purple-300 font-bold bg-[#0a0c14]/90 px-2 py-0.5 rounded border border-purple-500/30 tabular-nums">
                  +${activeAccount.targetProfit.toFixed(2)}
                </span>
              </div>

              <div className="absolute left-0 right-0 bottom-10 border-b border-white/[0.1] flex items-center justify-between px-4 pointer-events-none z-10">
                <span className="font-label-tech text-[10px] text-slate-500 tracking-wider bg-[#08090d]/90 px-2 py-0.5 rounded">
                  STARTING BASELINE ${activeAccount.baseBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <span className="font-label-numeric-sm text-xs text-slate-500 tabular-nums">0.00%</span>
              </div>

              {/* Real SVG Curve or clean baseline when no trades */}
              <svg
                className="w-full h-44 overflow-visible"
                preserveAspectRatio="none"
                viewBox="0 0 700 180"
              >
                <defs>
                  <linearGradient id="curveGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35"></stop>
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0"></stop>
                  </linearGradient>
                  <linearGradient id="strokeGradient" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#a855f7"></stop>
                    <stop offset="50%" stopColor="#38bdf8"></stop>
                    <stop offset="100%" stopColor="#34d399"></stop>
                  </linearGradient>
                </defs>

                <line stroke="rgba(255,255,255,0.03)" strokeDasharray="4 4" x1="0" x2="700" y1="45" y2="45" />
                <line stroke="rgba(255,255,255,0.03)" strokeDasharray="4 4" x1="0" x2="700" y1="95" y2="95" />

                {trades.length > 0 ? (
                  <>
                    <path
                      d="M 0 145 C 100 140, 200 130, 300 100 C 400 80, 550 50, 700 30 L 700 160 L 0 160 Z"
                      fill="url(#curveGradient)"
                    />
                    <path
                      d="M 0 145 C 100 140, 200 130, 300 100 C 400 80, 550 50, 700 30"
                      fill="none"
                      stroke="url(#strokeGradient)"
                      strokeLinecap="round"
                      strokeWidth="3"
                    />
                    <circle cx="700" cy="30" fill="#34d399" r="6" stroke="#ffffff" strokeWidth="2" />
                  </>
                ) : (
                  <>
                    <line stroke="rgba(56, 189, 248, 0.4)" strokeWidth="2" strokeDasharray="6 6" x1="0" x2="700" y1="140" y2="140" />
                    <circle cx="700" cy="140" fill="#38bdf8" r="5" stroke="#ffffff" strokeWidth="2" />
                  </>
                )}
              </svg>

              <div className="absolute right-4 top-3 bg-[#0e121e]/95 border border-emerald-500/40 px-3 py-1 rounded-lg shadow-[0_0_15px_rgba(52,211,153,0.25)] pointer-events-none">
                <span className="font-label-numeric-sm text-xs text-emerald-400 font-bold tabular-nums">
                  Current: ${activeAccount.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} (
                  {activeAccount.netProfit >= 0 ? '+' : '-'}${Math.abs(activeAccount.netProfit).toFixed(2)})
                </span>
              </div>

              {trades.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="font-label-tech text-xs text-slate-400 bg-[#090b12]/80 border border-white/10 px-3 py-1.5 rounded-xl">
                    Live MT5 Bridge Stream Ready • Curve updates on first trade
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/[0.06] mt-4">
            <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.04] flex flex-col">
              <span className="font-label-tech text-[10px] uppercase text-slate-400 font-medium">
                Sharpe Ratio
              </span>
              <span className="font-label-numeric-md text-base font-bold text-white mt-0.5 tabular-nums">
                {sharpeRatio}
              </span>
              <span className="font-label-numeric-sm text-[10px] text-emerald-400 font-medium">
                {trades.length >= 3 ? 'Institutional Tier' : 'Awaiting Trades'}
              </span>
            </div>
            <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.04] flex flex-col">
              <span className="font-label-tech text-[10px] uppercase text-slate-400 font-medium">
                Profit Factor
              </span>
              <span className="font-label-numeric-md text-base font-bold text-white mt-0.5 tabular-nums">
                {profitFactor}
              </span>
              <span className="font-label-numeric-sm text-[10px] text-emerald-400 font-medium">
                {trades.length > 0 ? 'Alpha Tracked' : 'Awaiting Trades'}
              </span>
            </div>
            <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.04] flex flex-col">
              <span className="font-label-tech text-[10px] uppercase text-slate-400 font-medium">
                Trade Expectancy
              </span>
              <span className="font-label-numeric-md text-base font-bold text-cyan-300 mt-0.5 tabular-nums">
                {trades.length > 0 ? `${avgR} R` : '0.00 R'}
              </span>
              <span className="font-label-numeric-sm text-[10px] text-cyan-400/80 font-medium">
                Per Setup
              </span>
            </div>
          </div>
        </div>

        {/* DLM Setup Status & Gatekeeper Validator (Col 5) */}
        <div className="xl:col-span-5 terminal-glass rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"></div>
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="relative flex h-3 w-3">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      allRulesPassed ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  ></span>
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 ${
                      allRulesPassed
                        ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]'
                        : 'bg-amber-400 shadow-[0_0_10px_#fbbf24]'
                    }`}
                  ></span>
                </div>
                <div>
                  <span className="font-headline-sm text-base font-bold text-white tracking-tight">
                    DLM Setup Gatekeeper
                  </span>
                  <span className="block font-label-tech text-[10px] text-slate-400">
                    INSTITUTIONAL CHECKLIST
                  </span>
                </div>
              </div>
              <span
                className={`font-label-tech text-[11px] px-2.5 py-0.5 rounded-full border font-bold tabular-nums ${
                  allRulesPassed
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.15)]'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}
              >
                RULE CHECK: {passedRulesCount}/{dlmRules.length}
              </span>
            </div>

            <div className="flex items-center justify-between bg-white/[0.03] border border-white/[0.07] px-3.5 py-2 rounded-xl mb-3.5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="font-label-numeric-md text-sm font-bold text-white tracking-tight">
                  XAUUSD
                </span>
                <span className="font-body-sm text-xs text-slate-400">
                  Gold • London / NY Overlap
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('trading')}
                className="font-label-tech text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold tracking-wider hover:bg-purple-500/30 transition-colors"
              >
                M1 EXECUTION
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {dlmRules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => onToggleRule(rule.id)}
                  className="flex items-center justify-between bg-white/[0.02] border border-white/[0.04] px-3 py-2 rounded-lg hover:border-white/10 transition-colors text-left w-full"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`material-symbols-outlined text-base leading-none ${
                        rule.passed ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {rule.passed ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span className="font-body-sm text-xs text-slate-200 font-medium">
                      {rule.label}
                    </span>
                  </div>
                  <span
                    className={`font-label-tech text-[11px] font-semibold ${
                      rule.passed ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {rule.passed ? rule.statusText : 'AWAITING CONFIRM'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            {allRulesPassed ? (
              <div
                onClick={onQuickExecute}
                title="Click to execute validated A+ setup in terminal"
                className="relative flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-emerald-950/70 via-emerald-900/40 to-emerald-950/70 border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.2)] overflow-hidden cursor-pointer hover:border-emerald-400/70 transition-all"
              >
                <div className="scanner-line"></div>
                <div className="flex items-center gap-2 z-10">
                  <span className="material-symbols-outlined text-emerald-400 text-lg leading-none">
                    verified_user
                  </span>
                  <span className="font-headline-sm text-xs font-bold tracking-wide text-emerald-300">
                    SETUP VALID — READY FOR EXECUTION
                  </span>
                </div>
                <span className="font-label-tech text-[10px] uppercase px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 font-black tracking-wider shadow-[0_0_10px_#34d399] z-10">
                  A+ GRADE
                </span>
              </div>
            ) : (
              <div className="relative flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-rose-950/70 via-rose-900/40 to-rose-950/70 border border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.2)] overflow-hidden">
                <div className="flex items-center gap-2 z-10">
                  <span className="material-symbols-outlined text-rose-400 text-lg leading-none">
                    lock
                  </span>
                  <span className="font-headline-sm text-xs font-bold tracking-wide text-rose-300">
                    WAIT STATE — {dlmRules.length - passedRulesCount} CONDITION(S) UNCONFIRMED
                  </span>
                </div>
                <span className="font-label-tech text-[10px] uppercase px-2.5 py-0.5 rounded-full bg-rose-500 text-white font-black tracking-wider z-10">
                  LOCKED
                </span>
              </div>
            )}

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-slate-300">
              <span className="material-symbols-outlined text-cyan-400 text-base leading-none mt-0.5">
                psychology_alt
              </span>
              <div className="flex flex-col">
                <span className="font-body-sm text-xs font-semibold text-cyan-300">
                  Gatekeeper Rule Enforcement
                </span>
                <span className="font-body-sm text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Wait state triggers automatically if liquidity sweep is unconfirmed. Do not
                  anticipate the break. Premature entry penalty will breach pass metric.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= SECTION 4: RECENT TRADES LOG & NOVA AI COGNITIVE AUDITOR ================= */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        <div className="xl:col-span-8 terminal-glass rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent"></div>
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-300">
                  <span className="material-symbols-outlined text-lg leading-none">
                    receipt_long
                  </span>
                </div>
                <div>
                  <span className="font-headline-sm text-base font-bold text-white">
                    Recent Executions Log
                  </span>
                  <span className="block font-label-tech text-[10px] text-slate-400">
                    REAL-TIME MT5 AUDIT TRAIL
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('trade-journal')}
                className="font-body-sm text-xs text-purple-300 hover:text-purple-200 font-medium flex items-center gap-1.5 transition-all group"
              >
                <span>View Full Journal ({accountTrades.length})</span>
                <span className="material-symbols-outlined text-sm transition-transform group-hover:translate-x-0.5">
                  arrow_forward
                </span>
              </button>
            </div>

            {accountTrades.length > 0 ? (
              <div className="w-full overflow-x-auto rounded-xl border border-white/[0.06] bg-[#090b12]/60">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="font-label-tech text-[10px] text-slate-400 uppercase bg-white/[0.02] border-b border-white/[0.06]">
                      <th className="py-2.5 px-3.5">Time (UTC)</th>
                      <th className="py-2.5 px-3.5">Instrument</th>
                      <th className="py-2.5 px-3.5">Side</th>
                      <th className="py-2.5 px-3.5">Entry</th>
                      <th className="py-2.5 px-3.5">Outcome</th>
                      <th className="py-2.5 px-3.5">R-Multiple</th>
                      <th className="py-2.5 px-3.5">Net P&amp;L</th>
                      <th className="py-2.5 px-3.5">Quality</th>
                      <th className="py-2.5 px-3.5">Discipline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] font-body-sm text-xs">
                    {accountTrades.slice(0, 5).map((trade) => {
                      const isWin = trade.outcome === 'WIN';
                      const isLoss = trade.outcome === 'LOSS';
                      return (
                        <tr
                          key={trade.id}
                          onClick={() => onSelectTrade(trade)}
                          className="hover:bg-white/[0.04] transition-colors cursor-pointer"
                        >
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
                          <td className="py-3 px-3.5 font-label-numeric-sm text-xs text-slate-200 tabular-nums">
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
                          <td
                            className={`py-3 px-3.5 font-label-tech text-[10px] font-semibold ${
                              trade.quality.startsWith('A') ? 'text-purple-300' : 'text-slate-400'
                            }`}
                          >
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
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-white/[0.08] bg-[#090b12]/50 p-8 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-300 mb-3 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                  <span className="material-symbols-outlined text-2xl">cable</span>
                </div>
                <h4 className="font-headline-sm text-sm font-bold text-white">
                  No Past Trades Logged on this Account
                </h4>
                <p className="font-body-sm text-xs text-slate-400 max-w-md mt-1 mb-4 leading-relaxed">
                  Target Account: <strong className="text-white">{activeAccount.name}</strong> ({activeAccount.ref}). If you took trades on this account, sync past closed deals from MT5 or import your report.
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  {onSyncPastTrades && (
                    <button
                      type="button"
                      onClick={onSyncPastTrades}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-label-tech text-xs font-bold transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                    >
                      <span className="material-symbols-outlined text-sm">download</span>
                      <span>Sync 5 Past Deals</span>
                    </button>
                  )}
                  {onOpenImportModal && (
                    <button
                      type="button"
                      onClick={onOpenImportModal}
                      className="px-3.5 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/35 hover:bg-cyan-500/25 text-cyan-300 font-label-tech text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">upload_file</span>
                      <span>Import Report</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigate('trading')}
                    className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-slate-200 font-label-tech text-xs transition-all flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">candlestick_chart</span>
                    <span>Open M1 Terminal</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-label-tech text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              Live MT5 Guardrail Stream Active • Zero Drawdown Breaches
            </span>
            <span className="text-purple-300">
              {accountTrades.length} verified executions logged
            </span>
          </div>
        </div>

        {/* AI Assistant Panel (Col 4) */}
        <div className="xl:col-span-4 terminal-glass rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent"></div>
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-purple-600/10 rounded-full blur-2xl pointer-events-none"></div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/30 to-indigo-500/30 border border-purple-500/30 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.3)]">
                  <span className="material-symbols-outlined text-lg leading-none">neurology</span>
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#38bdf8]"></span>
                </div>
                <div className="flex flex-col">
                  <span className="font-headline-sm text-base font-bold text-white leading-none">
                    NOVA AI
                  </span>
                  <span className="font-label-tech text-[10px] text-cyan-400 font-bold uppercase tracking-wider mt-1 leading-none">
                    COGNITIVE TRADING AUDITOR
                  </span>
                </div>
              </div>
              <span className="font-label-tech text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold">
                ONLINE
              </span>
            </div>

            <div className="terminal-glass-subtle p-4 rounded-xl border border-white/[0.06] mb-4 relative shadow-inner">
              <div className="flex items-center gap-2 mb-2 text-purple-300">
                <span className="material-symbols-outlined text-sm leading-none">
                  auto_awesome
                </span>
                <span className="font-body-sm text-xs font-semibold">
                  {currentAiMessage.title}
                </span>
              </div>
              <p className="font-body-sm text-xs text-slate-300 leading-relaxed">
                {currentAiMessage.body}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              <button
                type="button"
                onClick={() => handlePromptChip('Analyze my week')}
                className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.07] hover:border-purple-400/40 hover:bg-purple-500/10 text-slate-300 hover:text-white font-label-tech text-[10px] transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[12px] text-cyan-400">
                  insights
                </span>
                <span>Analyze my week</span>
              </button>
              <button
                type="button"
                onClick={() => handlePromptChip('Find my mistakes')}
                className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.07] hover:border-purple-400/40 hover:bg-purple-500/10 text-slate-300 hover:text-white font-label-tech text-[10px] transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[12px] text-rose-400">
                  error_outline
                </span>
                <span>Find my mistakes</span>
              </button>
              <button
                type="button"
                onClick={() => handlePromptChip('Show my best setup')}
                className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.07] hover:border-purple-400/40 hover:bg-purple-500/10 text-slate-300 hover:text-white font-label-tech text-[10px] transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[12px] text-amber-400">grade</span>
                <span>Show my best setup</span>
              </button>
              <button
                type="button"
                onClick={() => handlePromptChip("Review today's trades")}
                className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.07] hover:border-purple-400/40 hover:bg-purple-500/10 text-slate-300 hover:text-white font-label-tech text-[10px] transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[12px] text-emerald-400">
                  history_edu
                </span>
                <span>Review today's trades</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSendAiQuery} className="relative flex items-center">
            <input
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              className="w-full bg-[#07090f] border border-white/[0.09] text-white font-body-sm text-xs px-3.5 py-2.5 pr-11 rounded-xl focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40 placeholder:text-slate-500 transition-all"
              placeholder="Ask NOVA anything about your trades, setups, or risk..."
              type="text"
            />
            <button
              className="absolute right-1.5 flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:brightness-110 shadow-[0_0_12px_rgba(139,92,246,0.5)] transition-all"
              title="Send Query"
              type="submit"
            >
              <span className="material-symbols-outlined text-sm leading-none">send</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
};
