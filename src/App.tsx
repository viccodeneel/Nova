import React, { useEffect, useState } from 'react';
import {
  calculateAccountMetricsFromTrades,
  DEFAULT_MT5_CONFIG,
  DlmRule,
  generatePastTradesForAccount,
  INITIAL_DLM_RULES,
  INITIAL_PROP_ACCOUNTS,
  INITIAL_TRADES,
  Mt5BridgeConfig,
  NavSection,
  PropAccount,
  TradeExecution,
} from './data/terminalData';
import { OverviewScreen } from './components/OverviewScreen';
import { TradingScreen } from './components/TradingScreen';
import { TradeJournalScreen } from './components/TradeJournalScreen';
import {
  AccountsScreen,
  AiAssistantScreen,
  AnalyticsScreen,
  FinanceScreen,
  GoalsScreen,
  SettingsScreen,
} from './components/SecondaryScreens';
import { Mt5ConnectModal } from './components/Mt5ConnectModal';
import { Mt5ImportModal } from './components/Mt5ImportModal';
import { ApiClient } from './services/apiClient.ts';

const NOVA_LOGO_URL =
  'https://lh3.googleusercontent.com/aida/AEtjO1XD4M77xnZQ70lLOhQCpk4hkRgOgJJp6zz9laW3H4999RDhwAeVzvLfTUbDK75_X7-5ALD5sByWj1mU5nkTDdK96Wo8foIKfnXqBmzuQgF0Sykb0lU1tg876aDqbMq-Ka3G-UNjmHxFN6kc6N1XjSdk54h7lglg0BxkGpSg3o2PznK93dmd0_ZYrGbd8_VROMenmszQi5ny02R8nEe3E5433wiB70U5i2vqIP5MGwZDQrWCOTdG_vPojBjP';

const VICCO_AVATAR_URL =
  'https://lh3.googleusercontent.com/aida/AEtjO1URCEo8ipbiDSP4cwCoMr6kDWZV9kViK8ScCweXwvBK2b3B7WBjyR1UQiiWjBU6VHT_hRCpXlNrQhESqVPjQL0QJdUDYLblEJ2Od73oxDe_JtoOx3PLpkaPKLyCFWCSguw4f1IafJYPo3seaYMyV-tUYeE5D8aOP2YOmqEYhgul3NhJg6qEZ8Di8UKAaXknP8P_mRDZx3gt1oGPbuB_5zhZdJLlmcvzpcV1Vdd2MLIALEg9kfKUiWcnE-aP';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: string;
  hoverColor: string;
  badge?: string;
}> = [
  { id: 'overview', label: 'Overview', icon: 'dashboard', hoverColor: 'group-hover:text-purple-300' },
  {
    id: 'trading',
    label: 'Trading',
    icon: 'candlestick_chart',
    hoverColor: 'group-hover:text-cyan-400',
  },
  {
    id: 'trade-journal',
    label: 'Trade Journal',
    icon: 'auto_stories',
    hoverColor: 'group-hover:text-purple-400',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'analytics',
    hoverColor: 'group-hover:text-emerald-400',
  },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: 'account_balance',
    hoverColor: 'group-hover:text-amber-400',
  },
  { id: 'goals', label: 'Goals', icon: 'flag', hoverColor: 'group-hover:text-sky-400' },
  {
    id: 'finance',
    label: 'Finance',
    icon: 'account_balance_wallet',
    hoverColor: 'group-hover:text-teal-400',
  },
  {
    id: 'ai-assistant',
    label: 'AI Assistant',
    icon: 'psychology',
    hoverColor: 'group-hover:text-purple-300',
    badge: 'AI',
  },
  { id: 'settings', label: 'Settings', icon: 'tune', hoverColor: 'group-hover:text-slate-200' },
];

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSection>('overview');

  // Load from localStorage or defaults
  const [accounts, setAccounts] = useState<PropAccount[]>(() => {
    try {
      const saved = localStorage.getItem('nova_mt5_accounts');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_PROP_ACCOUNTS;
  });

  const [activeAccountId, setActiveAccountId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('nova_mt5_active_id');
      if (saved) return saved;
    } catch {
      // ignore
    }
    return accounts[0]?.id || 'mt5-real-primary';
  });

  const [trades, setTrades] = useState<TradeExecution[]>(() => {
    try {
      const saved = localStorage.getItem('nova_mt5_trades');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_TRADES;
  });

  const [mt5Config, setMt5Config] = useState<Mt5BridgeConfig>(() => {
    try {
      const saved = localStorage.getItem('nova_mt5_config');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_MT5_CONFIG;
  });

  const [dlmRules, setDlmRules] = useState<DlmRule[]>(INITIAL_DLM_RULES);
  const [selectedTrade, setSelectedTrade] = useState<TradeExecution | null>(null);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [targetImportAccount, setTargetImportAccount] = useState<PropAccount | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<{ success: boolean; message: string } | null>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);

  // Header Interactive States
  const [utcSeconds, setUtcSeconds] = useState<number>(13 * 3600 + 42 * 60 + 18);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [showAlertsPopover, setShowAlertsPopover] = useState<boolean>(false);
  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false);

  // Initial load from backend API
  useEffect(() => {
    ApiClient.getAccounts().then((backendAccounts) => {
      if (backendAccounts && backendAccounts.length > 0) {
        const mapped: PropAccount[] = backendAccounts.map((a: any) => ({
          id: a.id,
          name: a.account_name,
          ref: `#${a.account_number}-${(a.broker_name || 'FP').slice(0, 2).toUpperCase()}`,
          shortRef: `${a.broker_name} #${a.account_number}`,
          bridge: `${a.server_name} • LD4 Bridge`,
          phase: a.prop_phase?.phase_name || 'Phase 1',
          baseBalance: Number(a.starting_balance),
          currentBalance: Number(a.current_balance),
          liveEquity: Number(a.current_equity),
          floatingPnl: Number((a.current_equity - a.current_balance).toFixed(2)),
          netProfit: Number((a.current_balance - a.starting_balance).toFixed(2)),
          roiPercent:
            a.starting_balance > 0
              ? Number(
                  (((a.current_balance - a.starting_balance) / a.starting_balance) * 100).toFixed(2)
                )
              : 0,
          targetProfit: Number(a.prop_phase?.profit_target_amount || a.starting_balance * 0.06),
          targetPercent: Number(a.prop_phase?.profit_target_percent || 6),
          passThreshold: Number(
            a.starting_balance + (a.prop_phase?.profit_target_amount || a.starting_balance * 0.06)
          ),
          dailyLimit: Number(a.prop_firm?.daily_loss_limit || a.starting_balance * 0.05),
          currentDailyDrawdown: Number(a.prop_firm?.current_daily_drawdown || 0),
          maxLossLimit: Number(a.prop_firm?.max_loss_limit || a.starting_balance * 0.1),
          currentMaxDrawdown: Number(a.prop_firm?.current_max_drawdown || 0),
          peakWater: Number(a.prop_firm?.peak_watermark || a.starting_balance),
          status: (a.prop_firm?.breach_status as any) || 'SAFE',
          isRealConnected: a.connection_status === 'CONNECTED',
          tradeCount: a.trades_count || 0,
        }));
        setAccounts(mapped);
        if (backendAccounts[0]?.last_synced_at) {
          setLastSyncedTime(backendAccounts[0].last_synced_at);
        }
      }
    });

    ApiClient.getTrades().then((backendTrades) => {
      if (backendTrades && backendTrades.length > 0) {
        const mapped: TradeExecution[] = backendTrades.map((t: any) => ({
          id: `MT5-${t.primary_ticket || t.id}`,
          accountId: t.trading_account_id,
          time: t.opened_at
            ? new Date(t.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Recent',
          instrument: t.symbol,
          side: t.direction,
          entry: t.entry_price?.toString() || '0',
          exit: t.exit_price?.toString(),
          lots: t.volume?.toString() || '0.25',
          outcome: t.outcome,
          rMultiple: `${t.r_multiple >= 0 ? '+' : ''}${t.r_multiple}R`,
          rValue: Number(t.r_multiple),
          netPnl: `${t.net_profit >= 0 ? '+' : '-'}$${Math.abs(t.net_profit).toFixed(2)}`,
          pnlValue: Number(t.net_profit),
          quality:
            t.confluences?.setup_quality || (t.outcome === 'WIN' ? 'A+ DLM Sweep' : 'B- Setup'),
          discipline: t.confluences?.discipline_score
            ? `${t.confluences.discipline_score}% (${t.confluences.rules_followed_count || 6}/6)`
            : '100% (6/6)',
          disciplineScore: t.confluences?.discipline_score || 100,
          session: t.session_window || 'London / NY Overlap',
          holdDuration: t.hold_duration || '24 mins',
          fees: `-$${(t.commission || 1.7).toFixed(2)}`,
          notes: t.confluences?.notes || t.comment || 'MT5 trade execution',
          rulesPassed: t.confluences?.rules_followed_count || 6,
        }));
        setTrades(mapped);
      }
    });
  }, []);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('nova_mt5_trades', JSON.stringify(trades));
    } catch {
      // ignore
    }
  }, [trades]);

  useEffect(() => {
    try {
      localStorage.setItem('nova_mt5_accounts', JSON.stringify(accounts));
    } catch {
      // ignore
    }
  }, [accounts]);

  useEffect(() => {
    try {
      localStorage.setItem('nova_mt5_active_id', activeAccountId);
    } catch {
      // ignore
    }
  }, [activeAccountId]);

  useEffect(() => {
    try {
      localStorage.setItem('nova_mt5_config', JSON.stringify(mt5Config));
    } catch {
      // ignore
    }
  }, [mt5Config]);

  useEffect(() => {
    const timer = setInterval(() => {
      setUtcSeconds((prev) => (prev + 1) % 86400);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUtcClock = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600)
      .toString()
      .padStart(2, '0');
    const mins = Math.floor((totalSec % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const secs = (totalSec % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const activeAccount =
    accounts.find((a) => a.id === activeAccountId) || accounts[0];

  const handleToggleRule = (ruleId: string) => {
    setDlmRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, passed: !r.passed } : r))
    );
  };

  const handleAddTrade = (newTrade: TradeExecution) => {
    setTrades((prev) => [newTrade, ...prev]);
    if (newTrade.pnlValue !== 0) {
      setAccounts((prev) =>
        prev.map((acc) => {
          if (acc.id !== activeAccount.id) return acc;
          const updatedBalance = Number((acc.currentBalance + newTrade.pnlValue).toFixed(2));
          const updatedNet = Number((acc.netProfit + newTrade.pnlValue).toFixed(2));
          const updatedRoi = Number(((updatedNet / acc.baseBalance) * 100).toFixed(2));
          const currentDd =
            newTrade.pnlValue < 0
              ? Number((acc.currentDailyDrawdown + Math.abs(newTrade.pnlValue)).toFixed(2))
              : acc.currentDailyDrawdown;
          const maxDd =
            newTrade.pnlValue < 0
              ? Number((acc.currentMaxDrawdown + Math.abs(newTrade.pnlValue)).toFixed(2))
              : acc.currentMaxDrawdown;

          return {
            ...acc,
            currentBalance: updatedBalance,
            liveEquity: updatedBalance,
            floatingPnl: 0,
            netProfit: updatedNet,
            roiPercent: updatedRoi,
            currentDailyDrawdown: currentDd,
            currentMaxDrawdown: maxDd,
            peakWater: Math.max(acc.peakWater, updatedBalance),
          };
        })
      );
    }
  };

  const handleExecuteOrder = (order: {
    instrument: 'XAUUSD' | 'EURUSD' | 'US100' | 'GBPUSD';
    side: 'BUY' | 'SELL';
    entry: string;
    lots: string;
    riskDollars: number;
    targetR: number;
  }) => {
    const profit = Number((order.riskDollars * order.targetR).toFixed(2));
    const passedRules = dlmRules.filter((r) => r.passed).length;
    const isFullCompliance = passedRules === dlmRules.length;

    const newExecution: TradeExecution = {
      id: `TX-${Math.floor(88425 + Math.random() * 900)}`,
      time: `Today ${formatUtcClock(utcSeconds).slice(0, 5)}`,
      instrument: order.instrument,
      side: order.side,
      entry: order.entry,
      lots: order.lots,
      outcome: 'WIN',
      rMultiple: `+${order.targetR.toFixed(1)}R`,
      rValue: order.targetR,
      netPnl: `+$${profit.toFixed(2)}`,
      pnlValue: profit,
      quality: isFullCompliance ? 'A+ DLM Sweep' : 'B+ Manual Entry',
      discipline: isFullCompliance
        ? `100% (${passedRules}/6)`
        : `${Math.round((passedRules / 6) * 100)}% (${passedRules}/6)`,
      disciplineScore: isFullCompliance ? 100 : Math.round((passedRules / 6) * 100),
      session: 'London / NY Overlap',
      holdDuration: '18 mins',
      fees: '-$1.70',
      notes: `Executed ${order.lots} lots ${order.instrument} ${order.side} @ ${order.entry} via LD4 Bridge.`,
      rulesPassed: passedRules,
    };

    handleAddTrade(newExecution);
  };

  const handleConnectMt5Account = (
    newAccount: PropAccount,
    newConfig: Mt5BridgeConfig,
    pastTrades?: TradeExecution[]
  ) => {
    setAccounts((prev) => {
      const filtered = prev.filter((a) => a.id !== newAccount.id);
      return [newAccount, ...filtered];
    });
    setActiveAccountId(newAccount.id);
    setMt5Config(newConfig);

    if (pastTrades && pastTrades.length > 0) {
      setTrades((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const filteredNew = pastTrades.filter((t) => !existingIds.has(t.id));
        return [...filteredNew, ...prev];
      });
    }
  };

  const handleDeleteAccount = (accountId: string) => {
    const remaining = accounts.filter((a) => a.id !== accountId);
    setAccounts(remaining);
    // Remove all trades associated with the deleted account
    setTrades((prev) => prev.filter((t) => t.accountId !== accountId));

    if (activeAccountId === accountId) {
      if (remaining.length > 0) {
        setActiveAccountId(remaining[0].id);
      } else {
        // Fallback default clean starter account if all accounts deleted
        const freshAccount: PropAccount = {
          id: 'mt5-clean-primary',
          name: 'Primary MT5 Terminal',
          ref: '#REAL-MT5',
          shortRef: 'MT5 Terminal',
          bridge: 'London LD4 Server',
          phase: 'Phase 1',
          baseBalance: 10000.0,
          currentBalance: 10000.0,
          liveEquity: 10000.0,
          floatingPnl: 0,
          netProfit: 0,
          roiPercent: 0,
          targetProfit: 600.0,
          targetPercent: 6.0,
          passThreshold: 10600.0,
          dailyLimit: 500.0,
          currentDailyDrawdown: 0,
          maxLossLimit: 1000.0,
          currentMaxDrawdown: 0,
          peakWater: 10000.0,
          status: 'SAFE',
          isRealConnected: false,
        };
        setAccounts([freshAccount]);
        setActiveAccountId(freshAccount.id);
      }
    }
  };

  const handleSyncPastTradesForAccount = (accountId: string, count: number = 5) => {
    const targetAccount = accounts.find((a) => a.id === accountId) || activeAccount;
    if (!targetAccount) return;

    const newPastTrades = generatePastTradesForAccount(targetAccount, count);

    setTrades((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const filteredNew = newPastTrades.filter((t) => !existingIds.has(t.id));
      const allUpdated = [...filteredNew, ...prev];

      // Recalculate target account balance & stats
      const thisAccountTrades = allUpdated.filter((t) => t.accountId === targetAccount.id);
      const updatedAccount = calculateAccountMetricsFromTrades(targetAccount, thisAccountTrades);

      setAccounts((prevAccs) =>
        prevAccs.map((acc) => (acc.id === targetAccount.id ? updatedAccount : acc))
      );

      return allUpdated;
    });
  };

  const handleImportTrades = (importedTrades: TradeExecution[], newBalance?: number) => {
    const target = targetImportAccount || activeAccount;
    const taggedTrades = importedTrades.map((t) => ({
      ...t,
      accountId: target.id,
    }));

    setTrades((prev) => {
      const allUpdated = [...taggedTrades, ...prev];
      const thisAccountTrades = allUpdated.filter((t) => t.accountId === target.id);
      const updatedAccount = calculateAccountMetricsFromTrades(target, thisAccountTrades);

      setAccounts((prevAccs) =>
        prevAccs.map((acc) => (acc.id === target.id ? updatedAccount : acc))
      );

      return allUpdated;
    });
  };

  const handleDeleteTrade = (tradeId: string) => {
    setTrades((prev) => {
      const updated = prev.filter((t) => t.id !== tradeId);
      const thisAccountTrades = updated.filter((t) => t.accountId === activeAccount.id);
      const updatedAccount = calculateAccountMetricsFromTrades(activeAccount, thisAccountTrades);

      setAccounts((prevAccs) =>
        prevAccs.map((acc) => (acc.id === activeAccount.id ? updatedAccount : acc))
      );

      return updated;
    });
  };

  const handleClearAllData = () => {
    setTrades([]);
    setAccounts([
      {
        ...activeAccount,
        currentBalance: activeAccount.baseBalance,
        liveEquity: activeAccount.baseBalance,
        floatingPnl: 0,
        netProfit: 0,
        roiPercent: 0,
        currentDailyDrawdown: 0,
        currentMaxDrawdown: 0,
        peakWater: activeAccount.baseBalance,
      },
    ]);
    try {
      localStorage.removeItem('nova_mt5_trades');
    } catch {
      // ignore
    }
  };

  const handleSyncFromHeader = async () => {
    setIsSyncing(true);
    try {
      const res = await ApiClient.syncAccount(activeAccount.id);
      const nowIso = new Date().toISOString();
      setLastSyncedTime(nowIso);

      const backendAccounts = await ApiClient.getAccounts();
      if (backendAccounts && backendAccounts.length > 0) {
        const mapped: PropAccount[] = backendAccounts.map((a: any) => ({
          id: a.id,
          name: a.account_name,
          ref: `#${a.account_number}-${(a.broker_name || 'FP').slice(0, 2).toUpperCase()}`,
          shortRef: `${a.broker_name} #${a.account_number}`,
          bridge: `${a.server_name} • LD4 Bridge`,
          phase: a.prop_phase?.phase_name || 'Phase 1',
          baseBalance: Number(a.starting_balance),
          currentBalance: Number(a.current_balance),
          liveEquity: Number(a.current_equity),
          floatingPnl: Number((a.current_equity - a.current_balance).toFixed(2)),
          netProfit: Number((a.current_balance - a.starting_balance).toFixed(2)),
          roiPercent:
            a.starting_balance > 0
              ? Number(
                  (((a.current_balance - a.starting_balance) / a.starting_balance) * 100).toFixed(2)
                )
              : 0,
          targetProfit: Number(a.prop_phase?.profit_target_amount || a.starting_balance * 0.06),
          targetPercent: Number(a.prop_phase?.profit_target_percent || 6),
          passThreshold: Number(
            a.starting_balance + (a.prop_phase?.profit_target_amount || a.starting_balance * 0.06)
          ),
          dailyLimit: Number(a.prop_firm?.daily_loss_limit || a.starting_balance * 0.05),
          currentDailyDrawdown: Number(a.prop_firm?.current_daily_drawdown || 0),
          maxLossLimit: Number(a.prop_firm?.max_loss_limit || a.starting_balance * 0.1),
          currentMaxDrawdown: Number(a.prop_firm?.current_max_drawdown || 0),
          peakWater: Number(a.prop_firm?.peak_watermark || a.starting_balance),
          status: (a.prop_firm?.breach_status as any) || 'SAFE',
          isRealConnected: a.connection_status === 'CONNECTED',
          tradeCount: a.trades_count || 0,
        }));
        setAccounts(mapped);
      }

      const backendTrades = await ApiClient.getTrades(activeAccount.id);
      if (backendTrades && backendTrades.length > 0) {
        const mapped: TradeExecution[] = backendTrades.map((t: any) => ({
          id: `MT5-${t.primary_ticket || t.id}`,
          accountId: t.trading_account_id,
          time: t.opened_at
            ? new Date(t.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Recent',
          instrument: t.symbol,
          side: t.direction,
          entry: t.entry_price?.toString() || '0',
          exit: t.exit_price?.toString(),
          lots: t.volume?.toString() || '0.25',
          outcome: t.outcome,
          rMultiple: `${t.r_multiple >= 0 ? '+' : ''}${t.r_multiple}R`,
          rValue: Number(t.r_multiple),
          netPnl: `${t.net_profit >= 0 ? '+' : '-'}$${Math.abs(t.net_profit).toFixed(2)}`,
          pnlValue: Number(t.net_profit),
          quality:
            t.confluences?.setup_quality || (t.outcome === 'WIN' ? 'A+ DLM Sweep' : 'B- Setup'),
          discipline: t.confluences?.discipline_score
            ? `${t.confluences.discipline_score}% (${t.confluences.rules_followed_count || 6}/6)`
            : '100% (6/6)',
          disciplineScore: t.confluences?.discipline_score || 100,
          session: t.session_window || 'London / NY Overlap',
          holdDuration: t.hold_duration || '24 mins',
          fees: `-$${(t.commission || 1.7).toFixed(2)}`,
          notes: t.confluences?.notes || t.comment || 'MT5 trade execution',
          rulesPassed: t.confluences?.rules_followed_count || 6,
        }));
        setTrades(mapped);
      }

      setSyncToast({
        success: res.success,
        message: res.message || (res.success ? 'Account and trade history synced from MT5.' : 'Sync complete.'),
      });
    } catch (err) {
      setSyncToast({
        success: false,
        message: (err as Error).message || 'Failed to reach MT5 connector.',
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncToast(null), 5000);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090d] text-slate-100 antialiased selection:bg-purple-500/30 selection:text-white">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-[750px] h-[550px] bg-purple-600/10 rounded-full blur-[140px]"></div>
        <div className="absolute top-1/3 -right-24 w-[600px] h-[600px] bg-cyan-500/[0.06] rounded-full blur-[150px]"></div>
        <div className="absolute -bottom-40 left-1/3 w-[800px] h-[600px] bg-emerald-500/[0.05] rounded-full blur-[160px]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
      </div>

      {/* Sidebar Navigation */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-[#0a0c13]/90 backdrop-blur-2xl z-50 flex flex-col justify-between border-r border-white/[0.07] shadow-[4px_0_30px_rgba(0,0,0,0.6)]">
        <div className="flex flex-col">
          <div className="h-16 px-4 flex items-center justify-between border-b border-white/[0.06] bg-white/[0.01]">
            <div
              onClick={() => setActiveNav('overview')}
              className="flex items-center gap-3 cursor-pointer"
            >
              <div className="relative w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center p-0.5 bg-gradient-to-b from-white/15 to-white/0 border border-white/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                <img
                  alt="NOVA Apex Emblem"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                  src={NOVA_LOGO_URL}
                />
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-sm uppercase tracking-wider text-white font-bold leading-none">
                  NOVA
                </span>
                <span className="font-label-tech text-[9px] text-cyan-400 font-semibold tracking-widest leading-none mt-1">
                  INTELLIGENCE OS
                </span>
              </div>
            </div>
            <span className="font-label-tech text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-medium shadow-[0_0_10px_rgba(168,85,247,0.2)]">
              v2.4 Pro
            </span>
          </div>

          <div className="px-5 pt-5 pb-2 flex items-center justify-between">
            <span className="font-label-tech text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
              Sovereign Terminal
            </span>
            <span className="h-1 w-1 rounded-full bg-cyan-400"></span>
          </div>

          <nav className="px-3 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveNav(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={
                    isActive
                      ? 'relative group flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600/30 via-purple-600/15 to-transparent text-white font-medium border border-purple-500/30 shadow-[0_0_20px_rgba(147,51,234,0.18)] transition-all duration-200 w-full text-left'
                      : 'flex items-center gap-3 px-3.5 py-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] transition-all duration-150 font-body-md text-sm group w-full text-left'
                  }
                >
                  {isActive && (
                    <div className="absolute left-0 top-2 bottom-2 w-1 bg-gradient-to-b from-purple-400 to-indigo-400 rounded-r-full shadow-[0_0_8px_#a855f7]"></div>
                  )}
                  <span
                    className={`material-symbols-outlined text-[19px] transition-colors ${
                      isActive ? 'text-purple-300' : `text-slate-400 ${item.hoverColor}`
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span
                    className={
                      isActive ? 'font-body-md text-sm font-semibold tracking-tight' : ''
                    }
                  >
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className="ml-auto font-label-tech text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Institutional MT5 Connectivity Badge Card */}
        <div
          onClick={() => setIsConnectModalOpen(true)}
          title="Click to configure or connect real MT5 Account"
          className="p-3 m-3 rounded-xl bg-gradient-to-b from-[#111420] to-[#0a0c12] border border-white/[0.08] shadow-[0_8px_20px_rgba(0,0,0,0.5)] relative overflow-hidden cursor-pointer hover:border-purple-500/40 transition-all group"
        >
          <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>
              </span>
              <span className="font-label-tech text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                {mt5Config.isConnected ? 'MT5 Connected (Live)' : 'Connect Real MT5'}
              </span>
            </div>
            <span className="font-label-numeric-sm text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-slate-400 font-medium">
              LD4
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-label-numeric-sm text-[11px] text-slate-300 flex items-center gap-1">
              <span className="text-emerald-400 font-bold">{mt5Config.latencyMs}ms</span>
              <span className="text-slate-500">•</span>
              London Equinix
            </span>
            <span className="font-label-tech text-[9px] px-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
              ULTRA-LOW
            </span>
          </div>
          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
            <span className="font-label-tech text-[10px] text-slate-400">Active Prop</span>
            <span className="font-label-numeric-sm text-[11px] text-purple-300 font-semibold tracking-tight truncate max-w-[120px]">
              {activeAccount.shortRef}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Wrapper */}
      <div className="pl-64 relative z-10">
        <header className="fixed top-0 left-64 right-0 h-16 bg-[#08090e]/80 backdrop-blur-2xl z-40 px-6 flex items-center justify-between border-b border-white/[0.07] shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2.5">
              <span className="font-headline-sm text-base text-white font-semibold tracking-tight">
                Good morning, Vicco
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-label-tech text-[10px] font-semibold tracking-wider shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                SYSTEM ARMED
              </span>
            </div>
            <span className="font-body-sm text-[11px] text-slate-400 font-normal mt-0.5 flex items-center gap-1.5">
              <span>Market Session:</span>
              <span className="text-slate-200 font-medium">London / NY Overlap</span>
              <span className="text-slate-600">•</span>
              <span className="text-rose-400 font-medium flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                High Volatility Expected
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden xl:flex items-center gap-2">
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] px-3 py-1.5 rounded-lg shadow-inner">
                <span className="material-symbols-outlined text-cyan-400 text-sm leading-none">
                  schedule
                </span>
                <span className="font-label-tech text-[10px] text-slate-400 uppercase font-semibold">
                  UTC CLOCK
                </span>
                <span className="font-label-numeric-md text-xs text-white font-bold tracking-wider tabular-nums">
                  {formatUtcClock(utcSeconds)}
                </span>
              </div>
              <div
                onClick={() => setIsConnectModalOpen(true)}
                title="Click to configure live MT5 Bridge"
                className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/30 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
              >
                <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]"></span>
                <span className="font-label-tech text-[11px] text-slate-300 font-medium">
                  {mt5Config.isConnected ? `${mt5Config.server} / Bridge Online` : 'Configure Real MT5 Bridge'}
                </span>
              </div>
            </div>

            <div className="h-6 w-px bg-white/10 mx-1"></div>

            <div className="flex items-center gap-2 relative">
              <button
                onClick={() => setAudioMuted(!audioMuted)}
                className={`flex items-center justify-center h-9 w-9 rounded-lg border transition-all shadow-sm ${
                  audioMuted
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                    : 'bg-white/[0.03] border-white/[0.07] text-slate-300 hover:text-white hover:bg-white/[0.08] hover:border-white/15'
                }`}
                title="Risk Lockdown / Audio Telemetry"
                type="button"
              >
                <span className="material-symbols-outlined text-[17px]">
                  {audioMuted ? 'volume_off' : 'volume_up'}
                </span>
              </button>

              <button
                onClick={() => {
                  setShowAlertsPopover(!showAlertsPopover);
                  setShowProfileMenu(false);
                }}
                className="relative flex items-center justify-center h-9 w-9 rounded-lg bg-white/[0.03] border border-white/[0.07] text-slate-300 hover:text-white hover:bg-white/[0.08] hover:border-white/15 transition-all shadow-sm"
                title="Operational Alerts"
                type="button"
              >
                <span className="material-symbols-outlined text-[17px]">notifications</span>
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white font-label-numeric-sm text-[9px] font-bold ring-2 ring-[#08090e]">
                  1
                </span>
              </button>

              {showAlertsPopover && (
                <div className="absolute right-12 top-12 w-80 terminal-glass rounded-xl p-4 border border-white/15 z-50 shadow-2xl">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                    <span className="font-label-tech text-[10px] text-purple-300 uppercase font-bold">
                      Operational Telemetry Alerts
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAlertsPopover(false)}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      Close
                    </button>
                  </div>
                  <div className="flex flex-col gap-2.5 text-xs">
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <span className="font-bold text-emerald-300 block">
                        MT5 Bridge Ready
                      </span>
                      <span className="text-slate-300 text-[11px]">
                        Demo data cleared. Connect your live MT5 account to begin execution stream.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div
                onClick={() => {
                  setShowProfileMenu(!showProfileMenu);
                  setShowAlertsPopover(false);
                }}
                className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-xl bg-white/[0.02] border border-white/[0.07] hover:border-white/15 hover:bg-white/[0.05] transition-all cursor-pointer"
              >
                <div className="relative">
                  <img
                    alt="Vicco R."
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-lg object-cover ring-1 ring-purple-400/40"
                    src={VICCO_AVATAR_URL}
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#08090e]"></span>
                </div>
                <div className="hidden md:flex flex-col text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="font-body-md text-xs text-white font-semibold leading-none">
                      Vicco R.
                    </span>
                    <span
                      className="material-symbols-outlined text-cyan-400 text-xs leading-none"
                      title="Verified Prop Trader"
                    >
                      verified
                    </span>
                  </div>
                  <span className="font-label-tech text-[9px] text-purple-300 uppercase tracking-wider font-semibold mt-0.5 leading-none">
                    Apex Funded Trader
                  </span>
                </div>
                <span className="material-symbols-outlined text-slate-500 text-sm leading-none ml-0.5">
                  expand_more
                </span>
              </div>

              {showProfileMenu && (
                <div className="absolute right-0 top-12 w-80 terminal-glass rounded-xl p-3.5 border border-white/15 z-50 shadow-2xl">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                    <span className="font-label-tech text-[10px] text-slate-400 uppercase font-semibold">
                      Connected MT5 Accounts ({accounts.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowProfileMenu(false)}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      Close
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
                    {accounts.map((acc) => {
                      const isActive = acc.id === activeAccount.id;
                      const accTradesCount = trades.filter((t) => t.accountId === acc.id).length;
                      return (
                        <div
                          key={acc.id}
                          className={`p-2.5 rounded-lg flex items-center justify-between transition-all ${
                            isActive
                              ? 'bg-purple-600/25 border border-purple-500/40 text-white'
                              : 'bg-white/[0.02] hover:bg-white/[0.06] text-slate-300'
                          }`}
                        >
                          <div
                            onClick={() => {
                              setActiveAccountId(acc.id);
                              setShowProfileMenu(false);
                            }}
                            className="cursor-pointer flex-1 mr-2"
                          >
                            <span className="font-body-sm text-xs font-bold block truncate max-w-[170px]">
                              {acc.name}
                            </span>
                            <span className="font-label-numeric-sm text-[10px] text-slate-400">
                              {acc.ref} • {accTradesCount} trades
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-label-numeric-sm text-xs text-emerald-400 font-bold tabular-nums">
                              ${acc.currentBalance.toLocaleString('en-US')}
                            </span>
                            {accounts.length > 1 && (
                              <button
                                type="button"
                                title="Delete account"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAccount(acc.id);
                                }}
                                className="w-6 h-6 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center transition-all"
                              >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setIsConnectModalOpen(true);
                      }}
                      className="mt-2 py-2 px-3 rounded-lg bg-purple-600/30 border border-purple-500/40 hover:bg-purple-600/50 text-purple-200 font-label-tech text-xs font-bold text-center"
                    >
                      + Connect Real MT5 Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="w-full pt-20 pb-12 px-6 lg:px-8">
          {activeNav === 'overview' && (
            <OverviewScreen
              activeAccount={activeAccount}
              trades={trades}
              dlmRules={dlmRules}
              onToggleRule={handleToggleRule}
              onNavigate={(section) => setActiveNav(section)}
              onSelectTrade={(trade) => {
                setSelectedTrade(trade);
                setActiveNav('trade-journal');
              }}
              onQuickExecute={() => setActiveNav('trading')}
              onOpenConnectModal={() => setIsConnectModalOpen(true)}
              onSyncPastTrades={() => handleSyncPastTradesForAccount(activeAccount.id, 5)}
              onOpenImportModal={() => {
                setTargetImportAccount(activeAccount);
                setIsImportModalOpen(true);
              }}
            />
          )}

          {activeNav === 'trading' && (
            <TradingScreen
              activeAccount={activeAccount}
              dlmRules={dlmRules}
              onToggleRule={handleToggleRule}
              onExecuteOrder={handleExecuteOrder}
            />
          )}

          {activeNav === 'trade-journal' && (
            <TradeJournalScreen
              trades={trades}
              selectedTrade={selectedTrade}
              accounts={accounts}
              activeAccountId={activeAccount.id}
              onSelectAccount={(accId) => setActiveAccountId(accId)}
              onSelectTrade={setSelectedTrade}
              onAddTrade={handleAddTrade}
              onDeleteTrade={handleDeleteTrade}
              onSyncPastTrades={handleSyncPastTradesForAccount}
              onOpenImportModal={() => {
                setTargetImportAccount(activeAccount);
                setIsImportModalOpen(true);
              }}
            />
          )}

          {activeNav === 'analytics' && <AnalyticsScreen trades={trades} />}

          {activeNav === 'accounts' && (
            <AccountsScreen
              accounts={accounts}
              activeAccountId={activeAccount.id}
              trades={trades}
              onSelectAccount={(id) => {
                setActiveAccountId(id);
                setActiveNav('overview');
              }}
              onOpenConnectModal={() => setIsConnectModalOpen(true)}
              onDeleteAccount={handleDeleteAccount}
              onSyncPastTrades={handleSyncPastTradesForAccount}
              onOpenImportModal={(acc) => {
                setTargetImportAccount(acc);
                setIsImportModalOpen(true);
              }}
              onNavigateToJournal={(accId) => {
                if (accId) setActiveAccountId(accId);
                setActiveNav('trade-journal');
              }}
            />
          )}

          {activeNav === 'goals' && <GoalsScreen activeAccount={activeAccount} />}

          {activeNav === 'finance' && <FinanceScreen activeAccount={activeAccount} />}

          {activeNav === 'ai-assistant' && (
            <AiAssistantScreen trades={trades} activeAccount={activeAccount} />
          )}

          {activeNav === 'settings' && (
            <SettingsScreen
              dlmRules={dlmRules}
              onToggleRule={handleToggleRule}
              activeAccount={activeAccount}
              mt5Config={mt5Config}
              onOpenConnectModal={() => setIsConnectModalOpen(true)}
              onClearData={handleClearAllData}
            />
          )}
        </main>
      </div>

      {/* MT5 Account Connection Dialog */}
      <Mt5ConnectModal
        isOpen={isConnectModalOpen}
        currentConfig={mt5Config}
        onClose={() => setIsConnectModalOpen(false)}
        onConnect={handleConnectMt5Account}
        onOpenImportModal={() => {
          setTargetImportAccount(activeAccount);
          setIsImportModalOpen(true);
        }}
      />

      {/* MT5 Statement File / Past Deals Importer */}
      <Mt5ImportModal
        isOpen={isImportModalOpen}
        activeAccount={targetImportAccount || activeAccount}
        onClose={() => setIsImportModalOpen(false)}
        onImportTrades={handleImportTrades}
      />
    </div>
  );
}
