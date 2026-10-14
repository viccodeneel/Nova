import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  calculateAccountMetricsFromTrades,
  AccountSettings,
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
import { AiScreen } from './components/AiScreen';
import { useNovaVoice } from './voice/useNovaVoice';
import { useLiveKitVoice } from './voice/useLiveKitVoice';
import { NovaOrbDock } from './components/NovaOrbDock';
import { NetWorthScreen } from './components/NetWorthScreen';
import { Avatar, SettingsPanel, type Profile } from './components/SettingsPanel';
import { ApiClient } from './services/apiClient.ts';
import { beginMyfxbookActivityRequest, mapMyfxbookAccountToDashboard, mapMyfxbookActivityToTrades, MyfxbookActivityCache, MYFXBOOK_HISTORY_LIMIT, resolveActiveAccount, scheduleMyfxbookHistoryNotice, myfxbookHistoryNoticeCycle, settleMyfxbookActivityRequest, tradesForAccount, MyfxbookAccountsResponse, MyfxbookRequestError } from './services/myfxbookAccounts';

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

const MOBILE_PRIMARY: Array<[NavSection, string, string]> = [
  ['overview', 'Home', 'dashboard'],
  ['accounts', 'Accounts', 'account_balance'],
  ['trade-journal', 'Journal', 'auto_stories'],
  ['finance', 'Net Worth', 'account_balance_wallet'],
];

const MobileMoreMenu: React.FC<{ activeNav: NavSection; onNavigate: (page: NavSection) => void; onClose: () => void }> = ({ activeNav, onNavigate, onClose }) => (
  <div className="fixed inset-0 z-[75] bg-black/45 backdrop-blur-[2px] lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-label="More navigation" className="absolute inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] rounded-2xl border border-blue-300/15 bg-[#0a1020]/95 p-3 shadow-2xl">
      <p className="px-3 pb-2 pt-1 font-label-tech text-[9px] uppercase tracking-[.2em] text-slate-500">Workspace</p>
      {([['ai', 'NOVA AI', 'neurology'], ['analytics', 'Analytics', 'analytics'], ['settings', 'Settings', 'tune']] as const).map(([page, label, icon]) => <button key={page} type="button" onClick={() => { onNavigate(page); onClose(); }} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm transition ${activeNav === page ? 'border border-violet-400/25 bg-violet-500/10 text-violet-100' : 'text-slate-300 hover:bg-white/[.04]'}`}><span className="material-symbols-outlined text-lg text-violet-300">{icon}</span><span className="flex-1 text-left">{label}</span>{activeNav === page && <span className="status-dot is-online"/>}</button>)}
    </section>
  </div>
);

function mapBackendAccount(account: any): PropAccount {
  const hasStartingBalance = account.starting_balance != null && !(typeof account.starting_balance === 'string' && !account.starting_balance.trim()) && Number.isFinite(Number(account.starting_balance));
  const hasCurrentBalance = account.current_balance != null && !(typeof account.current_balance === 'string' && !account.current_balance.trim()) && Number.isFinite(Number(account.current_balance));
  const startingBalance = hasStartingBalance ? Number(account.starting_balance) : 0;
  const currentBalance = hasCurrentBalance ? Number(account.current_balance) : 0;
  const currentEquity = Number(account.current_equity || 0);
  const profitTarget = Number(account.prop_phase?.profit_target_amount ?? startingBalance * 0.06);
  const storedSettings = account.account_settings || {};
  const phaseName = String(account.prop_phase?.phase_name || '');
  const legacyStage = /phase\s*2/i.test(phaseName) ? 'PHASE_2'
    : /funded/i.test(phaseName) ? 'FUNDED'
      : /phase\s*1|evaluation/i.test(phaseName) ? 'PHASE_1' : undefined;
  const settings = {
    ...storedSettings,
    prop_firm_name: storedSettings.prop_firm_name ?? account.prop_firm?.prop_firm_name ?? null,
    challenge: {
      ...(storedSettings.challenge || {}),
      stage: storedSettings.challenge?.stage ?? legacyStage,
      size: storedSettings.challenge?.size ?? (account.prop_phase?.starting_balance != null ? Number(account.prop_phase.starting_balance) : null),
      phase1_target_percent: storedSettings.challenge?.phase1_target_percent ?? (legacyStage !== 'PHASE_2' && account.prop_phase?.profit_target_percent != null ? Number(account.prop_phase.profit_target_percent) : null),
      phase2_target_percent: storedSettings.challenge?.phase2_target_percent ?? (legacyStage === 'PHASE_2' && account.prop_phase?.profit_target_percent != null ? Number(account.prop_phase.profit_target_percent) : null),
      daily_drawdown_percent: storedSettings.challenge?.daily_drawdown_percent ?? (account.prop_firm?.daily_loss_percent != null ? Number(account.prop_firm.daily_loss_percent) : null),
      max_drawdown_percent: storedSettings.challenge?.max_drawdown_percent ?? (account.prop_firm?.max_loss_percent != null ? Number(account.prop_firm.max_loss_percent) : null),
      minimum_trading_days: storedSettings.challenge?.minimum_trading_days ?? (account.prop_phase?.minimum_trading_days != null ? Number(account.prop_phase.minimum_trading_days) : null),
    },
  };
  const legacyClassification = account.connection_mode === 'DEMO' || (!account.connection_mode && account.account_type === 'demo')
    ? 'DEMO'
    : account.account_type === 'live_personal' && account.connection_mode !== 'DEMO'
      ? 'LIVE_BROKERAGE'
      : ['evaluation', 'funded'].includes(account.account_type) ? 'PROP_FIRM' : undefined;
  return {
    id: account.id,
    name: account.account_name,
    currency: typeof account.currency === 'string' ? account.currency : undefined,
    startingBalanceAvailable: hasStartingBalance,
    profitAvailable: hasStartingBalance && hasCurrentBalance,
    provider: typeof account.broker_name === 'string' ? account.broker_name : undefined,
    accountType: typeof account.account_type === 'string' ? account.account_type : undefined,
    connectionMode: account.connection_mode || null,
    classification: settings.classification || legacyClassification,
    accountSettings: settings,
    phaseConfigured: Boolean(settings.challenge?.stage) || (typeof account.prop_phase?.phase_name === 'string' && Boolean(account.prop_phase.phase_name)),
    targetConfigured: account.prop_phase?.profit_target_amount != null || account.prop_phase?.profit_target_percent != null,
    ref: `#${account.account_number}-${(account.broker_name || '').slice(0, 2).toUpperCase()}`,
    shortRef: `${account.broker_name} #${account.account_number}`,
    bridge: account.server_name,
    phase: settings.challenge?.stage?.replaceAll('_', ' ') || account.prop_phase?.phase_name || 'Phase 1',
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
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;
  const [activeNav, setActiveNav] = useState<NavSection>('overview');

  // Load from localStorage or defaults
  const [accounts, setAccounts] = useState<PropAccount[]>([]);
  const [myfxbook, setMyfxbook] = useState<{ data: MyfxbookAccountsResponse | null; loading: boolean; error: MyfxbookRequestError | null }>({ data: null, loading: false, error: null });
  const [myfxbookActivity, setMyfxbookActivity] = useState<MyfxbookActivityCache>({});

  const [activeAccountId, setActiveAccountId] = useState<string>('');
  const [isConnectAccountOpen, setIsConnectAccountOpen] = useState(false);
  const [accountEditId, setAccountEditId] = useState<string | null>(null);
  const [accountDetailsId, setAccountDetailsId] = useState<string | null>(null);

  const [trades, setTrades] = useState<TradeExecution[]>([]);

  const [mt5Config, setMt5Config] = useState<Mt5BridgeConfig>(DEFAULT_MT5_CONFIG);

  const [dlmRules, setDlmRules] = useState<DlmRule[]>(INITIAL_DLM_RULES);
  const [selectedTrade, setSelectedTrade] = useState<TradeExecution | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [targetImportAccount, setTargetImportAccount] = useState<PropAccount | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<{ success: boolean; message: string } | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('nova_sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [profile, setProfile] = useState<Profile>({ display_name: '', avatar: null, currency: 'USD', networth_goal: null });
  useEffect(() => { setMobileMoreOpen(false); }, [activeNav]);
  useEffect(() => {
    try { localStorage.setItem('nova_sidebar_collapsed', String(sidebarCollapsed)); } catch { /* Storage may be unavailable in private contexts. */ }
  }, [sidebarCollapsed]);
  useEffect(() => {
    if (!authToken) return;
    ApiClient.getProfile().then(setProfile).catch(() => undefined);
  }, [authToken]);
  const myfxbookAccounts = (myfxbook.data?.accounts || []).map(mapMyfxbookAccountToDashboard);
  const selectableAccounts = [...accounts, ...myfxbookAccounts];
  const activeAccount = resolveActiveAccount(selectableAccounts, activeAccountId);
  const allDashboardTrades = [...trades, ...Object.values(myfxbookActivity).flatMap((entry) => entry.trades)];
  const activeTrades = tradesForAccount(allDashboardTrades, activeAccount?.id);
  const selectedMyfxbookActivity = activeAccount?.source === 'MYFXBOOK' ? myfxbookActivity[activeAccount.id] : undefined;
  const selectedMyfxbookLoading = activeAccount?.source === 'MYFXBOOK' && (!selectedMyfxbookActivity || selectedMyfxbookActivity.loading);
  const selectedAccountIdRef = useRef(activeAccount?.id);
  selectedAccountIdRef.current = activeAccount?.id;
  useEffect(() => {
    const error = selectedMyfxbookActivity?.error;
    if (!activeAccount || activeAccount.source !== 'MYFXBOOK' || !selectedMyfxbookActivity || !error) return;
    const cycle = myfxbookHistoryNoticeCycle(activeAccount.id, selectedMyfxbookActivity.requestId, error);
    if (historyNoticeCycleRef.current === cycle) return;
    historyNoticeCycleRef.current = cycle;
    historyNoticeCancelRef.current?.();
    historyNoticeCancelRef.current = scheduleMyfxbookHistoryNotice((message) => {
      setHistoryNotice(message ? { accountId: activeAccount.id, message } : null);
      if (!message) historyNoticeCancelRef.current = null;
    }, error.message);
  }, [activeAccount?.id, selectedMyfxbookActivity?.requestId, selectedMyfxbookActivity?.error]);
  useEffect(() => () => historyNoticeCancelRef.current?.(), []);
  const myfxbookRequestIds = useRef(new Map<string, number>());
  const loadMyfxbookActivity = (account: PropAccount): Promise<boolean> => {
    const providerAccountId = account.providerAccountId;
    if (account.source !== 'MYFXBOOK' || !providerAccountId || !authToken || selectedAccountIdRef.current !== account.id) return Promise.resolve(false);
    const requestId = (myfxbookRequestIds.current.get(account.id) || 0) + 1;
    myfxbookRequestIds.current.set(account.id, requestId);
    setMyfxbookActivity((current) => beginMyfxbookActivityRequest(current, account.id, requestId));
    return ApiClient.getMyfxbookActivity(providerAccountId).then((activity) => {
      if (activity.accountId !== providerAccountId) throw new MyfxbookRequestError('Myfxbook returned history for a different account.');
      const mappedTrades = mapMyfxbookActivityToTrades(account, activity);
      if (selectedAccountIdRef.current !== account.id || myfxbookRequestIds.current.get(account.id) !== requestId) return false;
      setMyfxbookActivity((current) => settleMyfxbookActivityRequest(current, account.id, requestId, selectedAccountIdRef.current, { trades: mappedTrades }));
      return true;
    }).catch((error) => {
      const safeError = error instanceof MyfxbookRequestError ? error : new MyfxbookRequestError('Myfxbook history is unavailable.');
      if (selectedAccountIdRef.current === account.id && myfxbookRequestIds.current.get(account.id) === requestId) {
        setMyfxbookActivity((current) => settleMyfxbookActivityRequest(current, account.id, requestId, selectedAccountIdRef.current, { error: safeError }));
      }
      return false;
    });
  };
  const selectAccount = (id: string) => { selectedAccountIdRef.current = id; setActiveAccountId(id); setSelectedTrade(null); };
  useEffect(() => {
    if (!activeAccount || activeAccount.source !== 'MYFXBOOK' || !activeAccount.providerAccountId || !authToken) return;
    void loadMyfxbookActivity(activeAccount);
  }, [activeAccount?.id, activeAccount?.providerAccountId, authToken]);
  useEffect(() => {
    if (!selectableAccounts.some((account) => account.id === activeAccountId) && selectableAccounts.length) setActiveAccountId(selectableAccounts[0].id);
  }, [activeAccountId, accounts, myfxbook.data]);
  useEffect(() => {
    if (!authToken) {
      setMyfxbook({ data: null, loading: false, error: null });
      return;
    }
    let stopped = false;
    const load = async () => {
      setMyfxbook((current) => ({ ...current, loading: true, error: null }));
      try {
        const data = await ApiClient.getMyfxbookAccounts();
        if (!stopped) setMyfxbook({ data, loading: false, error: null });
      } catch (error) {
        if (!stopped) setMyfxbook((current) => ({ ...current, loading: false, error: error instanceof MyfxbookRequestError ? error : new MyfxbookRequestError('Myfxbook could not provide account data.') }));
      }
    };
    void load();
    return () => { stopped = true; };
  }, [authToken]);
  const handleGoalChange = async (goal: number | null) => setProfile(await ApiClient.updateProfile({ networth_goal: goal }));
  // One NOVA engine for the whole app: conversations survive tab changes and the wake word works anywhere.
  const nova = useNovaVoice({ enabled: Boolean(authToken), onNavigate: setActiveNav, getAccountId: () => activeAccount?.source === 'MYFXBOOK' ? '' : activeAccountId, getActiveTab: () => activeNav });
  const livekitVoice = useLiveKitVoice({
    authenticated: Boolean(authToken),
    accountId: activeAccount?.source === 'MYFXBOOK' ? undefined : activeAccountId || undefined,
    onConnecting: nova.suspendBrowserVoice,
    onDisconnected: nova.resumeBrowserVoice,
    onNavigate: async (page) => {
      setActiveNav(page);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    },
  });
  const wakeProps = { supported: nova.wakeSupported, enabled: nova.wakeEnabled, status: nova.wakeStatus, onChange: nova.setWakeEnabled };
  const [historyNotice, setHistoryNotice] = useState<{ accountId: string; message: string } | null>(null);
  const historyNoticeCycleRef = useRef('');
  const historyNoticeCancelRef = useRef<(() => void) | null>(null);

  // Header Interactive States
  const [utcSeconds, setUtcSeconds] = useState<number>(() => { const d = new Date(); return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(); });
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [showAlertsPopover, setShowAlertsPopover] = useState<boolean>(false);
  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false);

  useEffect(() => {
    const clearSession = () => {
      selectedAccountIdRef.current = undefined;
      sessionStorage.removeItem('nova_session');
      setAuthToken('');
      setAccounts([]);
      setActiveAccountId('');
      setTrades([]);
      setMyfxbook({ data: null, loading: false, error: null });
      setMyfxbookActivity({});
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
        const mapped = connectedAccounts.map(mapBackendAccount);
        setAccounts(mapped);
        setActiveAccountId((current) => current || mapped[0]?.id || '');
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
        {
          const mappedAccounts = connectedAccounts.map(mapBackendAccount);
          setAccounts(mappedAccounts);
          setActiveAccountId((currentId) =>
            mappedAccounts.some((account) => account.id === currentId) || currentId.startsWith('myfxbook:')
              ? currentId
              : mappedAccounts[0]?.id ?? ''
          );
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
        // Keep the last known account data; no MT5 status indicator is shown in the UI.
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

  const handleSignOut = () => {
    selectedAccountIdRef.current = undefined;
    setActiveNav('ai');
    sessionStorage.removeItem('nova_session');
    setAuthToken('');
    setAccounts([]);
    setActiveAccountId('');
    setTrades([]);
    setMyfxbook({ data: null, loading: false, error: null });
    setMyfxbookActivity({});
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

  const handleDeleteAccount = async (accountId: string, confirmed = false): Promise<boolean> => {
    const target = accounts.find((a) => a.id === accountId);
    if (!confirmed && !window.confirm(`Remove ${target?.name ?? 'this account'} from NOVA? This archives the local account connection. Trading history is preserved, and the external trading account is not affected.`)) return false;
    const removed = await ApiClient.deleteAccount(accountId);
    if (!removed) {
      setSyncToast({ success: false, message: 'Could not remove the account. It remains available in NOVA.' });
      setTimeout(() => setSyncToast(null), 5000);
      return false;
    }
    const remaining = accounts.filter((a) => a.id !== accountId);
    setAccounts(remaining);
    if (activeAccountId === accountId) {
      if (remaining.length > 0) {
        setActiveAccountId(remaining[0].id);
      } else {
        setActiveAccountId('');
      }
    }
    setSyncToast({ success: true, message: 'Account removed from NOVA. Existing trade records are preserved.' });
    setTimeout(() => setSyncToast(null), 5000);
    return true;
  };

  const handleUpdateAccount = async (accountId: string, payload: { account_name: string; account_settings: Record<string, unknown> }) => {
    const providerAccount = selectableAccounts.find((account) => account.id === accountId && account.source === 'MYFXBOOK');
    if (providerAccount?.providerAccountId) {
      await ApiClient.updateMyfxbookAccountSettings(providerAccount.providerAccountId, payload);
      setMyfxbook((current) => current.data ? ({
        ...current,
        data: {
          ...current.data,
          accounts: current.data.accounts.map((account) => account.id === providerAccount.providerAccountId
            ? { ...account, displayName: payload.account_name, accountSettings: payload.account_settings as AccountSettings }
            : account),
        },
      }) : current);
      setSyncToast({ success: true, message: `${payload.account_name} settings saved.` });
      setTimeout(() => setSyncToast(null), 4000);
      return;
    }
    const updated = await ApiClient.updateAccount(accountId, payload);
    const mapped = mapBackendAccount(updated);
    setAccounts((current) => current.map((account) => account.id === accountId ? mapped : account));
    setSyncToast({ success: true, message: `${mapped.name} settings saved.` });
    setTimeout(() => setSyncToast(null), 4000);
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
    const myfxAccount = selectableAccounts.find((account) => account.id === requestedAccountId && account.source === 'MYFXBOOK');
    if (myfxAccount?.providerAccountId) {
      if (selectedAccountIdRef.current !== myfxAccount.id) {
        selectAccount(myfxAccount.id);
        return;
      }
      setIsSyncing(true);
      try {
        const refreshed = await loadMyfxbookActivity(myfxAccount);
        if (selectedAccountIdRef.current !== myfxAccount.id) return;
        if (!refreshed) throw new MyfxbookRequestError('Myfxbook history could not be refreshed.');
        setSyncToast({ success: true, message: `${myfxAccount.name} history refreshed from Myfxbook.` });
      } catch (error) {
        setSyncToast({ success: false, message: 'Myfxbook history could not be refreshed.' });
      } finally { setIsSyncing(false); setTimeout(() => setSyncToast(null), 5000); }
      return;
    }
    setIsSyncing(true);
    try {
      const res = await ApiClient.syncLocalConnector();

      if (res.success) {
        const backendAccounts = await ApiClient.getAccounts();
        const connectedAccounts = backendAccounts;
        const mappedAccounts = connectedAccounts.map(mapBackendAccount);
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
  const utcHour = Math.floor(utcSeconds / 3600);
  const sessionName = utcHour >= 13 && utcHour < 16 ? 'London / NY Overlap' : utcHour >= 7 && utcHour < 13 ? 'London Session' : utcHour >= 16 && utcHour < 21 ? 'New York Session' : 'Asian Session';
  const hourNow = new Date().getHours();
  const greeting = hourNow < 12 ? 'Good morning' : hourNow < 18 ? 'Good afternoon' : 'Good evening';
  const toast = syncToast && (
    <div role="status" className={`fixed bottom-6 right-6 z-[60] nova-enter rounded-xl border px-4 py-3 text-sm backdrop-blur-xl ${syncToast.success ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>{syncToast.message}</div>
  );

  if (!activeAccount) {
    return (
      <div className="min-h-screen bg-[#050812] text-slate-100 antialiased">
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden"><div className="absolute -top-40 left-1/4 h-[550px] w-[750px] rounded-full bg-violet-600/[0.08] blur-[140px]"/><div className="absolute top-1/3 -right-24 h-[600px] w-[600px] rounded-full bg-cyan-500/[0.05] blur-[150px]"/></div>
        <aside className={`fixed left-0 top-0 z-50 hidden h-full w-64 ${sidebarCollapsed ? 'lg:w-[76px]' : 'lg:w-64'} flex-col justify-between border-r border-blue-300/[0.08] bg-[#070b16]/95 shadow-[4px_0_32px_rgba(0,0,0,.45)] backdrop-blur-2xl transition-[width,transform] duration-200 ease-out lg:flex`}>
          <div>
            <div className={`flex h-[74px] w-full items-center border-b border-blue-200/[0.08] ${sidebarCollapsed ? 'justify-between px-4 lg:justify-center lg:px-2' : 'justify-between px-5'}`}>
            <button type="button" onClick={() => setActiveNav('overview')} title="NOVA Dashboard" className={`flex min-w-0 items-center gap-3 text-left ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <span className="nova-brand-star"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 2 29 18 46 24 29 29 24 46 18 29 2 24 18 18 24 2Z" stroke="currentColor" strokeWidth="2"/><path d="m24 11 3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10Z" fill="currentColor" fillOpacity=".32"/></svg></span>
              <span className={sidebarCollapsed ? 'lg:hidden' : ''}><strong className="block font-headline-sm text-lg font-medium tracking-[.24em] text-white">NOVA</strong><small className="mt-1 block text-[9px] tracking-wide text-slate-500">Trade smarter. Live freer.</small></span>
            </button>
            {!sidebarCollapsed && <button type="button" onClick={() => setSidebarCollapsed(true)} aria-label="Collapse sidebar" title="Collapse sidebar" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-white"><ChevronRight className="rotate-180" size={16}/></button>}
            </div>
            <p className={`px-5 pb-2 pt-6 font-label-tech text-[9px] uppercase tracking-[.2em] text-slate-600 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Workspace</p>
            {sidebarCollapsed && <button type="button" onClick={() => setSidebarCollapsed(false)} aria-label="Expand sidebar" title="Expand sidebar" className="mx-auto mt-3 hidden h-9 w-9 place-items-center rounded-lg border border-white/[.07] text-slate-400 transition hover:border-violet-400/30 hover:text-white lg:grid"><ChevronRight size={16}/></button>}
            <nav aria-label="Primary" className={`mt-2 flex flex-col gap-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
              {NAV_ITEMS.map((item) => <button key={item.id} type="button" onClick={() => { setActiveNav(item.id); if (item.id === 'accounts') setIsConnectAccountOpen(false); }} aria-current={activeNav === item.id ? 'page' : undefined} aria-label={sidebarCollapsed ? item.label : undefined} title={sidebarCollapsed ? item.label : undefined} className={`flex w-full items-center rounded-xl py-2.5 text-sm transition ${sidebarCollapsed ? 'gap-3 px-3.5 text-left lg:justify-center lg:px-0' : 'gap-3 px-3.5 text-left'} ${activeNav === item.id ? 'border border-violet-400/25 bg-gradient-to-r from-violet-600/25 to-blue-600/[0.04] font-medium text-white shadow-[0_0_24px_rgba(111,78,218,.1)]' : 'border border-transparent text-slate-400 hover:bg-white/[0.035] hover:text-slate-100'}`}><span className={`material-symbols-outlined text-[19px] ${activeNav === item.id ? 'text-violet-300' : 'text-slate-500'}`}>{item.icon}</span><span className={sidebarCollapsed ? 'lg:hidden' : ''}>{item.label}</span></button>)}
            </nav>
          </div>
          <div className={`m-3 ${sidebarCollapsed ? 'lg:flex lg:justify-center' : ''}`}><button type="button" onClick={() => void handleSyncFromHeader()} title="Refresh account data" aria-label="Refresh account data" className="w-full rounded-xl border border-blue-300/[0.1] bg-[#10182e]/60 px-3 py-2 text-xs text-violet-200 transition hover:border-violet-300/30">{sidebarCollapsed ? '↻' : 'Refresh account data'}</button></div>
        </aside>
        <div className={`relative z-10 transition-[padding] duration-200 ease-out ${sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-64'} xl:pr-[320px]`}>
          <header className={`fixed left-0 right-0 top-0 z-40 flex h-[74px] items-center justify-between gap-3 border-b border-blue-200/[0.08] bg-[#050812]/85 px-3 backdrop-blur-xl transition-[left] duration-200 ease-out sm:px-6 ${sidebarCollapsed ? 'lg:left-[76px]' : 'lg:left-64'}`}>
            <div className="flex min-w-0 items-center gap-2"><button type="button" aria-label="Open more navigation" onClick={() => setMobileMoreOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/5 lg:hidden"><span className="material-symbols-outlined">apps</span></button><div><h1 className="truncate text-sm font-semibold text-white sm:text-base">{greeting}{profile.display_name ? `, ${profile.display_name}` : ''}</h1><p className="hidden text-[10px] text-slate-500 sm:block">Your personal trading command center</p></div></div>
            <div className="flex items-center gap-2"><div className="hidden rounded-lg border border-blue-200/[0.09] bg-white/[0.025] px-3 py-2 text-[10px] text-slate-300 sm:block"><span className="text-slate-500">UTC</span> · {formatUtcClock(utcSeconds)}</div>{!import.meta.env.DEV && <button type="button" onClick={handleSignOut} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-slate-300 hover:bg-white/5">Sign out</button>}<button type="button" onClick={() => { setActiveNav('accounts'); setIsConnectAccountOpen(true); }} className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-3 py-2 text-[10px] font-semibold text-white shadow-[0_5px_20px_rgba(93,68,202,.22)]"><span className="sm:hidden">Connect</span><span className="hidden sm:inline">Connect account</span></button></div>
          </header>
          <main className="min-h-screen px-4 pb-28 pt-[94px] sm:px-6 xl:px-5">
            <div key={activeNav} className="nova-enter">
              {activeNav === 'overview' && <div className="overview-shell"><section className="empty-dashboard-hero"><div><p className="overview-eyebrow"><span className="status-dot"/>NOVA · READY WHEN YOU ARE</p><p className="overview-value-label">Your dashboard is ready</p><h2 className="overview-value">A clearer view<br/>starts here.</h2><p className="overview-hero-sub">Connect a supported account to see your actual balance, equity, and trading performance.</p><button type="button" onClick={() => { setActiveNav('accounts'); setIsConnectAccountOpen(true); }} className="empty-connect-button"><span className="material-symbols-outlined">add</span>Connect an account</button></div><div className="empty-dashboard-note"><span className="material-symbols-outlined">shield</span><strong>Real data only</strong><p>NOVA won’t show sample balances or invented trade history.</p></div></section><div className="overview-top-grid"><section className="overview-panel account-overview-panel"><div className="overview-panel-head"><div><h3>No accounts connected</h3><p>Once linked, your account summaries will appear here.</p></div></div><div className="overview-empty"><span className="material-symbols-outlined">account_balance</span><button type="button" onClick={() => { setActiveNav('accounts'); setIsConnectAccountOpen(true); }}>Connect your first account <ChevronRight size={14}/></button></div></section><section className="overview-panel quick-actions-panel"><div className="overview-panel-head"><div><h3>Quick actions</h3><p>Explore your workspace</p></div></div><div className="overview-action-list"><button type="button" onClick={() => { setActiveNav('accounts'); setIsConnectAccountOpen(true); }}><span className="action-icon violet"><span className="material-symbols-outlined">add</span></span><span><strong>Connect account</strong><small>Link a supported trading account</small></span><ChevronRight size={15}/></button><button type="button" onClick={() => setActiveNav('trade-journal')}><span className="action-icon blue"><span className="material-symbols-outlined">book</span></span><span><strong>Open journal</strong><small>Review recorded trades</small></span><ChevronRight size={15}/></button><button type="button" onClick={() => setActiveNav('analytics')}><span className="action-icon cyan"><span className="material-symbols-outlined">analytics</span></span><span><strong>Analyze performance</strong><small>Explore your trading analytics</small></span><ChevronRight size={15}/></button><button type="button" onClick={() => setActiveNav('finance')}><span className="action-icon green"><span className="material-symbols-outlined">account_balance_wallet</span></span><span><strong>View net worth</strong><small>Open your wealth tracker</small></span><ChevronRight size={15}/></button></div></section></div><div className="overview-panel p-5 text-xs text-slate-400">No NOVA trading accounts are connected yet.</div></div>}
              {activeNav === 'accounts' && (isConnectAccountOpen ? <ConnectAccountScreen onConnected={handleLocalAccountConnected} onCancel={() => { setActiveNav('overview'); setIsConnectAccountOpen(false); }} /> : <div className="overview-shell"><section className="overview-panel p-6"><h2 className="text-lg font-semibold text-white">No MT5 accounts connected</h2><button type="button" onClick={() => setIsConnectAccountOpen(true)} className="mt-3 text-sm text-violet-300">Connect account</button></section>{myfxbook.loading ? <p className="text-xs text-slate-500">Loading available accounts…</p> : myfxbook.error ? <p role="status" className="text-xs text-amber-200">Myfxbook account data is unavailable.</p> : <p className="text-xs text-slate-500">No connected trading accounts were returned.</p>}</div>)}
              {activeNav === 'trade-journal' && <TradeJournalScreen trades={trades} selectedTrade={selectedTrade} accounts={selectableAccounts} activeAccountId={undefined} onSelectAccount={selectAccount} currency={profile.currency} activityLoading={false} onSelectTrade={setSelectedTrade} onAddTrade={handleAddTrade} onDeleteTrade={handleDeleteTrade} />}
              {activeNav === 'ai' && <AiScreen name={profile.display_name} nova={nova} livekit={livekitVoice} />}
              {activeNav === 'finance' && <NetWorthScreen currency={profile.currency} goal={profile.networth_goal} onGoalChange={handleGoalChange} />}
              {activeNav === 'analytics' && <AnalyticsScreen trades={[]} currency={profile.currency} activityLoading={false} />}
              {activeNav === 'settings' && <SettingsPanel wake={wakeProps} profile={profile} onProfileChange={setProfile} accounts={accounts} onDeleteAccount={handleDeleteAccount} onConnect={() => { setActiveNav('accounts'); setIsConnectAccountOpen(true); }} onSignOut={import.meta.env.DEV ? undefined : handleSignOut} />}
            </div>
          </main>
        </div>
        <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-[#080b15]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">{MOBILE_PRIMARY.map(([id, label, icon]) => <button key={id} type="button" onClick={() => { setActiveNav(id); if (id === 'accounts') setIsConnectAccountOpen(false); }} aria-current={activeNav === id ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-1 text-[9px] ${activeNav === id ? 'text-violet-300' : 'text-slate-500'}`}><span className="material-symbols-outlined text-[20px]">{icon}</span>{label}</button>)}<button type="button" onClick={() => setMobileMoreOpen(true)} aria-expanded={mobileMoreOpen} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-1 text-[9px] ${(['ai', 'analytics', 'settings'] as NavSection[]).includes(activeNav) ? 'text-violet-300' : 'text-slate-500'}`}><span className="material-symbols-outlined text-[20px]">apps</span>More</button></nav>
        {mobileMoreOpen && <MobileMoreMenu activeNav={activeNav} onNavigate={setActiveNav} onClose={() => setMobileMoreOpen(false)}/>}
        {toast}<NovaOrbDock nova={nova} activeNav={activeNav} livekit={livekitVoice} />
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
      <aside className={`fixed left-0 top-0 hidden h-full w-64 ${sidebarCollapsed ? 'lg:w-[76px]' : 'lg:w-64'} bg-[#0a0c13]/90 backdrop-blur-2xl z-50 flex-col justify-between border-r border-white/[0.07] shadow-[4px_0_30px_rgba(0,0,0,0.6)] transition-[width,transform] duration-200 ease-out lg:flex`}>
        <div className="flex flex-col">
          <div className={`h-16 flex items-center border-b border-white/[0.06] bg-white/[0.01] ${sidebarCollapsed ? 'justify-between px-4 lg:justify-center lg:px-2' : 'justify-between px-4'}`}>
            <div
              onClick={() => setActiveNav('overview')}
              title="NOVA Dashboard"
              className={`flex items-center gap-3 cursor-pointer ${sidebarCollapsed ? 'justify-center' : ''}`}
            >
              <div className="nova-brand-star" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none"><path d="M24 2 29 18 46 24 29 29 24 46 18 29 2 24 18 18 24 2Z" stroke="currentColor" strokeWidth="2"/><path d="m24 11 3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10Z" fill="currentColor" fillOpacity=".32"/></svg>
              </div>
              <div className={`flex flex-col ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                <span className="font-headline-sm text-sm uppercase tracking-wider text-white font-bold leading-none">
                  NOVA
                </span>
                <span className="font-label-tech text-[9px] text-cyan-400 font-semibold tracking-widest leading-none mt-1">
                  INTELLIGENCE OS
                </span>
              </div>
            </div>
            {!sidebarCollapsed && <span className="font-label-tech text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-medium shadow-[0_0_10px_rgba(168,85,247,0.2)]">
              v2.4 Pro
            </span>}
            <button type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-white ${sidebarCollapsed ? 'border border-white/[.07] bg-white/[.03]' : ''}`}><ChevronRight size={15} className={sidebarCollapsed ? '' : 'rotate-180'}/></button>
          </div>

          <div className={`px-5 pt-5 pb-2 flex items-center justify-between ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
            <span className="font-label-tech text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
              Sovereign Terminal
            </span>
            <span className="h-1 w-1 rounded-full bg-cyan-400"></span>
          </div>

          <nav aria-label="Primary" className={`flex flex-col gap-1 ${sidebarCollapsed ? 'px-3 lg:px-2' : 'px-3'}`}>
            {NAV_ITEMS.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveNav(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={sidebarCollapsed ? item.label : undefined}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={
                    isActive
                      ? `relative group flex ${sidebarCollapsed ? 'items-center gap-3 px-3.5 text-left lg:justify-center lg:px-0' : 'items-center gap-3 px-3.5 text-left'} py-2.5 rounded-xl bg-gradient-to-r from-purple-600/30 via-purple-600/15 to-transparent text-white font-medium border border-purple-500/30 shadow-[0_0_20px_rgba(147,51,234,0.18)] transition-all duration-200 w-full`
                      : `flex ${sidebarCollapsed ? 'items-center gap-3 px-3.5 text-left lg:justify-center lg:px-0' : 'items-center gap-3 px-3.5 text-left'} py-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] transition-all duration-150 font-body-md text-sm group w-full`
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
                      `${isActive ? 'font-body-md text-sm font-semibold tracking-tight' : ''} ${sidebarCollapsed ? 'lg:hidden' : ''}`
                    }
                  >
                    {item.label}
                  </span>
                  {!sidebarCollapsed && item.badge && (
                    <span className="ml-auto font-label-tech text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="m-3"><button type="button" onClick={() => void handleSyncFromHeader(activeAccount.id)} title="Refresh account data" aria-label="Refresh account data" className={`rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-violet-200 transition hover:border-violet-400/30 ${sidebarCollapsed ? 'w-full' : ''}`}>{sidebarCollapsed ? '↻' : 'Refresh account data'}</button></div>
      </aside>

      {/* Main Wrapper */}
      <div className={`relative z-10 transition-[padding] duration-200 ease-out ${sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-64'} xl:pr-[320px]`}>
        <header className={`fixed top-0 right-0 h-16 bg-[#08090e]/80 backdrop-blur-2xl z-40 px-3 sm:px-6 flex items-center justify-between border-b border-white/[0.07] shadow-[0_4px_30px_rgba(0,0,0,0.5)] transition-[left] duration-200 ease-out ${sidebarCollapsed ? 'left-0 lg:left-[76px]' : 'left-0 lg:left-64'}`}>
          <div className="flex min-w-0 items-center gap-2">
          <button type="button" aria-label="Open more navigation" onClick={() => setMobileMoreOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-white/5 lg:hidden"><span className="material-symbols-outlined">apps</span></button>
          <div className="flex min-w-0 flex-col justify-center">
            <div className="flex items-center gap-2.5">
              <span className="font-headline-sm text-base text-white font-semibold tracking-tight hidden sm:inline truncate">
                {greeting}{profile.display_name ? `, ${profile.display_name}` : ''}
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
              <button type="button" onClick={() => void handleSyncFromHeader(activeAccount.id)} title="Refresh account data" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-purple-500/30">Refresh data</button>
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
                      Trading Accounts ({selectableAccounts.length})
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
                    {selectableAccounts.map((acc) => {
                      const isActive = acc.id === activeAccount.id;
                      const accTradesCount = allDashboardTrades.filter((t) => t.accountId === acc.id).length;
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
                              selectAccount(acc.id);
                              setShowProfileMenu(false);
                            }}
                            className="cursor-pointer flex-1 mr-2"
                          >
                            <span className="font-body-sm text-xs font-bold block truncate max-w-[170px]">
                              {acc.name}
                            </span>
                            <span className="font-label-numeric-sm text-[10px] text-slate-400">
                              {acc.source === 'MYFXBOOK' ? 'Myfxbook' : acc.ref} • {accTradesCount} trades
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-label-numeric-sm text-xs text-emerald-400 font-bold tabular-nums">
                              {acc.balanceAvailable === false ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: acc.currency || 'USD' }).format(acc.currentBalance)}
                            </span>
                            {acc.source !== 'MYFXBOOK' && (
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
              accounts={selectableAccounts}
              trades={allDashboardTrades}
              onSync={() => void handleSyncFromHeader(activeAccount.id)}
              onOpenImportModal={() => {
                setTargetImportAccount(activeAccount);
                setIsImportModalOpen(true);
              }}
              onNavigateToJournal={() => setActiveNav('trade-journal')}
              onNavigateToAccounts={() => { setActiveNav('accounts'); setIsConnectAccountOpen(false); }}
              onNavigateToAnalytics={() => setActiveNav('analytics')}
              onNavigateToFinance={() => setActiveNav('finance')}
              onNavigateToSettings={() => setActiveNav('settings')}
              onSelectAccount={selectAccount}
              onOpenAccountDetails={(id) => { selectAccount(id); setActiveNav('accounts'); setIsConnectAccountOpen(false); setAccountDetailsId(id); }}
              activityLoading={selectedMyfxbookLoading}
              activityLoaded={selectedMyfxbookActivity?.loaded}
              activityError={historyNotice?.accountId === activeAccount.id ? historyNotice.message : null}
              activityHistoryLimit={activeAccount.source === 'MYFXBOOK' ? MYFXBOOK_HISTORY_LIMIT : undefined}
            />
          )}

          {activeNav === 'trade-journal' && (
            <TradeJournalScreen
              trades={activeTrades}
              selectedTrade={selectedTrade}
              accounts={[activeAccount]}
              activeAccountId={activeAccount.id}
              onSelectAccount={selectAccount}
              onSelectTrade={setSelectedTrade}
              onAddTrade={handleAddTrade}
              onDeleteTrade={handleDeleteTrade}
              onSyncPastTrades={(id) => handleSyncFromHeader(id)}
              onOpenImportModal={() => {
                setTargetImportAccount(activeAccount);
                setIsImportModalOpen(true);
              }}
              currency={activeAccount.currency}
              activityLoading={selectedMyfxbookLoading}
              activityError={historyNotice?.accountId === activeAccount.id ? historyNotice.message : null}
              activityHistoryLimit={activeAccount.source === 'MYFXBOOK' ? MYFXBOOK_HISTORY_LIMIT : undefined}
            />
          )}

          {activeNav === 'ai' && <AiScreen name={profile.display_name} nova={nova} livekit={livekitVoice} />}
          {activeNav === 'finance' && <NetWorthScreen currency={profile.currency} goal={profile.networth_goal} onGoalChange={handleGoalChange} />}
          {activeNav === 'analytics' && <AnalyticsScreen trades={activeTrades} currency={activeAccount.currency} activityLoading={selectedMyfxbookLoading} activityError={historyNotice?.accountId === activeAccount.id ? historyNotice.message : null} activityHistoryLimit={activeAccount.source === 'MYFXBOOK' ? MYFXBOOK_HISTORY_LIMIT : undefined} providerAccountProfit={activeAccount.source === 'MYFXBOOK' && activeAccount.profitAvailable ? activeAccount.netProfit : undefined} />}

          {activeNav === 'accounts' && (
            isConnectAccountOpen ? (
              <ConnectAccountScreen onConnected={handleLocalAccountConnected} onCancel={() => setIsConnectAccountOpen(false)} />
            ) : <AccountsScreen
              accounts={selectableAccounts}
              activeAccountId={activeAccount.id}
              trades={allDashboardTrades}
              onSelectAccount={(id) => { selectAccount(id); setActiveNav('overview'); }}
              onOpenConnectModal={() => setIsConnectAccountOpen(true)}
              onDeleteAccount={handleDeleteAccount}
              onUpdateAccount={handleUpdateAccount}
              editAccountId={accountEditId}
              onEditAccountHandled={() => setAccountEditId(null)}
              openDetailsAccountId={accountDetailsId}
              onDetailsHandled={() => setAccountDetailsId(null)}
              onSyncPastTrades={(id) => handleSyncFromHeader(id)}
              onOpenImportModal={(acc) => {
                setTargetImportAccount(acc);
                setIsImportModalOpen(true);
              }}
              onNavigateToJournal={(accId) => {
                if (accId) selectAccount(accId);
                setActiveNav('trade-journal');
              }}
              onViewDetails={(id) => { selectAccount(id); setAccountDetailsId(id); }}
            />
          )}

          {activeNav === 'settings' && (
            <SettingsPanel wake={wakeProps}
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
        {MOBILE_PRIMARY.map(([id, label, icon]) => (
          <button key={id} type="button" onClick={() => { setActiveNav(id); if (id === 'accounts') setIsConnectAccountOpen(false); }} aria-current={activeNav === id ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-1 text-[10px] transition-colors ${activeNav === id ? 'text-cyan-300' : 'text-slate-500'}`}>
            <span className="material-symbols-outlined text-[22px]">{icon}</span>{label}
          </button>
        ))}
        <button type="button" onClick={() => setMobileMoreOpen(true)} aria-expanded={mobileMoreOpen} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-1 text-[10px] ${(['ai', 'analytics', 'settings'] as NavSection[]).includes(activeNav) ? 'text-cyan-300' : 'text-slate-500'}`}><span className="material-symbols-outlined text-[22px]">apps</span>More</button>
      </nav>
      {mobileMoreOpen && <MobileMoreMenu activeNav={activeNav} onNavigate={setActiveNav} onClose={() => setMobileMoreOpen(false)}/>}

      {toast}
      <NovaOrbDock nova={nova} activeNav={activeNav} livekit={livekitVoice} />

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
