export type NavSection =
  | 'overview'
  | 'trading'
  | 'trade-journal'
  | 'analytics'
  | 'accounts'
  | 'goals'
  | 'finance'
  | 'ai-assistant'
  | 'settings';

export interface TradeExecution {
  id: string;
  accountId?: string;
  time: string;
  instrument: 'XAUUSD' | 'EURUSD' | 'US100' | 'GBPUSD';
  side: 'BUY' | 'SELL';
  entry: string;
  exit?: string;
  lots?: string;
  outcome: 'WIN' | 'LOSS' | 'BE';
  rMultiple: string;
  rValue: number;
  netPnl: string;
  pnlValue: number;
  quality: string;
  discipline: string;
  disciplineScore: number;
  session: string;
  holdDuration: string;
  fees: string;
  notes: string;
  rulesPassed: number;
}

export interface Mt5BridgeConfig {
  isConnected: boolean;
  loginId: string;
  server: string;
  broker: string;
  phase: string;
  baseBalance: number;
  targetPercent: number;
  dailyLossPercent: number;
  maxLossPercent: number;
  bridgeProtocol: 'EA_WEBHOOK' | 'META_API' | 'ZEROMQ' | 'REST_GATEWAY';
  apiToken: string;
  webhookUrl: string;
  latencyMs: number;
  connectedAt?: string;
}

export interface PropAccount {
  id: string;
  name: string;
  ref: string;
  shortRef: string;
  bridge: string;
  phase: string;
  baseBalance: number;
  currentBalance: number;
  liveEquity: number;
  floatingPnl: number;
  netProfit: number;
  roiPercent: number;
  targetProfit: number;
  targetPercent: number;
  passThreshold: number;
  dailyLimit: number;
  currentDailyDrawdown: number;
  maxLossLimit: number;
  currentMaxDrawdown: number;
  peakWater: number;
  status: 'SAFE' | 'CAUTION' | 'FUNDED';
  isRealConnected?: boolean;
  tradeCount?: number;
}

export interface DlmRule {
  id: string;
  label: string;
  statusText: string;
  passed: boolean;
}

export const DEFAULT_MT5_CONFIG: Mt5BridgeConfig = {
  isConnected: false,
  loginId: '',
  server: 'FundingPips-Server',
  broker: 'FundingPips',
  phase: 'Phase 1',
  baseBalance: 10000.0,
  targetPercent: 6.0,
  dailyLossPercent: 5.0,
  maxLossPercent: 10.0,
  bridgeProtocol: 'EA_WEBHOOK',
  apiToken: '',
  webhookUrl: 'https://api.novaterminal.io/v2/mt5/webhook/live-feed',
  latencyMs: 14,
};

export const INITIAL_PROP_ACCOUNTS: PropAccount[] = [
  {
    id: 'mt5-real-primary',
    name: 'Real MT5 Connected Account',
    ref: '#884192-FP',
    shortRef: 'FundingPips #884192',
    bridge: 'FundingPips-Server • LD4 Bridge',
    phase: 'Phase 1',
    baseBalance: 5000.0,
    currentBalance: 5000.0,
    liveEquity: 5000.0,
    floatingPnl: 0.0,
    netProfit: 0.0,
    roiPercent: 0.0,
    targetProfit: 300.0,
    targetPercent: 6.0,
    passThreshold: 5300.0,
    dailyLimit: 250.0,
    currentDailyDrawdown: 0.0,
    maxLossLimit: 500.0,
    currentMaxDrawdown: 0.0,
    peakWater: 5000.0,
    status: 'SAFE',
    isRealConnected: true,
  },
];

export const INITIAL_TRADES: TradeExecution[] = [];

export const INITIAL_DLM_RULES: DlmRule[] = [
  {
    id: 'rule-1',
    label: '1H Bias Confirmation',
    statusText: 'BULLISH > 2640',
    passed: true,
  },
  {
    id: 'rule-2',
    label: 'Key Liquidity Pool',
    statusText: 'ASIAN HIGH MAPPED',
    passed: true,
  },
  {
    id: 'rule-3',
    label: 'Liquidity Sweep',
    statusText: '2648.50 REJECTED',
    passed: true,
  },
  {
    id: 'rule-4',
    label: '1M BOS Displacement',
    statusText: 'BROKE 2651.20',
    passed: true,
  },
  {
    id: 'rule-5',
    label: 'Bullish FVG Retest',
    statusText: '2652.10–2653.00',
    passed: true,
  },
  {
    id: 'rule-6',
    label: 'Tape Entry Confirmation',
    statusText: 'DELTA ABSORPTION',
    passed: true,
  },
];

export const AI_RESPONSES: Record<string, { title: string; body: string; metrics: string }> = {
  default: {
    title: 'Cognitive Auditor: System Armed',
    body: `Terminal connected to real MT5 LD4 bridge. When you connect an account or import past deals, NOVA AI reconstructs your equity curve, checks your DLM Gatekeeper compliance, and enforces drawdown rules in real time.`,
    metrics: 'Real MT5 Ready • 0 Breaches Logged',
  },
  'Analyze my week': {
    title: 'Weekly Edge Audit',
    body: `Auditing trades on this account. Session win rates, R-multiples, and commission friction are monitored live to maximize prop firm passing probability.`,
    metrics: 'Active MT5 Audit',
  },
  'Find my mistakes': {
    title: 'Pre-Confirmation Leakage Detection',
    body: `Guardrail active. To protect your real prop firm capital, ensure Rule #3 (Liquidity Sweep) is fully formed on M1 before entering. Real-time pre-sweep warnings will trigger on your connected account.`,
    metrics: '0 Drawdown Breaches • Guardrail Armed',
  },
  'Show my best setup': {
    title: 'Alpha Signature: A+ XAUUSD Asian High Sweep',
    body: `Your recommended setup model for London/NY Overlap: Wait for the Asian High/Low to be swept on M15/M1, followed by a displacement break of structure and clean FVG retest before executing.`,
    metrics: 'A+ Institutional Checklist Ready',
  },
  "Review today's trades": {
    title: "Today's Session Audit",
    body: `Live audit for today's session. Any trade placed or synced from MT5 will immediately register in the audit trail with M1 execution analytics.`,
    metrics: 'Live Audit Trail',
  },
};

export function calculateAccountMetricsFromTrades(
  account: PropAccount,
  accountTrades: TradeExecution[]
): PropAccount {
  const netProfit = Number(
    accountTrades.reduce((acc, t) => acc + t.pnlValue, 0).toFixed(2)
  );
  const currentBalance = Number((account.baseBalance + netProfit).toFixed(2));
  const roiPercent =
    account.baseBalance > 0
      ? Number(((netProfit / account.baseBalance) * 100).toFixed(2))
      : 0;

  // Calculate drawdowns based on losses
  const negativeTrades = accountTrades.filter((t) => t.pnlValue < 0);
  const totalLoss = Math.abs(negativeTrades.reduce((acc, t) => acc + t.pnlValue, 0));
  const currentDailyDrawdown = Number(
    (accountTrades.slice(0, 3).filter((t) => t.pnlValue < 0).reduce((acc, t) => acc + Math.abs(t.pnlValue), 0)).toFixed(2)
  );
  const currentMaxDrawdown = Number(Math.min(totalLoss, account.maxLossLimit).toFixed(2));
  const peakWater = Math.max(account.baseBalance, currentBalance);

  let status: 'SAFE' | 'CAUTION' | 'FUNDED' = 'SAFE';
  if (currentBalance >= account.passThreshold) {
    status = 'FUNDED';
  } else if (currentMaxDrawdown > account.maxLossLimit * 0.7) {
    status = 'CAUTION';
  }

  return {
    ...account,
    currentBalance,
    liveEquity: currentBalance,
    floatingPnl: 0,
    netProfit,
    roiPercent,
    currentDailyDrawdown,
    currentMaxDrawdown,
    peakWater,
    status,
    tradeCount: accountTrades.length,
  };
}

/**
 * Generates realistic past MT5 trades for a connected account
 * scaled proportionally to its base balance.
 */
export function generatePastTradesForAccount(
  account: PropAccount,
  count: number = 5
): TradeExecution[] {
  const scale = account.baseBalance / 5000;
  const sampleTemplates: Array<{
    instrument: 'XAUUSD' | 'EURUSD' | 'US100' | 'GBPUSD';
    side: 'BUY' | 'SELL';
    entry: string;
    exit: string;
    lots: string;
    outcome: 'WIN' | 'LOSS' | 'BE';
    rValue: number;
    pnl: number;
    quality: string;
    score: number;
    session: string;
    hold: string;
    notes: string;
    time: string;
  }> = [
    {
      instrument: 'XAUUSD',
      side: 'BUY',
      entry: '2654.20',
      exit: '2663.80',
      lots: (0.25 * scale).toFixed(2),
      outcome: 'WIN',
      rValue: 3.0,
      pnl: Math.round(120 * scale),
      quality: 'A+ DLM Sweep',
      score: 100,
      session: 'London / NY Overlap',
      hold: '32 mins',
      notes: 'Clean sweep of Asian High liquidity followed by M1 displacement and Bullish FVG retest.',
      time: 'Today 11:24',
    },
    {
      instrument: 'XAUUSD',
      side: 'SELL',
      entry: '2641.80',
      exit: '2645.00',
      lots: (0.25 * scale).toFixed(2),
      outcome: 'LOSS',
      rValue: -1.0,
      pnl: -Math.round(40 * scale),
      quality: 'B- Early BOS',
      score: 66,
      session: 'London Open',
      hold: '24 mins',
      notes: 'Anticipated M1 break of structure before liquidity sweep completed. Stopped at hard guardrail.',
      time: 'Today 09:15',
    },
    {
      instrument: 'EURUSD',
      side: 'BUY',
      entry: '1.08420',
      exit: '1.08640',
      lots: (0.4 * scale).toFixed(2),
      outcome: 'WIN',
      rValue: 2.2,
      pnl: Math.round(88 * scale),
      quality: 'A DLM Retest',
      score: 100,
      session: 'London / NY Overlap',
      hold: '41 mins',
      notes: 'Frankfurt low swept during London open, strong displacement candle and clean 50% FVG fill.',
      time: 'Yesterday 14:10',
    },
    {
      instrument: 'XAUUSD',
      side: 'BUY',
      entry: '2632.50',
      exit: '2640.50',
      lots: (0.25 * scale).toFixed(2),
      outcome: 'WIN',
      rValue: 2.5,
      pnl: Math.round(100 * scale),
      quality: 'A+ NY FVG',
      score: 100,
      session: 'NY AM Session',
      hold: '19 mins',
      notes: 'CME open liquidity raid into 1H bullish orderblock; zero drawdown after entry.',
      time: 'Oct 24 15:45',
    },
    {
      instrument: 'US100',
      side: 'SELL',
      entry: '20,410.0',
      exit: '20,338.0',
      lots: (0.5 * scale).toFixed(2),
      outcome: 'WIN',
      rValue: 1.8,
      pnl: Math.round(72 * scale),
      quality: 'A SMT Divergence',
      score: 100,
      session: 'NY Open 09:30',
      hold: '15 mins',
      notes: 'Bearish SMT divergence against US500 at PDH; M1 displacement confirmed.',
      time: 'Oct 22 13:30',
    },
    {
      instrument: 'GBPUSD',
      side: 'BUY',
      entry: '1.29840',
      exit: '1.30110',
      lots: (0.3 * scale).toFixed(2),
      outcome: 'WIN',
      rValue: 2.4,
      pnl: Math.round(96 * scale),
      quality: 'A+ DLM Sweep',
      score: 100,
      session: 'London Open',
      hold: '37 mins',
      notes: 'London Judas swing below Asian Low with immediate delta absorption.',
      time: 'Oct 21 08:20',
    },
    {
      instrument: 'XAUUSD',
      side: 'BUY',
      entry: '2618.40',
      exit: '2618.40',
      lots: (0.25 * scale).toFixed(2),
      outcome: 'BE',
      rValue: 0.0,
      pnl: 0,
      quality: 'A DLM Retest',
      score: 100,
      session: 'London / NY Overlap',
      hold: '29 mins',
      notes: 'Moved stop to breakeven at +1.2R per protocol before high-impact USD news release.',
      time: 'Oct 19 14:05',
    },
    {
      instrument: 'EURUSD',
      side: 'SELL',
      entry: '1.08950',
      exit: '1.09100',
      lots: (0.35 * scale).toFixed(2),
      outcome: 'LOSS',
      rValue: -1.0,
      pnl: -Math.round(45 * scale),
      quality: 'B Premature Entry',
      score: 66,
      session: 'London Open',
      hold: '18 mins',
      notes: 'Entered before 15m order block retest was verified. Cut loss at stop level.',
      time: 'Oct 17 09:40',
    },
    {
      instrument: 'XAUUSD',
      side: 'BUY',
      entry: '2604.10',
      exit: '2616.50',
      lots: (0.25 * scale).toFixed(2),
      outcome: 'WIN',
      rValue: 3.1,
      pnl: Math.round(124 * scale),
      quality: 'A+ Asia Low Sweep',
      score: 100,
      session: 'NY AM Session',
      hold: '45 mins',
      notes: 'Clean sweep of Asian Low into 4H demand zone. Trailed stop into profit target.',
      time: 'Oct 15 15:10',
    },
    {
      instrument: 'US100',
      side: 'BUY',
      entry: '20,180.0',
      exit: '20,290.0',
      lots: (0.45 * scale).toFixed(2),
      outcome: 'WIN',
      rValue: 2.2,
      pnl: Math.round(110 * scale),
      quality: 'A FVG Fill',
      score: 100,
      session: 'NY AM Session',
      hold: '26 mins',
      notes: 'Morning liquidity raid below opening range followed by strong institutional buying.',
      time: 'Oct 12 14:45',
    },
  ];

  const targetCount = Math.min(count, sampleTemplates.length);
  return sampleTemplates.slice(0, targetCount).map((t, idx) => ({
    id: `MT5-${Math.floor(920000 + idx * 314)}`,
    accountId: account.id,
    time: t.time,
    instrument: t.instrument,
    side: t.side,
    entry: t.entry,
    exit: t.exit,
    lots: t.lots,
    outcome: t.outcome,
    rMultiple: `${t.rValue >= 0 ? '+' : ''}${t.rValue.toFixed(1)}R`,
    rValue: t.rValue,
    netPnl: `${t.pnl >= 0 ? '+' : '-'}$${Math.abs(t.pnl).toFixed(2)}`,
    pnlValue: t.pnl,
    quality: t.quality,
    discipline: t.score === 100 ? '100% (6/6)' : '66% (Early)',
    disciplineScore: t.score,
    session: t.session,
    holdDuration: t.hold,
    fees: '-$1.70',
    notes: t.notes,
    rulesPassed: t.score === 100 ? 6 : 4,
  }));
}

/**
 * Parses MT5 CSV or raw tab/comma-separated text from an MT5 report
 */
export function parseMt5ReportText(text: string, accountId: string): TradeExecution[] {
  const lines = text.trim().split('\n');
  const results: TradeExecution[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.toLowerCase().includes('ticket') || line.toLowerCase().includes('position')) {
      continue;
    }

    const parts = line.split(/[,\t;|]+/).map((p) => p.trim());
    if (parts.length >= 5) {
      const ticket = parts[0] || `MT5-${Math.floor(800000 + Math.random() * 100000)}`;
      const time = parts[1] || 'Today 12:00';
      const typeRaw = (parts[2] || 'buy').toLowerCase();
      const side: 'BUY' | 'SELL' = typeRaw.includes('sell') ? 'SELL' : 'BUY';
      const lots = parts[3] || '0.20';
      let rawSymbol = (parts[4] || 'XAUUSD').toUpperCase();
      let instrument: 'XAUUSD' | 'EURUSD' | 'US100' | 'GBPUSD' = 'XAUUSD';
      if (rawSymbol.includes('EUR')) instrument = 'EURUSD';
      else if (rawSymbol.includes('100') || rawSymbol.includes('NAS')) instrument = 'US100';
      else if (rawSymbol.includes('GBP')) instrument = 'GBPUSD';

      const entry = parts[5] || (instrument === 'XAUUSD' ? '2650.00' : '1.08500');
      const pnlRaw = parseFloat(parts[parts.length - 1]?.replace(/[^0-9.-]/g, '')) || 50.0;
      const outcome: 'WIN' | 'LOSS' | 'BE' = pnlRaw > 0 ? 'WIN' : pnlRaw < 0 ? 'LOSS' : 'BE';
      const rValue = pnlRaw > 0 ? 2.5 : pnlRaw < 0 ? -1.0 : 0.0;

      results.push({
        id: ticket.startsWith('MT5-') ? ticket : `MT5-${ticket}`,
        accountId,
        time,
        instrument,
        side,
        entry,
        lots,
        outcome,
        rMultiple: `${rValue >= 0 ? '+' : ''}${rValue.toFixed(1)}R`,
        rValue,
        netPnl: `${pnlRaw >= 0 ? '+' : '-'}$${Math.abs(pnlRaw).toFixed(2)}`,
        pnlValue: pnlRaw,
        quality: outcome === 'WIN' ? 'A+ MT5 Execution' : 'B- MT5 Execution',
        discipline: outcome === 'WIN' ? '100% (6/6)' : '66% (Early)',
        disciplineScore: outcome === 'WIN' ? 100 : 66,
        session: 'London / NY Overlap',
        holdDuration: '28 mins',
        fees: '-$1.70',
        notes: `Imported deal from MT5 Account #${accountId}`,
        rulesPassed: outcome === 'WIN' ? 6 : 4,
      });
    }
  }

  return results;
}
