import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ArrowUpRightFromSquare, BarChart3, BookOpen, ChevronRight, CircleDollarSign, Clock3, Plus, RefreshCw, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react';
import { PropAccount, TradeExecution } from '../data/terminalData';

interface OverviewScreenProps {
  activeAccount: PropAccount;
  accounts: PropAccount[];
  trades: TradeExecution[];
  onSync: () => void;
  onOpenImportModal: () => void;
  onNavigateToJournal: () => void;
  onNavigateToAccounts: () => void;
  onNavigateToAnalytics: () => void;
  onNavigateToFinance: () => void;
  onNavigateToSettings: () => void;
  onSelectAccount: (accountId: string) => void;
}

type Range = '7d' | '30d' | 'all';
const money = (value: number, currency?: string) => {
  try {
    if (currency) return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch { /* A missing or unsupported currency is shown as an unqualified amount. */ }
  return Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/^/, value < 0 ? '−' : '');
};
const dateValue = (time: string) => {
  const parsed = Date.parse(time);
  return Number.isFinite(parsed) ? parsed : null;
};

const TrendLine: React.FC<{ trades: TradeExecution[]; currency?: string }> = ({ trades, currency }) => {
  const values = trades.reduce<number[]>((acc, trade) => [...acc, (acc.at(-1) || 0) + (Number(trade.pnlValue) || 0)], []);
  if (values.length < 2) return <div className="overview-chart-empty">{values.length ? 'Add more dated trade results to see a trend.' : 'No trade history available for this range.'}</div>;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => `${24 + index * (552 / (values.length - 1))},${156 - ((value - min) / span) * 126}`).join(' ');
  const last = values.at(-1) || 0;
  return <div className="overview-chart-wrap">
    <svg viewBox="0 0 600 180" role="img" aria-label={`Cumulative realized profit and loss, ending at ${money(last, currency)}`} className="overview-chart">
      <defs><linearGradient id="nova-chart-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity=".3"/><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0"/></linearGradient></defs>
      {[35, 75, 115, 155].map((y) => <line key={y} x1="24" x2="576" y1={y} y2={y} stroke="rgba(148,163,184,.12)" strokeDasharray="3 6" />)}
      <polygon points={`24,156 ${points} 576,156`} fill="url(#nova-chart-area)" />
      <polyline points={points} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="576" cy={156 - ((last - min) / span) * 126} r="4" fill="#c4b5fd" stroke="#080b15" strokeWidth="3" />
    </svg>
    <div className="overview-chart-axis"><span>{trades[0]?.time || 'First trade'}</span><span>{trades.at(-1)?.time || 'Latest trade'}</span></div>
  </div>;
};

const MiniLine: React.FC<{ trades: TradeExecution[]; color?: string }> = ({ trades, color = '#22d3ee' }) => {
  const values = trades.slice(-8).map((trade) => Number(trade.pnlValue) || 0);
  if (values.length < 2) return <div className="h-8" />;
  const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const points = values.map((v, i) => `${i * (100 / (values.length - 1))},${26 - ((v - min) / span) * 20}`).join(' ');
  return <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true" className="h-8 w-full"><polyline points={points} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg>;
};

export const OverviewScreen: React.FC<OverviewScreenProps> = ({ activeAccount, accounts, trades, onSync, onOpenImportModal, onNavigateToJournal, onNavigateToAccounts, onNavigateToAnalytics, onNavigateToFinance, onNavigateToSettings, onSelectAccount }) => {
  const [range, setRange] = useState<Range>('all');
  const accountTrades = trades.filter((trade) => trade.accountId === activeAccount.id);
  const closedTrades = accountTrades.filter((trade) => trade.outcome === 'WIN' || trade.outcome === 'LOSS' || trade.outcome === 'BE');
  const winningTrades = closedTrades.filter((trade) => trade.outcome === 'WIN').length;
  const losingTrades = closedTrades.filter((trade) => trade.outcome === 'LOSS').length;
  const realizedPnl = closedTrades.reduce((total, trade) => total + (Number(trade.pnlValue) || 0), 0);
  const winRate = closedTrades.length ? (winningTrades / closedTrades.length) * 100 : null;
  const floatingPnl = Number(activeAccount.floatingPnl);
  const hasFloatingPnl = Number.isFinite(floatingPnl);
  const recentTrades = useMemo(() => [...accountTrades].sort((a, b) => (dateValue(b.time) || 0) - (dateValue(a.time) || 0)).slice(0, 5), [accountTrades]);
  const chartTrades = useMemo(() => {
    const sorted = [...closedTrades].filter((trade) => dateValue(trade.time) !== null).sort((a, b) => (dateValue(a.time) || 0) - (dateValue(b.time) || 0));
    if (range === 'all') return sorted;
    const cutoff = Date.now() - (range === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
    return sorted.filter((trade) => (dateValue(trade.time) || 0) >= cutoff);
  }, [closedTrades, range]);
  const progress = activeAccount.targetConfigured && activeAccount.targetProfit > 0 ? Math.max(0, Math.min(100, ((realizedPnl + (hasFloatingPnl ? floatingPnl : 0)) / activeAccount.targetProfit) * 100)) : null;
  const averageR = closedTrades.length ? closedTrades.reduce((total, trade) => total + (Number(trade.rValue) || 0), 0) / closedTrades.length : null;
  const accountColor = ['#8b5cf6', '#22d3ee', '#34d399', '#f59e0b', '#ec4899'];

  return <div className="overview-shell">
    <section className="overview-hero">
      <div className="overview-hero-content">
        <div className="overview-eyebrow"><span className={`status-dot ${activeAccount.isRealConnected ? 'is-online' : ''}`} />{activeAccount.isRealConnected ? 'MT5 LINK CONNECTED' : 'ACCOUNT SNAPSHOT'}<span className="overview-eyebrow-divider" />{activeAccount.phaseConfigured ? activeAccount.phase : 'Trading account'}</div>
        <p className="overview-value-label">{activeAccount.name} · current balance</p>
        <h1 className="overview-value">{money(activeAccount.currentBalance, activeAccount.currency)}</h1>
        <p className="overview-hero-sub">{activeAccount.shortRef} <span>·</span> Equity {money(activeAccount.liveEquity, activeAccount.currency)}{!activeAccount.currency && <span>· Currency unavailable</span>}</p>
        <div className={`overview-hero-change ${activeAccount.netProfit >= 0 ? 'positive' : 'negative'}`}>{activeAccount.netProfit >= 0 ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>} {money(activeAccount.netProfit, activeAccount.currency)} since starting balance <span>({activeAccount.roiPercent >= 0 ? '+' : ''}{activeAccount.roiPercent.toFixed(2)}%)</span></div>
      </div>
      <div className="overview-hero-quote"><span>“Consistency compounds.<br/>One clear decision at a time.”</span><small>— NOVA</small></div>
      <div className="overview-stat-row">
        <div className="overview-stat"><span className="stat-icon violet"><WalletCards size={17}/></span><div><small>Starting balance</small><strong>{money(activeAccount.baseBalance, activeAccount.currency)}</strong><em>Selected account</em></div></div>
        <div className="overview-stat"><span className="stat-icon green"><TrendingUp size={17}/></span><div><small>Realized P&amp;L</small><strong className={realizedPnl >= 0 ? 'positive' : 'negative'}>{money(realizedPnl, activeAccount.currency)}</strong><em>{closedTrades.length} closed trades</em></div></div>
        <div className="overview-stat"><span className="stat-icon blue"><ShieldCheck size={17}/></span><div><small>Win rate</small><strong>{winRate === null ? '—' : `${winRate.toFixed(1)}%`}</strong><em>{winningTrades}W / {losingTrades}L</em></div></div>
        <div className="overview-stat"><span className="stat-icon pink"><CircleDollarSign size={17}/></span><div><small>Connected accounts</small><strong>{accounts.length}</strong><em>Balances shown individually</em></div></div>
      </div>
    </section>

    <div className="overview-section-heading"><div><p className="overview-kicker">YOUR TRADING OVERVIEW</p><h2>Account snapshot</h2></div><div className="overview-heading-actions"><button type="button" className="overview-icon-button" onClick={onSync} aria-label="Sync account data" title="Sync account data"><RefreshCw size={15}/></button><button type="button" className="overview-outline-button" onClick={onOpenImportModal}>Import statement</button></div></div>

    <div className="overview-top-grid">
      <section className="overview-panel account-overview-panel">
        <div className="overview-panel-head"><div><h3>Accounts</h3><p>Choose an account to view its current figures</p></div><button type="button" className="overview-link" onClick={onNavigateToAccounts}>All accounts <ChevronRight size={14}/></button></div>
        {accounts.length === 0 ? <div className="overview-empty"><WalletCards size={22}/><p>No connected accounts yet.</p><button type="button" onClick={onNavigateToAccounts}>Connect an account</button></div> : <div className="overview-account-list">{accounts.map((account, index) => {
          const selected = account.id === activeAccount.id;
          const accountClosed = trades.filter((trade) => trade.accountId === account.id && ['WIN', 'LOSS', 'BE'].includes(trade.outcome));
          return <button type="button" key={account.id} aria-pressed={selected} onClick={() => onSelectAccount(account.id)} className={`overview-account-row ${selected ? 'selected' : ''}`}>
            <span className="account-mark" style={{ '--account-accent': accountColor[index % accountColor.length] } as React.CSSProperties}>{account.name.slice(0, 1).toUpperCase()}</span>
            <span className="account-row-name"><strong>{account.name}</strong><small>{[account.provider, account.accountType, account.phaseConfigured ? account.phase : undefined].filter(Boolean).join(' · ') || account.shortRef}</small></span>
            <span className="account-row-state"><i className={`status-dot ${account.isRealConnected ? 'is-online' : ''}`} />{account.isRealConnected ? 'Live' : 'Offline'}</span>
            <span className="account-row-value"><strong>{money(account.currentBalance, account.currency)}</strong><small>{accountClosed.length} trades</small></span>
          </button>;
        })}</div>}
        <div className="overview-panel-foot"><span>Selected account</span><span>{activeAccount.name}</span></div>
      </section>

      <section className="overview-panel quick-actions-panel">
        <div className="overview-panel-head"><div><h3>Quick actions</h3><p>Jump into your workspace</p></div></div>
        <div className="overview-action-list">
          <button type="button" onClick={onNavigateToAccounts}><span className="action-icon violet"><Plus size={17}/></span><span><strong>Add account</strong><small>Connect a trading account</small></span><ChevronRight size={15}/></button>
          <button type="button" onClick={onNavigateToJournal}><span className="action-icon blue"><BookOpen size={17}/></span><span><strong>Open journal</strong><small>Review your trade history</small></span><ChevronRight size={15}/></button>
          <button type="button" onClick={onNavigateToAnalytics}><span className="action-icon cyan"><BarChart3 size={17}/></span><span><strong>Analyze performance</strong><small>Explore account analytics</small></span><ChevronRight size={15}/></button>
          <button type="button" onClick={onNavigateToFinance}><span className="action-icon green"><CircleDollarSign size={17}/></span><span><strong>View net worth</strong><small>Open your wealth tracker</small></span><ChevronRight size={15}/></button>
          <button type="button" onClick={onNavigateToSettings}><span className="action-icon slate"><Clock3 size={17}/></span><span><strong>Settings</strong><small>Profile and preferences</small></span><ChevronRight size={15}/></button>
        </div>
      </section>
    </div>

    <div className="overview-section-heading compact"><div><p className="overview-kicker">LIVE ACCOUNTS</p><h2>Your accounts</h2></div><button type="button" className="overview-link" onClick={onNavigateToAccounts}>Manage accounts <ChevronRight size={14}/></button></div>
    <section className="overview-account-cards">
      {accounts.length ? accounts.map((account, index) => {
        const accountTrades = trades.filter((trade) => trade.accountId === account.id);
        const closed = accountTrades.filter((trade) => ['WIN', 'LOSS', 'BE'].includes(trade.outcome));
        const pnl = closed.reduce((total, trade) => total + (Number(trade.pnlValue) || 0), 0);
        return <article key={account.id} className={`overview-account-card ${account.id === activeAccount.id ? 'active' : ''}`}>
          <div className="account-card-top"><span className="account-mark" style={{ '--account-accent': accountColor[index % accountColor.length] } as React.CSSProperties}>{account.name.slice(0, 1).toUpperCase()}</span><span className={`account-type-pill ${account.isRealConnected ? 'connected' : ''}`}>{account.accountType || (account.isRealConnected ? 'CONNECTED' : 'OFFLINE')}</span><button type="button" aria-label={`View ${account.name}`} onClick={() => onSelectAccount(account.id)}><ArrowUpRightFromSquare size={15}/></button></div>
          <p className="account-card-name">{account.name}</p><p className="account-card-meta">{[account.provider, account.shortRef].filter(Boolean).join(' · ')}</p>
          <strong className="account-card-balance">{money(account.currentBalance, account.currency)}</strong>
          <div className="account-card-pnl"><span className={pnl >= 0 ? 'positive' : 'negative'}>{money(pnl, account.currency)}</span><small>realized P&amp;L</small></div>
          <div className="account-card-chart"><MiniLine trades={accountTrades} color={accountColor[index % accountColor.length]} /></div>
          <div className="account-card-bottom"><span>{closed.length} trades</span><span>{account.phaseConfigured ? account.phase : 'Trading account'}</span></div>
          <button type="button" className="account-details-button" onClick={() => onSelectAccount(account.id)}>View account details <ChevronRight size={14}/></button>
        </article>;
      }) : <div className="overview-panel empty-account-card"><p>Connect a supported account to see live account details here.</p><button type="button" onClick={onNavigateToAccounts}>Go to accounts <ChevronRight size={14}/></button></div>}
    </section>

    <div className="overview-bottom-grid">
      <section className="overview-panel performance-panel">
        <div className="overview-panel-head"><div><p className="overview-kicker">PERFORMANCE</p><h3>Realized P&amp;L trend</h3></div><div className="overview-range">{([['7d', '7 days'], ['30d', '30 days'], ['all', 'All']] as const).map(([key, label]) => <button type="button" key={key} onClick={() => setRange(key)} className={range === key ? 'active' : ''}>{label}</button>)}</div></div>
        <div className="performance-summary"><span>Selected account</span><strong className={realizedPnl >= 0 ? 'positive' : 'negative'}>{money(realizedPnl, activeAccount.currency)}</strong><small>{closedTrades.length} closed results</small></div>
        <TrendLine trades={chartTrades} currency={activeAccount.currency}/>
        <div className="performance-foot"><span>Cumulative realized trade results</span><button type="button" className="overview-link" onClick={onNavigateToAnalytics}>Full analytics <ChevronRight size={14}/></button></div>
      </section>

      <section className="overview-panel journal-panel">
        <div className="overview-panel-head"><div><p className="overview-kicker">JOURNAL</p><h3>Trading discipline</h3></div><button type="button" className="overview-link" onClick={onNavigateToJournal}>Open journal <ChevronRight size={14}/></button></div>
        <div className="journal-score-row"><div className="win-ring" style={{ '--win-angle': `${(winRate || 0) * 3.6}deg` } as React.CSSProperties}><span>{winRate === null ? '—' : `${winRate.toFixed(0)}%`}</span></div><div><strong>Win rate</strong><small>{closedTrades.length ? `${winningTrades} wins · ${losingTrades} losses` : 'No closed trades yet'}</small></div></div>
        <div className="journal-stats"><div><small>Closed trades</small><strong>{closedTrades.length}</strong></div><div><small>Realized P&amp;L</small><strong className={realizedPnl >= 0 ? 'positive' : 'negative'}>{money(realizedPnl, activeAccount.currency)}</strong></div><div><small>Average R</small><strong>{averageR === null ? '—' : `${averageR >= 0 ? '+' : ''}${averageR.toFixed(2)}R`}</strong></div></div>
        {progress !== null && <div className="challenge-progress"><div className="challenge-progress-head"><span>{activeAccount.phaseConfigured ? activeAccount.phase : 'Configured target'} progress</span><strong>{progress.toFixed(1)}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }}/></div><small>Realized {money(realizedPnl, activeAccount.currency)}{hasFloatingPnl ? ` · Floating ${money(floatingPnl, activeAccount.currency)}` : ''} toward configured target {money(activeAccount.targetProfit, activeAccount.currency)}</small></div>}
      </section>
    </div>

    <section className="overview-panel recent-trades-panel">
      <div className="overview-panel-head"><div><p className="overview-kicker">ACTIVITY</p><h3>Recent trades</h3></div><button type="button" className="overview-link" onClick={onNavigateToJournal}>View journal <ChevronRight size={14}/></button></div>
      {recentTrades.length ? <div className="overview-trade-table-wrap"><table className="overview-trade-table"><thead><tr><th>Instrument</th><th>Side</th><th>Size</th><th>Result</th><th>Profit &amp; loss</th><th>Time</th></tr></thead><tbody>{recentTrades.map((trade) => <tr key={trade.id}><td><span className="trade-symbol-mark">{trade.instrument.slice(0, 1)}</span><strong>{trade.instrument || '—'}</strong></td><td><span className={`trade-side ${trade.side.toLowerCase()}`}>{trade.side}</span></td><td>{trade.lots || '—'}</td><td>{trade.outcome}</td><td className={(Number(trade.pnlValue) || 0) >= 0 ? 'positive' : 'negative'}>{trade.netPnl || '—'}</td><td>{trade.time || '—'}</td></tr>)}</tbody></table></div> : <div className="overview-empty compact-empty"><p>No trade history found for this account.</p><button type="button" onClick={onSync}>Sync account history <RefreshCw size={13}/></button></div>}
    </section>

    <section className="overview-banner"><div className="banner-star">✦</div><div><p className="overview-kicker">NOVA · YOUR TRADING COMPANION</p><h3>Discipline today. Freedom tomorrow.</h3><p>Your account data stays grounded in the connections you choose.</p></div><button type="button" onClick={onNavigateToJournal}>Review your journal <ChevronRight size={15}/></button></section>
  </div>;
};
