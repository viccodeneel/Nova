export type NavSection =
  | 'overview'
  | 'trade-journal'
  | 'analytics'
  | 'accounts'
  | 'settings';

export interface TradeExecution {
  id: string;
  accountId?: string;
  time: string;
  instrument: string;
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
  server: '',
  broker: '',
  phase: 'Phase 1',
  baseBalance: 0,
  targetPercent: 6.0,
  dailyLossPercent: 5.0,
  maxLossPercent: 10.0,
  bridgeProtocol: 'EA_WEBHOOK',
  apiToken: '',
  webhookUrl: '',
  latencyMs: 0,
};

export const INITIAL_TRADES: TradeExecution[] = [];

export const INITIAL_DLM_RULES: DlmRule[] = [
  {
    id: 'rule-1',
    label: '1H Bias Confirmation',
    statusText: 'Not verified',
    passed: false,
  },
  {
    id: 'rule-2',
    label: 'Key Liquidity Pool',
    statusText: 'Not verified',
    passed: false,
  },
  {
    id: 'rule-3',
    label: 'Liquidity Sweep',
    statusText: 'Not verified',
    passed: false,
  },
  {
    id: 'rule-4',
    label: '1M BOS Displacement',
    statusText: 'Not verified',
    passed: false,
  },
  {
    id: 'rule-5',
    label: 'Bullish FVG Retest',
    statusText: 'Not verified',
    passed: false,
  },
  {
    id: 'rule-6',
    label: 'Tape Entry Confirmation',
    statusText: 'Not verified',
    passed: false,
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
    if (parts.length >= 7) {
      const ticket = parts[0];
      const time = parts[1];
      const typeRaw = (parts[2] || 'buy').toLowerCase();
      if (!ticket || !time || (!typeRaw.includes('buy') && !typeRaw.includes('sell'))) continue;
      const side: 'BUY' | 'SELL' = typeRaw.includes('sell') ? 'SELL' : 'BUY';
      const lots = parts[3];
      const instrument = (parts[4] || '').toUpperCase();
      const entry = parts[5];
      const pnlRaw = Number(parts[parts.length - 1]?.replace(/[$,\s]/g, '').replace(/[^0-9.-]/g, ''));
      if (!lots || !instrument || !entry || !Number.isFinite(Number(entry)) || !Number.isFinite(Number(lots)) || !Number.isFinite(pnlRaw)) continue;
      const outcome: 'WIN' | 'LOSS' | 'BE' = pnlRaw > 0 ? 'WIN' : pnlRaw < 0 ? 'LOSS' : 'BE';
      const rValue = 0;

      results.push({
        id: ticket.startsWith('MT5-') ? ticket : `MT5-${ticket}`,
        accountId,
        time,
        instrument,
        side,
        entry,
        lots,
        outcome,
        rMultiple: 'Not recorded',
        rValue,
        netPnl: `${pnlRaw >= 0 ? '+' : '-'}$${Math.abs(pnlRaw).toFixed(2)}`,
        pnlValue: pnlRaw,
        quality: 'Not reviewed',
        discipline: 'Not reviewed',
        disciplineScore: 0,
        session: 'Unknown',
        holdDuration: 'Unknown',
        fees: 'Not reported',
        notes: '',
        rulesPassed: 0,
      });
    }
  }

  return results;
}
