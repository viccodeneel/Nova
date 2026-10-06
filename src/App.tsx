import React, { useEffect, useState } from 'react';
import {
  calculateAccountMetricsFromTrades,
  DEFAULT_MT5_CONFIG,
  DlmRule,
  INITIAL_DLM_RULES,
  Mt5BridgeConfig,
  NavSection,
  PropAccount,
  TradeExecution,
} from './data/terminalData';
import { OverviewScreen } from './components/OverviewScreen';
import { TradeJournalScreen } from './components/TradeJournalScreen';
import {
  AccountsScreen,
  AnalyticsScreen,
  SettingsScreen,
} from './components/SecondaryScreens';
import { Mt5ImportModal } from './components/Mt5ImportModal';
import { LoginScreen } from './components/LoginScreen';
import { ConnectAccountScreen } from './components/ConnectAccountScreen';
import { AiScreen, type LinkState } from './components/AiScreen';
import { NetWorthScreen } from './components/NetWorthScreen';
import { Avatar, SettingsPanel, type Profile } from './components/SettingsPanel';
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
  { id: 'ai', label: 'NOVA AI', icon: 'neurology', hoverColor: 'group-hover:text-cyan-300' },
  { id: 'overview', label: 'Overview', icon: 'dashboard', hoverColor: 'group-hover:text-purple-300' },
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
  { id: 'finance', label: 'Net Worth', icon: 'account_balance_wallet', hoverColor: 'group-hover:text-emerald-300' },
  { id: 'settings', label: 'Settings', icon: 'tune', hoverColor: 'group-hover:text-slate-200' },
];

function mapBackendAccount(account: any): PropAccount {
  const startingBalance = Number(account.starting_balance || 0);
  const currentBalance = Number(account.current_balance || 0);
  const currentEquity = Number(account.current_equity || 0);
  const profitTarget = Number(account.prop_phase?.profit_target_amount ?? startingBalance * 0.06);
  return {
    id: account.id,
    name: account.account_name,
    ref: `#${account.account_number}-${(account.broker_name || '').slice(0, 2).toUpperCase()}`,
    shortRef: `${account.broker_name} #${account.account_number}`,
    bridge: account.server_name,
    phase: account.prop_phase?.phase_name || 'Phase 1',
    baseBalance: startingBalance,
    currentBalance,
    liveEquity: currentEquity,
    floatingPnl: Number((currentEquity - currentBalance).toFixed(2)),
    netProfit: Number((currentBalance - startingBalance).toFixed(2)),
    roiPercent: startingBalance > 0
      ? Number((((currentBalance - startingBalance) / startingBalance) * 100).toFixed(2))
      : 0,
    targetProfit: profitTarget,
    targetPercent: Number(account.prop_phase?.profit_target_percent ?? 6),
    passThreshold: Number(account.prop_phase?.pass_threshold ?? startingBalance + profitTarget),
    dailyLimit: Number(account.prop_firm?.daily_loss_limit ?? startingBalance * 0.05),
    currentDailyDrawdown: Number(account.prop_firm?.current_daily_drawdown || 0),
    maxLossLimit: Number(account.prop_firm?.max_loss_limit ?? startingBalance * 0.1),
    currentMaxDrawdown: Number(account.prop_firm?.current_max_drawdown || 0),
    peakWater: Number(account.prop_firm?.peak_watermark ?? startingBalance),
    status: account.prop_firm?.breach_status || 'SAFE',
    isRealConnected: account.connection_status === 'CONNECTED',
    connectionStatus: account.connection_status,
    tradeCount: Number(account.trades_count || 0),
  };
}

export default function App() {
  const [authToken, setAuthToken] = useState(() =>
    import.meta.env.DEV ? 'local-development' : sessionStorage.getItem('nova_session') || ''
  );
  const [activeNav, setActiveNav] = useState<NavSection>('ai');

  // Load from localStorage or defaults
  const [accounts, setAccounts] = useState<PropAccount[]>([]);

  const [activeAccountId, setActiveAccountId] = useState<string>('');
  const [isConnectAccountOpen, setIsConnectAccountOpen] = useState(false);

  const [trades, setTrades] = useState<TradeExecution[]>([]);

  const [mt5Config, setMt5Config] = useState<Mt5BridgeConfig>(DEFAULT_MT5_CONFIG);

  const [dlmRules, setDlmRules] = useState<DlmRule[]>(INITIAL_DLM_RULES);
  const [selectedTrade, setSelectedTrade] = useState<TradeExecution | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [targetImportAccount, setTargetImportAccount] = useState<PropAccount | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<{ success: boolean; message: string } | null>(null);
  const [backendDown, setBackendDown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>({ display_name: '', avatar: null, currency: 'USD', networth_goal: null });
  useEffect(() => { setMenuOpen(false); }, [activeNav]);
  useEffect(() => {
    if (!authToken) return;
    ApiClient.getProfile().then(setProfile).catch(() => undefined);
  }, [authToken]);
  const handleGoalChange = async (goal: number | null) => setProfile(await ApiClient.updateProfile({ networth_goal: goal }));
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);

  // Header Interactive States
  const [utcSeconds, setUtcSeconds] = useState<number>(() => { const d = new Date(); return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(); });
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [showAlertsPopover, setShowAlertsPopover] = useState<boolean>(false);
  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false);

  useEffect(() => {
    const clearSession = () => {
      sessionStorage.removeItem('nova_session');
      setAuthToken('');
      setAccounts([]);
      setActiveAccountId('');
      setTrades([]);
    };
    window.addEventListener('nova:auth-expired', clearSession);
    return () => window.removeEventListener('nova:auth-expired', clearSession);
  }, []);

  // Initial load from backend API
  useEffect(() => {
    if (!authToken) return;
    ApiClient.getAccounts().then((backendAccounts) => {
      if (backendAccounts) {
        const connectedAccounts = backendAccounts;
        const mapped: PropAccount[] = connectedAccounts.map((a: any) => ({
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
    connectionStatus: a.connection_status,
          tradeCount: a.trades_count || 0,
        }));
        setAccounts(mapped);
        setActiveAccountId(mapped[0]?.id || '');
        if (connectedAccounts[0]) {
          const account = connectedAccounts[0];
          setMt5Config({
            ...DEFAULT_MT5_CONFIG,
            isConnected: true,
            loginId: String(account.account_number),
            broker: account.broker_name,
            server: account.server_name,
            phase: account.prop_phase?.phase_name || '',
            baseBalance: Number(account.starting_balance),
          });
          setLastSyncedTime(account.last_synced_at || null);
        }
      }
    });

    ApiClient.getTrades().then((backendTrades) => {
      if (backendTrades && backendTrades.length > 0) {
        const mapped: TradeExecution[] = backendTrades.map((t: any) => ({
          id: `MT5-${t.primary_ticket || t.id}`,
          accountId: t.trading_account_id,
          time: t.opened_at ? new Date(t.opened_at).toLocaleString() : 'Time unavailable',
          instrument: t.symbol,
          side: t.direction,
          entry: t.entry_price?.toString() || '',
          exit: t.exit_price?.toString(),
          lots: t.volume?.toString() || '',
          outcome: t.outcome,
          rMultiple: `${t.r_multiple >= 0 ? '+' : ''}${t.r_multiple}R`,
          rValue: Number(t.r_multiple),
          netPnl: `${t.net_profit >= 0 ? '+' : '-'}$${Math.abs(t.net_profit).toFixed(2)}`,
          pnlValue: Number(t.net_profit),
          quality: t.confluences?.setup_quality || 'Not reviewed',
          discipline: t.confluences?.discipline_score != null
            ? `${t.confluences.discipline_score}% (${t.confluences.rules_followed_count || 0}/6)`
            : 'Not reviewed',
          disciplineScore: Number(t.confluences?.discipline_score || 0),
          session: t.session_window || 'Unknown',
          holdDuration: t.hold_duration || 'Unknown',
          fees: t.commission != null ? `${Number(t.commission).toFixed(2)}` : 'Not reported',
          notes: t.confluences?.notes || t.comment || '',
          rulesPassed: Number(t.confluences?.rules_followed_count || 0),
        }));
        setTrades(mapped);
      }
    });
  }, [authToken]);

  // The local MT5 connector pushes snapshots to the backend every few seconds.
  // Refresh the dashboard from that backend snapshot so balances and history
  // do not remain frozen at the values loaded during sign-in.
  useEffect(() => {
    if (!authToken) return;
    let stopped = false;
    let refreshing = false;

    const refreshDashboard = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const [backendAccounts, backendTrades] = await Promise.all([
          ApiClient.getAccountsStrict(),
          ApiClient.getTrades(),
        ]);
        if (stopped) return;

        const connectedAccounts = backendAccounts;
        setBackendDown(false);
        {
          const mappedAccounts = connectedAccounts.map(mapBackendAccount);
          setAccounts(mappedAccounts);
          setActiveAccountId((currentId) =>
            mappedAccounts.some((account) => account.id === currentId)
              ? currentId
              : mappedAccounts[0]?.id ?? ''
          );
          setLastSyncedTime(connectedAccounts[0]?.last_synced_at || null);
        }

        if (backendTrades.length > 0) {
          setTrades(backendTrades.map((trade: any) => ({
            id: `MT5-${trade.primary_ticket || trade.id}`,
            accountId: trade.trading_account_id,
            time: trade.opened_at ? new Date(trade.opened_at).toLocaleString() : 'Time unavailable',
            instrument: trade.symbol,
            side: trade.direction,
            entry: trade.entry_price?.toString() || '',
            exit: trade.exit_price?.toString(),
            lots: trade.volume?.toString() || '',
            outcome: trade.outcome,
            rMultiple: `${trade.r_multiple >= 0 ? '+' : ''}${trade.r_multiple}R`,
            rValue: Number(trade.r_multiple),
            netPnl: `${trade.net_profit >= 0 ? '+' : '-'}$${Math.abs(trade.net_profit).toFixed(2)}`,
            pnlValue: Number(trade.net_profit),
            quality: trade.confluences?.setup_quality || 'Not reviewed',
            discipline: trade.confluences?.discipline_score != null
              ? `${trade.confluences.discipline_score}% (${trade.confluences.rules_followed_count || 0}/6)`
              : 'Not reviewed',
            disciplineScore: Number(trade.confluences?.discipline_score || 0),
            session: trade.session_window || 'Unknown',
            holdDuration: trade.hold_duration || 'Unknown',
            fees: trade.commission != null ? `${Number(trade.commission).toFixed(2)}` : 'Not reported',
            notes: trade.confluences?.notes || trade.comment || '',
            rulesPassed: Number(trade.confluences?.rules_followed_count || 0),
          })));
        }
      } catch {
        setBackendDown(true); // keep last known data, but say so
      } finally {
        refreshing = false;
      }
    };

    const intervalId = window.setInterval(() => void refreshDashboard(), 10_000);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [authToken]);

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

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];

  const handleSignOut = () => {
    setActiveNav('ai');
    sessionStorage.removeItem('nova_session');
    setAuthToken('');
    setAccounts([]);
    setActiveAccountId('');
    setTrades([]);
  };

  const handleLocalAccountConnected = async () => {
    const backendAccounts = await ApiClient.getAccounts();
    const connectedAccounts = backendAccounts;
    const mappedAccounts = connectedAccounts.map(mapBackendAccount);
    if (mappedAccounts.length === 0) {
      throw new Error('MT5 connected, but NOVA has not received the account snapshot yet. Check the connector status and try again.');
    }
    setAccounts(mappedAccounts);
    setActiveAccountId(mappedAccounts[0].id);
    setIsConnectAccountOpen(false);
    setActiveNav('overview');
    const first = connectedAccounts[0];
    setMt5Config({
      ...DEFAULT_MT5_CONFIG,
      isConnected: true,
      loginId: String(first.account_number),
      broker: first.broker_name,
      server: first.server_name,
      phase: first.prop_phase?.phase_name || '',
      baseBalance: Number(first.starting_balance),
    });
    setLastSyncedTime(first.last_synced_at || null);
    const backendTrades = await ApiClient.getTrades(first.id);
    const mappedTrades: TradeExecution[] = backendTrades.map((trade: any) => ({
      id: `MT5-${trade.primary_ticket || trade.id}`,
      accountId: trade.trading_account_id,
      time: trade.opened_at ? new Date(trade.opened_at).toLocaleString() : 'Time unavailable',
      instrument: trade.symbol,
      side: trade.direction,
      entry: trade.entry_price?.toString() || '',
      exit: trade.exit_price?.toString(),
      lots: trade.volume?.toString() || '',
      outcome: trade.outcome,
      rMultiple: `${trade.r_multiple >= 0 ? '+' : ''}${trade.r_multiple}R`,
      rValue: Number(trade.r_multiple),
      netPnl: `${trade.net_profit >= 0 ? '+' : '-'}$${Math.abs(trade.net_profit).toFixed(2)}`,
      pnlValue: Number(trade.net_profit),
      quality: trade.confluences?.setup_quality || 'Not reviewed',
      discipline: trade.confluences?.discipline_score != null
        ? `${trade.confluences.discipline_score}% (${trade.confluences.rules_followed_count || 0}/6)`
        : 'Not reviewed',
      disciplineScore: Number(trade.confluences?.discipline_score || 0),
      session: trade.session_window || 'Unknown',
      holdDuration: trade.hold_duration || 'Unknown',
      fees: trade.commission != null ? `${Number(trade.commission).toFixed(2)}` : 'Not reported',
      notes: trade.confluences?.notes || trade.comment || '',
      rulesPassed: Number(trade.confluences?.rules_followed_count || 0),
    }));
    setTrades(mappedTrades);
  };

  if (!authToken) {
    return (
      <LoginScreen
        onAuthenticated={(token) => {
          sessionStorage.setItem('nova_session', token);
          setAuthToken(token);
        }}
      />
    );
  }

  const handleToggleRule = (ruleId: string) => {
    setDlmRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, passed: !r.passed } : r))
    );
  };

  const handleAddTrade = (newTrade: TradeExecution) => {
    if (!activeAccount) return;
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

  const handleDeleteAccount = async (accountId: string) => {
    const target = accounts.find((a) => a.id === accountId);
    if (!window.confirm(`Remove ${target?.name ?? 'this account'} from NOVA? Its synced positions and trades will be deleted.`)) return;
    const removed = await ApiClient.deleteAccount(accountId);
    if (!removed) {
      setSyncToast({ success: false, message: 'Could not delete the account. Nothing was removed.' });
      setTimeout(() => setSyncToast(null), 5000);
      return;
    }
    const remaining = accounts.filter((a) => a.id !== accountId);
    setAccounts(remaining);
    // Remove all trades associated with the deleted account
    setTrades((prev) => prev.filter((t) => t.accountId !== accountId));

    if (activeAccountId === accountId) {
      if (remaining.length > 0) {
        setActiveAccountId(remaining[0].id);
      } else {
        setActiveAccountId('');
      }
    }
  };

  const handleImportTrades = (importedTrades: TradeExecution[], newBalance?: number) => {
    const target = targetImportAccount || activeAccount;
    if (!target) return;
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
    if (!activeAccount) return;
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
    setAccounts([]);
    setActiveAccountId('');
    try {
      localStorage.removeItem('nova_mt5_trades');
    } catch {
      // ignore
    }
  };

  const handleSyncFromHeader = async (requestedAccountId?: string) => {
    setIsSyncing(true);
    try {
      const res = await ApiClient.syncLocalConnector();

      if (res.success) {
        setLastSyncedTime(res.synced_at || new Date().toISOString());
        const backendAccounts = await ApiClient.getAccounts();
        const connectedAccounts = backendAccounts;
        const mappedAccounts: PropAccount[] = connectedAccounts.map((a: any) => ({
          id: a.id,
          name: a.account_name,
          ref: `#${a.account_number}-${(a.broker_name || '').slice(0, 2).toUpperCase()}`,
          shortRef: `${a.broker_name} #${a.account_number}`,
          bridge: a.server_name,
          phase: a.prop_phase?.phase_name || 'Phase 1',
          baseBalance: Number(a.starting_balance),
          currentBalance: Number(a.current_balance),
          liveEquity: Number(a.current_equity),
          floatingPnl: Number((a.current_equity - a.current_balance).toFixed(2)),
          netProfit: Number((a.current_balance - a.starting_balance).toFixed(2)),
          roiPercent: a.starting_balance > 0
            ? Number((((a.current_balance - a.starting_balance) / a.starting_balance) * 100).toFixed(2))
            : 0,
          targetProfit: Number(a.prop_phase?.profit_target_amount || 0),
          targetPercent: Number(a.prop_phase?.profit_target_percent || 0),
          passThreshold: Number(a.prop_phase?.pass_threshold || 0),
          dailyLimit: Number(a.prop_firm?.daily_loss_limit || 0),
          currentDailyDrawdown: Number(a.prop_firm?.current_daily_drawdown || 0),
          maxLossLimit: Number(a.prop_firm?.max_loss_limit || 0),
          currentMaxDrawdown: Number(a.prop_firm?.current_max_drawdown || 0),
          peakWater: Number(a.prop_firm?.peak_watermark || 0),
          status: (a.prop_firm?.breach_status as any) || 'SAFE',
          isRealConnected: a.connection_status === 'CONNECTED',
    connectionStatus: a.connection_status,
          tradeCount: a.trades_count || 0,
        }));
        setAccounts(mappedAccounts);
        setActiveAccountId(
          mappedAccounts.find((a) => a.id === requestedAccountId)?.id || mappedAccounts[0]?.id || ''
        );
        const firstConnected = connectedAccounts[0];
        if (firstConnected) {
          setMt5Config({
            ...DEFAULT_MT5_CONFIG,
            isConnected: true,
            loginId: String(firstConnected.account_number),
            broker: firstConnected.broker_name,
            server: firstConnected.server_name,
            phase: firstConnected.prop_phase?.phase_name || '',
            baseBalance: Number(firstConnected.starting_balance),
          });
        }

        const backendTrades = await ApiClient.getTrades(requestedAccountId);
        const mappedTrades: TradeExecution[] = backendTrades.map((t: any) => ({
          id: `MT5-${t.primary_ticket || t.id}`,
          accountId: t.trading_account_id,
          time: t.opened_at ? new Date(t.opened_at).toLocaleString() : 'Time unavailable',
          instrument: t.symbol,
          side: t.direction,
          entry: t.entry_price?.toString() || '',
          exit: t.exit_price?.toString(),
          lots: t.volume?.toString() || '',
          outcome: t.outcome,
          rMultiple: `${t.r_multiple >= 0 ? '+' : ''}${t.r_multiple}R`,
          rValue: Number(t.r_multiple),
          netPnl: `${t.net_profit >= 0 ? '+' : '-'}$${Math.abs(t.net_profit).toFixed(2)}`,
          pnlValue: Number(t.net_profit),
          quality: t.confluences?.setup_quality || 'Not reviewed',
          discipline: t.confluences?.discipline_score != null
            ? `${t.confluences.discipline_score}% (${t.confluences.rules_followed_count || 0}/6)`
            : 'Not reviewed',
          disciplineScore: Number(t.confluences?.discipline_score || 0),
          session: t.session_window || 'Unknown',
          holdDuration: t.hold_duration || 'Unknown',
          fees: t.commission != null ? `${Number(t.commission).toFixed(2)}` : 'Not reported',
          notes: t.confluences?.notes || t.comment || '',
          rulesPassed: Number(t.confluences?.rules_followed_count || 0),
        }));
        setTrades(mappedTrades);
      }

      setSyncToast({
        success: res.success,
        message: res.message || (res.success ? 'MT5 data synced.' : 'MT5 sync failed.'),
      });
    } catch (err) {
      setSyncToast({
        success: false,
        message: (err as Error).message || 'Failed to reach the MT5 connector.',
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncToast(null), 5000);
    }
  };
  const status = activeAccount?.connectionStatus;
  const linkState: LinkState = !activeAccount ? 'NONE' : status === 'CONNECTED' ? 'CONNECTED' : status === 'STALE' ? 'STALE' : 'DISCONNECTED';
  const linkLabel = backendDown ? 'BACKEND UNREACHABLE' : { CONNECTED: 'MT5 CONNECTED', STALE: 'MT5 DATA STALE', DISCONNECTED: 'MT5 DISCONNECTED', NONE: 'NO MT5 ACCOUNT' }[linkState];
  const tint = backendDown || linkState === 'STALE' ? 'amber' : linkState === 'CONNECTED' ? 'emerald' : linkState === 'DISCONNECTED' ? 'rose' : 'slate';
  const chipCls = { amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400', emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', rose: 'bg-rose-500/10 border-rose-500/30 text-rose-400', slate: 'bg-white/5 border-white/10 text-slate-400' }[tint];
  const dotCls = { amber: 'bg-amber-400', emerald: 'bg-emerald-400', rose: 'bg-rose-400', slate: 'bg-slate-500' }[tint];
  const utcHour = Math.floor(utcSeconds / 3600);
  const sessionName = utcHour >= 13 && utcHour < 16 ? 'London / NY Overlap' : utcHour >= 7 && utcHour < 13 ? 'London Session' : utcHour >= 16 && utcHour < 21 ? 'New York Session' : 'Asian Session';
  const hourNow = new Date().getHours();
  const greeting = hourNow < 12 ? 'Good morning' : hourNow < 18 ? 'Good afternoon' : 'Good evening';
  const toast = syncToast && (
    <div role="status" className={`fixed bottom-6 right-6 z-[60] nova-enter rounded-xl border px-4 py-3 text-sm backdrop-blur-xl ${syncToast.success ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>{syncToast.message}</div>
  );

  if (!activeAccount) {
    const tabs: Array<[NavSection, string]> = [['ai', 'NOVA AI'], ['overview', 'Dashboard'], ['analytics', 'Analytics'], ['accounts', 'Accounts'], ['finance', 'Net Worth'], ['settings', 'Settings']];
    return (
      <div className="min-h-screen bg-[#08090d] text-slate-100">
        <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className="absolute -top-40 left-1/4 h-[550px] w-[750px] rounded-full bg-purple-600/10 blur-[140px]" /><div className="absolute top-1/3 -right-24 h-[600px] w-[600px] rounded-full bg-cyan-500/[0.07] blur-[150px]" /></div>
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-white/10 bg-[#0a0c13]/80 px-4 backdrop-blur-xl sm:px-8">
          <span className="font-bold tracking-[0.3em] text-white">NOVA</span>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setActiveNav(id); setIsConnectAccountOpen(id === 'accounts'); }} className={`rounded-lg px-3 py-2 text-sm transition-all duration-200 ${activeNav === id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>{label}</button>
            ))}
          </nav>
        </header>
        <main className="relative mx-auto w-full max-w-6xl p-5 sm:p-8">
          <div key={activeNav} className="nova-enter">
            {activeNav === 'accounts' ? <ConnectAccountScreen onConnected={handleLocalAccountConnected} onCancel={() => { setActiveNav('overview'); setIsConnectAccountOpen(false); }} />
              : activeNav === 'ai' ? <AiScreen mt5="NONE" name={profile.display_name} activeAccountId={activeAccount?.id} onNavigate={setActiveNav} />
              : activeNav === 'finance' ? <NetWorthScreen currency={profile.currency} goal={profile.networth_goal} onGoalChange={handleGoalChange} />
              : activeNav === 'settings' ? <SettingsPanel profile={profile} onProfileChange={setProfile} accounts={accounts} onDeleteAccount={handleDeleteAccount} onConnect={() => { setActiveNav('accounts'); setIsConnectAccountOpen(true); }} onSignOut={import.meta.env.DEV ? undefined : handleSignOut} />
              : activeNav === 'analytics' ? <AnalyticsScreen trades={trades} />
              : (
                <section className="hud-panel p-8 sm:p-12">
                  <p className="font-label-tech text-xs uppercase tracking-[0.3em] text-cyan-300">{backendDown ? 'Backend unreachable' : 'No MT5 account connected'}</p>
                  <h1 className="mt-3 text-2xl font-bold text-white">{greeting}{profile.display_name ? `, ${profile.display_name}` : ''}</h1>
                  <p className="mt-2 max-w-xl text-sm text-slate-400">Trading data appears here once an MT5 account is connected. Nothing is shown until it comes from a real account.</p>
                  <button type="button" onClick={() => { setActiveNav('accounts'); setIsConnectAccountOpen(true); }} className="mt-6 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110">Connect an account</button>
                </section>
              )}
          </div>
        </main>
        {toast}
      </div>
    );
  }

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
      {menuOpen && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={`fixed left-0 top-0 h-full w-64 bg-[#0a0c13]/90 backdrop-blur-2xl z-50 flex flex-col justify-between border-r border-white/[0.07] shadow-[4px_0_30px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out ${menuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
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
          onClick={() => void handleSyncFromHeader()}
          title="Sync from the configured MT5 connector"
          className="p-3 m-3 rounded-xl bg-gradient-to-b from-[#111420] to-[#0a0c12] border border-white/[0.08] shadow-[0_8px_20px_rgba(0,0,0,0.5)] relative overflow-hidden cursor-pointer hover:border-purple-500/40 transition-all group"
        >
          <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-80 ${linkState === 'CONNECTED' ? 'animate-ping' : ''} ${dotCls}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${dotCls}`}></span>
              </span>
              <span className={`font-label-tech text-[10px] font-bold uppercase tracking-wider ${chipCls.split(' ').pop()}`}>
                {linkLabel}
              </span>
            </div>
            <span className="font-label-numeric-sm text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-slate-400 font-medium">
              READ ONLY
            </span>
          </div>
          <div className="mb-2 text-[11px] text-slate-400">
            {lastSyncedTime ? `Last data ${new Date(lastSyncedTime).toLocaleTimeString()}` : 'No data received yet'}
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
      <div className="lg:pl-64 relative z-10">
        <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-[#08090e]/80 backdrop-blur-2xl z-40 px-3 sm:px-6 flex items-center justify-between border-b border-white/[0.07] shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          <div className="flex min-w-0 items-center gap-2">
          <button type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-white/5 lg:hidden"><span className="material-symbols-outlined">menu</span></button>
          <div className="flex min-w-0 flex-col justify-center">
            <div className="flex items-center gap-2.5">
              <span className="font-headline-sm text-base text-white font-semibold tracking-tight hidden sm:inline truncate">
                {greeting}{profile.display_name ? `, ${profile.display_name}` : ''}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${chipCls} font-label-tech text-[10px] font-semibold tracking-wider`}>
                <span className={`h-1.5 w-1.5 rounded-full ${dotCls} ${linkState === 'CONNECTED' ? 'animate-pulse' : ''}`}></span>
                {linkLabel}
              </span>
            </div>
            <span className="font-body-sm text-[11px] text-slate-400 font-normal mt-0.5 hidden sm:flex items-center gap-1.5">
              <span>Market Session:</span>
              <span className="text-slate-200 font-medium">{sessionName}</span>
            </span>
          </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
                onClick={() => void handleSyncFromHeader()}
                title="Sync data from MT5"
                className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/30 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
              >
                <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]"></span>
                <span className="font-label-tech text-[11px] text-slate-300 font-medium">
                  {activeAccount.isRealConnected ? `${activeAccount.bridge} / Connected` : 'MT5 Disconnected'}
                </span>
              </div>
            </div>

            <div className="h-6 w-px bg-white/10 mx-1"></div>

            <div className="flex items-center gap-2 relative">
              {!import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
                >
                  Sign out
                </button>
              )}
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
                  <Avatar profile={profile} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#08090e]"></span>
                </div>
                <div className="hidden md:flex flex-col text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="font-body-md text-xs text-white font-semibold leading-none">
                      {profile.display_name || 'NOVA'}
                    </span>
                    <span
                      className="material-symbols-outlined text-cyan-400 text-xs leading-none"
                      title="Verified Prop Trader"
                    >
                      verified
                    </span>
                  </div>
                  <span className="font-label-tech text-[9px] text-purple-300 uppercase tracking-wider font-semibold mt-0.5 leading-none">
                    NOVA account
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
                            {(
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
                        setActiveNav('accounts');
                        setIsConnectAccountOpen(true);
                      }}
                      className="mt-2 py-2 px-3 rounded-lg bg-purple-600/30 border border-purple-500/40 hover:bg-purple-600/50 text-purple-200 font-label-tech text-xs font-bold text-center"
                    >
                      Add MT5 Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="w-full pt-20 pb-28 lg:pb-12 px-4 sm:px-6 lg:px-8">
          <div key={activeNav} className="nova-enter">
          {activeNav === 'overview' && (
            <OverviewScreen
              activeAccount={activeAccount}
              trades={trades}
              onSync={() => void handleSyncFromHeader(activeAccount.id)}
              onOpenImportModal={() => {
                setTargetImportAccount(activeAccount);
                setIsImportModalOpen(true);
              }}
              onNavigateToJournal={() => setActiveNav('trade-journal')}
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
              onSyncPastTrades={(id) => handleSyncFromHeader(id)}
              onOpenImportModal={() => {
                setTargetImportAccount(activeAccount);
                setIsImportModalOpen(true);
              }}
            />
          )}

          {activeNav === 'ai' && <AiScreen mt5={linkState} name={profile.display_name} activeAccountId={activeAccount?.id} onNavigate={setActiveNav} />}
          {activeNav === 'finance' && <NetWorthScreen currency={profile.currency} goal={profile.networth_goal} onGoalChange={handleGoalChange} />}
          {activeNav === 'analytics' && <AnalyticsScreen trades={trades} />}

          {activeNav === 'accounts' && (
            isConnectAccountOpen ? (
              <ConnectAccountScreen onConnected={handleLocalAccountConnected} onCancel={() => setIsConnectAccountOpen(false)} />
            ) : <AccountsScreen
              accounts={accounts}
              activeAccountId={activeAccount.id}
              trades={trades}
              onSelectAccount={(id) => {
                setActiveAccountId(id);
                setActiveNav('overview');
              }}
              onOpenConnectModal={() => setIsConnectAccountOpen(true)}
              onDeleteAccount={handleDeleteAccount}
              onSyncPastTrades={(id) => handleSyncFromHeader(id)}
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

          {activeNav === 'settings' && (
            <SettingsPanel
              profile={profile}
              onProfileChange={setProfile}
              accounts={accounts}
              onDeleteAccount={handleDeleteAccount}
              onConnect={() => { setActiveNav('accounts'); setIsConnectAccountOpen(true); }}
              onSignOut={import.meta.env.DEV ? undefined : handleSignOut}
            />
          )}
          </div>
        </main>
      </div>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-[#0a0c13]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {([['ai', 'NOVA', 'neurology'], ['overview', 'Dashboard', 'dashboard'], ['finance', 'Net Worth', 'account_balance_wallet'], ['settings', 'Settings', 'settings']] as const).map(([id, label, icon]) => (
          <button key={id} type="button" onClick={() => setActiveNav(id)} className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors ${activeNav === id ? 'text-cyan-300' : 'text-slate-500'}`}>
            <span className="material-symbols-outlined text-[22px]">{icon}</span>{label}
          </button>
        ))}
        <button type="button" onClick={() => setMenuOpen(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-[10px] text-slate-500"><span className="material-symbols-outlined text-[22px]">apps</span>More</button>
      </nav>

      {toast}

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
