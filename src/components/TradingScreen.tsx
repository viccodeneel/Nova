import React, { useState } from 'react';
import { DlmRule, PropAccount } from '../data/terminalData';

interface TradingScreenProps {
  activeAccount: PropAccount;
  dlmRules: DlmRule[];
  onToggleRule: (ruleId: string) => void;
  onExecuteOrder: (order: {
    instrument: 'XAUUSD' | 'EURUSD' | 'US100' | 'GBPUSD';
    side: 'BUY' | 'SELL';
    entry: string;
    lots: string;
    riskDollars: number;
    targetR: number;
  }) => void;
}

const INSTRUMENTS: Record<
  'XAUUSD' | 'EURUSD' | 'US100' | 'GBPUSD',
  {
    name: string;
    bid: string;
    ask: string;
    spread: string;
    high: string;
    low: string;
    fvgZone: string;
    sweepLevel: string;
    bosLevel: string;
  }
> = {
  XAUUSD: {
    name: 'Gold Spot / US Dollar',
    bid: '2654.15',
    ask: '2654.25',
    spread: '1.0',
    high: '2664.80',
    low: '2638.40',
    fvgZone: '2652.10 – 2653.00',
    sweepLevel: '2648.50 (Asian High Swept)',
    bosLevel: '2651.20 (M1 Displacement)',
  },
  EURUSD: {
    name: 'Euro / US Dollar',
    bid: '1.08418',
    ask: '1.08422',
    spread: '0.4',
    high: '1.08750',
    low: '1.08190',
    fvgZone: '1.08380 – 1.08410',
    sweepLevel: '1.08310 (Frankfurt Low Swept)',
    bosLevel: '1.08405 (M1 Displacement)',
  },
  US100: {
    name: 'Nasdaq 100 E-Mini Index',
    bid: '20,409.5',
    ask: '20,410.5',
    spread: '1.0',
    high: '20,488.0',
    low: '20,295.0',
    fvgZone: '20,415.0 – 20,428.0',
    sweepLevel: '20,445.0 (London High Raid)',
    bosLevel: '20,412.0 (M1 Bearish BOS)',
  },
  GBPUSD: {
    name: 'British Pound / US Dollar',
    bid: '1.29836',
    ask: '1.29844',
    spread: '0.8',
    high: '1.30210',
    low: '1.29540',
    fvgZone: '1.29790 – 1.29825',
    sweepLevel: '1.29680 (Asian Low Swept)',
    bosLevel: '1.29815 (M1 Displacement)',
  },
};

export const TradingScreen: React.FC<TradingScreenProps> = ({
  activeAccount,
  dlmRules,
  onToggleRule,
  onExecuteOrder,
}) => {
  const [symbol, setSymbol] = useState<'XAUUSD' | 'EURUSD' | 'US100' | 'GBPUSD'>('XAUUSD');
  const [chartTf, setChartTf] = useState<'M1' | 'M5' | 'M15' | '1H'>('M1');
  const [riskPct, setRiskPct] = useState<number>(0.4);
  const [stopPips, setStopPips] = useState<number>(16);
  const [targetR, setTargetR] = useState<number>(3.0);
  const [showFvg, setShowFvg] = useState<boolean>(true);
  const [showSweep, setShowSweep] = useState<boolean>(true);
  const [orderBanner, setOrderBanner] = useState<string | null>(null);

  const info = INSTRUMENTS[symbol];
  const passedCount = dlmRules.filter((r) => r.passed).length;
  const allPassed = passedCount === dlmRules.length;

  const riskDollars = Number(((activeAccount.baseBalance * riskPct) / 100).toFixed(2));
  const calculatedLots = Math.max(0.05, Number((riskDollars / (stopPips * 5)).toFixed(2)));
  const projectedReward = Number((riskDollars * targetR).toFixed(2));

  const triggerOrder = (side: 'BUY' | 'SELL') => {
    onExecuteOrder({
      instrument: symbol,
      side,
      entry: side === 'BUY' ? info.ask : info.bid,
      lots: calculatedLots.toFixed(2),
      riskDollars,
      targetR,
    });
    setOrderBanner(
      `${side} ${calculatedLots.toFixed(2)} Lots ${symbol} @ ${
        side === 'BUY' ? info.ask : info.bid
      } Routed via LD4 Bridge (+${targetR.toFixed(1)}R Target / +$${projectedReward.toFixed(2)})`
    );
    setTimeout(() => setOrderBanner(null), 5000);
  };

  return (
    <div className="flex flex-col w-full gap-5">
      <div className="terminal-glass rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {(['XAUUSD', 'EURUSD', 'US100', 'GBPUSD'] as const).map((sym) => {
            const active = symbol === sym;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => setSymbol(sym)}
                className={`px-3.5 py-2 rounded-xl font-label-numeric-md text-xs font-bold transition-all flex items-center gap-2 ${
                  active
                    ? 'bg-gradient-to-r from-purple-600/35 to-indigo-600/25 text-white border border-purple-500/40 shadow-[0_0_15px_rgba(147,51,234,0.25)]'
                    : 'bg-white/[0.02] text-slate-400 border border-white/[0.06] hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <span>{sym}</span>
                <span className="font-label-numeric-sm text-[10px] text-emerald-400 tabular-nums">
                  {INSTRUMENTS[sym].bid}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 font-label-numeric-sm text-xs tabular-nums">
          <div className="flex flex-col">
            <span className="font-label-tech text-[9px] text-slate-400 uppercase">Raw Spread</span>
            <span className="text-cyan-400 font-bold">{info.spread} pts</span>
          </div>
          <div className="h-6 w-px bg-white/10"></div>
          <div className="flex flex-col">
            <span className="font-label-tech text-[9px] text-slate-400 uppercase">Session High</span>
            <span className="text-slate-200 font-semibold">{info.high}</span>
          </div>
          <div className="h-6 w-px bg-white/10"></div>
          <div className="flex flex-col">
            <span className="font-label-tech text-[9px] text-slate-400 uppercase">Session Low</span>
            <span className="text-slate-200 font-semibold">{info.low}</span>
          </div>
          <div className="h-6 w-px bg-white/10"></div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-label-tech text-[10px] text-emerald-300 font-bold">
              LD4 DMA: 14ms
            </span>
          </div>
        </div>
      </div>

      {orderBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 flex items-center justify-between shadow-[0_0_20px_rgba(16,185,129,0.25)]">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-emerald-400 text-lg">check_circle</span>
            <span className="font-label-numeric-sm text-xs font-bold">{orderBanner}</span>
          </div>
          <span className="font-label-tech text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-400/20 text-emerald-300">
            LOGGED TO AUDIT TRAIL
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        <div className="xl:col-span-8 terminal-glass rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>

          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-headline-sm text-lg font-bold text-white">{symbol}</span>
                <span className="font-body-sm text-xs text-slate-400">{info.name}</span>
                <span className="font-label-tech text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                  {chartTf} INSTITUTIONAL FEED
                </span>
              </div>
              <span className="font-label-numeric-sm text-[11px] text-slate-400 mt-0.5 block">
                FVG Zone: {info.fvgZone} • {info.sweepLevel}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFvg(!showFvg)}
                className={`px-2.5 py-1 rounded-lg font-label-tech text-[10px] border transition-all ${
                  showFvg
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-white/[0.02] border-white/10 text-slate-400'
                }`}
              >
                FVG Zone
              </button>
              <button
                type="button"
                onClick={() => setShowSweep(!showSweep)}
                className={`px-2.5 py-1 rounded-lg font-label-tech text-[10px] border transition-all ${
                  showSweep
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                    : 'bg-white/[0.02] border-white/10 text-slate-400'
                }`}
              >
                Liquidity Map
              </button>
              <div className="flex items-center bg-black/40 border border-white/[0.08] p-1 rounded-xl">
                {(['M1', 'M5', 'M15', '1H'] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setChartTf(tf)}
                    className={
                      chartTf === tf
                        ? 'px-2.5 py-1 rounded-lg bg-purple-600/40 border border-purple-500/40 text-purple-200 font-bold font-label-tech text-[10px]'
                        : 'px-2.5 py-1 rounded-lg text-slate-400 hover:text-white font-label-tech text-[10px]'
                    }
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="relative w-full h-80 bg-gradient-to-b from-[#090b12] to-[#06070a] rounded-xl p-4 border border-white/[0.07] overflow-hidden">
            {showSweep && (
              <div className="absolute left-4 right-4 top-12 border-b border-dashed border-cyan-400/60 flex items-center justify-between pointer-events-none z-10">
                <span className="font-label-tech text-[10px] text-cyan-300 bg-[#090b12]/90 px-2 py-0.5 rounded border border-cyan-500/30">
                  LIQUIDITY SWEEP: {info.sweepLevel}
                </span>
                <span className="font-label-numeric-sm text-[10px] text-cyan-400 bg-[#090b12]/90 px-2 py-0.5 rounded">
                  PURGED &amp; REJECTED
                </span>
              </div>
            )}

            {showFvg && (
              <div className="absolute left-28 right-4 top-36 h-12 bg-emerald-500/10 border-y border-emerald-400/40 flex items-center justify-between px-3 pointer-events-none z-10">
                <span className="font-label-tech text-[10px] text-emerald-300 font-bold">
                  BULLISH FVG RETEST ZONE ({info.fvgZone})
                </span>
                <span className="font-label-tech text-[10px] text-emerald-400 bg-[#090b12]/80 px-2 py-0.5 rounded">
                  DELTA ABSORPTION CONFIRMED
                </span>
              </div>
            )}

            <svg className="w-full h-full" viewBox="0 0 760 260" preserveAspectRatio="none">
              <line stroke="rgba(255,255,255,0.03)" x1="0" x2="760" y1="65" y2="65" />
              <line stroke="rgba(255,255,255,0.03)" x1="0" x2="760" y1="130" y2="130" />
              <line stroke="rgba(255,255,255,0.03)" x1="0" x2="760" y1="195" y2="195" />

              {[
                { x: 35, open: 190, close: 170, high: 162, low: 205, bull: true },
                { x: 75, open: 170, close: 185, high: 165, low: 198, bull: false },
                { x: 115, open: 185, close: 155, high: 145, low: 192, bull: true },
                { x: 155, open: 155, close: 168, high: 150, low: 178, bull: false },
                { x: 195, open: 168, close: 195, high: 162, low: 225, bull: false },
                { x: 235, open: 195, close: 142, high: 136, low: 202, bull: true },
                { x: 275, open: 142, close: 98, high: 90, low: 148, bull: true },
                { x: 315, open: 98, close: 118, high: 94, low: 126, bull: false },
                { x: 355, open: 118, close: 138, high: 112, low: 146, bull: false },
                { x: 395, open: 138, close: 112, high: 105, low: 144, bull: true },
                { x: 435, open: 112, close: 84, high: 76, low: 118, bull: true },
                { x: 475, open: 84, close: 94, high: 80, low: 104, bull: false },
                { x: 515, open: 94, close: 66, high: 58, low: 98, bull: true },
                { x: 555, open: 66, close: 52, high: 44, low: 72, bull: true },
                { x: 595, open: 52, close: 60, high: 48, low: 68, bull: false },
                { x: 635, open: 60, close: 38, high: 30, low: 64, bull: true },
                { x: 675, open: 38, close: 28, high: 20, low: 45, bull: true },
              ].map((c, idx) => {
                const top = Math.min(c.open, c.close);
                const height = Math.max(4, Math.abs(c.close - c.open));
                const color = c.bull ? '#34d399' : '#f87171';
                return (
                  <g key={idx}>
                    <line
                      x1={c.x}
                      x2={c.x}
                      y1={c.high}
                      y2={c.low}
                      stroke={color}
                      strokeWidth="1.5"
                    />
                    <rect
                      x={c.x - 8}
                      y={top}
                      width="16"
                      height={height}
                      rx="2"
                      fill={color}
                      fillOpacity={c.bull ? 0.85 : 0.75}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/[0.06]">
            <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
              <span className="font-label-tech text-[10px] text-slate-400 uppercase">
                Orderflow Delta
              </span>
              <div className="font-label-numeric-md text-sm font-bold text-emerald-400 mt-0.5 tabular-nums">
                +412 Contracts
              </div>
              <span className="font-label-tech text-[9px] text-slate-400">
                Aggressive Bid Absorption
              </span>
            </div>
            <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
              <span className="font-label-tech text-[10px] text-slate-400 uppercase">
                1M Structure
              </span>
              <div className="font-label-numeric-md text-sm font-bold text-cyan-300 mt-0.5">
                {info.bosLevel}
              </div>
              <span className="font-label-tech text-[9px] text-slate-400">
                Confirmed Displacement
              </span>
            </div>
            <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
              <span className="font-label-tech text-[10px] text-slate-400 uppercase">
                Target 1 (+2.0R)
              </span>
              <div className="font-label-numeric-md text-sm font-bold text-white mt-0.5 tabular-nums">
                +${(riskDollars * 2).toFixed(2)}
              </div>
              <span className="font-label-tech text-[9px] text-emerald-400">
                Clears $16 Phase 1 Gap
              </span>
            </div>
            <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
              <span className="font-label-tech text-[10px] text-slate-400 uppercase">
                Target 2 (+{targetR.toFixed(1)}R)
              </span>
              <div className="font-label-numeric-md text-sm font-bold text-purple-300 mt-0.5 tabular-nums">
                +${projectedReward.toFixed(2)}
              </div>
              <span className="font-label-tech text-[9px] text-purple-400">
                Full Runner Objective
              </span>
            </div>
          </div>
        </div>

        <div className="xl:col-span-4 terminal-glass rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent"></div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="font-headline-sm text-base font-bold text-white">
                  Sovereign Execution Ticket
                </span>
                <span className="block font-label-tech text-[10px] text-slate-400">
                  DYNAMIC LOT &amp; GUARDRAIL SIZER
                </span>
              </div>
              <span
                className={`font-label-tech text-[10px] px-2.5 py-0.5 rounded-full border font-bold ${
                  allPassed
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}
              >
                DLM {passedCount}/6
              </span>
            </div>

            <div className="flex flex-col gap-3.5 mb-4">
              <div className="terminal-glass-subtle p-3.5 rounded-xl border border-white/[0.05]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-label-tech text-[10px] uppercase text-slate-400">
                    Account Risk Allocation
                  </span>
                  <span className="font-label-numeric-md text-xs font-bold text-purple-300 tabular-nums">
                    {riskPct.toFixed(2)}% (${riskDollars.toFixed(2)})
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={riskPct}
                  onChange={(e) => setRiskPct(parseFloat(e.target.value))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <div className="flex justify-between font-label-numeric-sm text-[10px] text-slate-500 mt-1">
                  <span>0.20% Micro</span>
                  <span>0.50% Standard</span>
                  <span>1.00% Max Cap</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
                  <label className="font-label-tech text-[10px] uppercase text-slate-400 block mb-1">
                    Stop Loss (Pips)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="60"
                    value={stopPips}
                    onChange={(e) => setStopPips(Math.max(5, Number(e.target.value)))}
                    className="w-full bg-[#07090f] border border-white/10 rounded-lg px-2.5 py-1.5 font-label-numeric-md text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="terminal-glass-subtle p-3 rounded-xl border border-white/[0.05]">
                  <label className="font-label-tech text-[10px] uppercase text-slate-400 block mb-1">
                    Target R-Multiple
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    step="0.5"
                    value={targetR}
                    onChange={(e) => setTargetR(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-[#07090f] border border-white/10 rounded-lg px-2.5 py-1.5 font-label-numeric-md text-sm text-cyan-300 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="terminal-glass-subtle p-3.5 rounded-xl border border-white/[0.06] flex items-center justify-between">
                <div>
                  <span className="font-label-tech text-[10px] uppercase text-slate-400 block">
                    Computed Lot Size
                  </span>
                  <span className="font-body-sm text-[11px] text-emerald-400">
                    Within $250 Daily Drawdown Limit
                  </span>
                </div>
                <span className="font-label-numeric-lg text-2xl font-bold text-white tabular-nums">
                  {calculatedLots.toFixed(2)} Lots
                </span>
              </div>
            </div>

            <div className="mb-4">
              <span className="font-label-tech text-[10px] uppercase text-slate-400 block mb-2">
                Pre-Flight Gatekeeper Verification
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {dlmRules.map((rule) => (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => onToggleRule(rule.id)}
                    className={`px-2.5 py-1.5 rounded-lg border text-left flex items-center gap-1.5 transition-all ${
                      rule.passed
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-white/[0.02] border-white/10 text-slate-400'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xs">
                      {rule.passed ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span className="font-body-sm text-[11px] truncate">{rule.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => triggerOrder('SELL')}
                className="p-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 transition-all flex flex-col items-center shadow-[0_0_20px_rgba(244,63,94,0.15)]"
              >
                <span className="font-label-tech text-[10px] uppercase font-bold tracking-wider">
                  SELL MARKET
                </span>
                <span className="font-label-numeric-md text-base font-bold text-white mt-0.5 tabular-nums">
                  {info.bid}
                </span>
              </button>
              <button
                type="button"
                onClick={() => triggerOrder('BUY')}
                className="p-3.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 transition-all flex flex-col items-center shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              >
                <span className="font-label-tech text-[10px] uppercase font-bold tracking-wider">
                  BUY MARKET
                </span>
                <span className="font-label-numeric-md text-base font-bold text-white mt-0.5 tabular-nums">
                  {info.ask}
                </span>
              </button>
            </div>
            <div className="text-center font-label-tech text-[10px] text-slate-400">
              Hard Stop Loss &amp; Take Profit brackets injected at LD4 server level
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
