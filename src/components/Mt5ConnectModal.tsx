import React, { useState } from 'react';
import {
  generatePastTradesForAccount,
  Mt5BridgeConfig,
  PropAccount,
  TradeExecution,
} from '../data/terminalData';

interface Mt5ConnectModalProps {
  currentConfig: Mt5BridgeConfig;
  isOpen: boolean;
  onClose: () => void;
  onConnect: (
    account: PropAccount,
    config: Mt5BridgeConfig,
    pastTrades?: TradeExecution[]
  ) => void;
  onOpenImportModal?: () => void;
}

const POPULAR_BROKERS = [
  { name: 'FundingPips', server: 'FundingPips-Server', defaultBalance: 5000, target: 6, daily: 5, max: 10 },
  { name: 'FTMO', server: 'FTMO-Demo', defaultBalance: 100000, target: 10, daily: 5, max: 10 },
  { name: 'Topstep', server: 'Topstep-Live', defaultBalance: 50000, target: 6, daily: 4, max: 6 },
  { name: 'Alpha Capital', server: 'AlphaCapital-Server', defaultBalance: 50000, target: 8, daily: 5, max: 10 },
  { name: 'MetaQuotes Demo', server: 'MetaQuotes-Demo', defaultBalance: 10000, target: 6, daily: 5, max: 10 },
  { name: 'Custom Broker / MT5', server: 'Custom-Server-01', defaultBalance: 10000, target: 6, daily: 5, max: 10 },
];

export const Mt5ConnectModal: React.FC<Mt5ConnectModalProps> = ({
  currentConfig,
  isOpen,
  onClose,
  onConnect,
  onOpenImportModal,
}) => {
  const [broker, setBroker] = useState(currentConfig.broker || 'FundingPips');
  const [server, setServer] = useState(currentConfig.server || 'FundingPips-Server');
  const [loginId, setLoginId] = useState(currentConfig.loginId || '');
  const [password, setPassword] = useState('');
  const [balance, setBalance] = useState<number>(currentConfig.baseBalance || 5000);
  const [phase, setPhase] = useState(currentConfig.phase || 'Phase 1 Evaluation');
  const [targetPct, setTargetPct] = useState<number>(currentConfig.targetPercent || 6.0);
  const [dailyLossPct, setDailyLossPct] = useState<number>(currentConfig.dailyLossPercent || 5.0);
  const [maxLossPct, setMaxLossPct] = useState<number>(currentConfig.maxLossPercent || 10.0);
  const [protocol, setProtocol] = useState<'EA_WEBHOOK' | 'META_API' | 'ZEROMQ' | 'REST_GATEWAY'>(
    currentConfig.bridgeProtocol || 'EA_WEBHOOK'
  );
  const [pastTradesOption, setPastTradesOption] = useState<'0' | '5' | '10' | '15'>('5');
  const [connecting, setConnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleBrokerChange = (brokerName: string) => {
    setBroker(brokerName);
    const found = POPULAR_BROKERS.find((b) => b.name === brokerName);
    if (found) {
      setServer(found.server);
      setBalance(found.defaultBalance);
      setTargetPct(found.target);
      setDailyLossPct(found.daily);
      setMaxLossPct(found.max);
    }
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText('https://api.novaterminal.io/v2/mt5/webhook/' + (loginId || '884192'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setStatusMessage('Pinging London Equinix LD4 server...');

    setTimeout(() => {
      setStatusMessage('Validating MT5 account permissions & pulling specs...');
    }, 600);

    const count = parseInt(pastTradesOption, 10);
    setTimeout(() => {
      setStatusMessage(
        count > 0
          ? `Syncing ${count} past closed trade deals and equity curve...`
          : 'MetaTrader 5 Bridge connected successfully!'
      );
    }, 1100);

    setTimeout(() => {
      const cleanLogin = loginId.trim() || '884192';
      const targetProfit = Number(((balance * targetPct) / 100).toFixed(2));
      const dailyLimit = Number(((balance * dailyLossPct) / 100).toFixed(2));
      const maxLossLimit = Number(((balance * maxLossPct) / 100).toFixed(2));

      let generatedTrades: TradeExecution[] = [];
      let currentBal = balance;
      let netProf = 0;
      let currentDailyDd = 0;
      let currentMaxDd = 0;

      const dummyAccount: PropAccount = {
        id: `mt5-${cleanLogin}`,
        name: `${broker} ${Math.round(balance / 1000)}K ${phase}`,
        ref: `#${cleanLogin}-${broker.slice(0, 2).toUpperCase()}`,
        shortRef: `${broker} #${cleanLogin}`,
        bridge: `${server} • LD4 Bridge`,
        phase: phase,
        baseBalance: balance,
        currentBalance: balance,
        liveEquity: balance,
        floatingPnl: 0,
        netProfit: 0,
        roiPercent: 0,
        targetProfit: targetProfit,
        targetPercent: targetPct,
        passThreshold: balance + targetProfit,
        dailyLimit: dailyLimit,
        currentDailyDrawdown: 0,
        maxLossLimit: maxLossLimit,
        currentMaxDrawdown: 0,
        peakWater: balance,
        status: 'SAFE',
        isRealConnected: true,
      };

      if (count > 0) {
        generatedTrades = generatePastTradesForAccount(dummyAccount, count);
        netProf = generatedTrades.reduce((acc, t) => acc + t.pnlValue, 0);
        currentBal = Number((balance + netProf).toFixed(2));
        const lossesOnly = generatedTrades
          .filter((t) => t.pnlValue < 0)
          .reduce((acc, t) => acc + Math.abs(t.pnlValue), 0);
        currentDailyDd = Number((lossesOnly * 0.4).toFixed(2));
        currentMaxDd = Number(lossesOnly.toFixed(2));
      }

      const updatedAccount: PropAccount = {
        ...dummyAccount,
        currentBalance: currentBal,
        liveEquity: currentBal,
        netProfit: netProf,
        roiPercent: Number(((netProf / balance) * 100).toFixed(2)),
        currentDailyDrawdown: currentDailyDd,
        currentMaxDrawdown: currentMaxDd,
        peakWater: Math.max(balance, currentBal),
        tradeCount: generatedTrades.length,
      };

      const updatedConfig: Mt5BridgeConfig = {
        isConnected: true,
        loginId: cleanLogin,
        server,
        broker,
        phase,
        baseBalance: balance,
        targetPercent: targetPct,
        dailyLossPercent: dailyLossPct,
        maxLossPercent: maxLossPct,
        bridgeProtocol: protocol,
        apiToken: password ? '••••••••' : 'EA_TOKEN_LD4',
        webhookUrl: `https://api.novaterminal.io/v2/mt5/webhook/${cleanLogin}`,
        latencyMs: 14,
        connectedAt: new Date().toISOString(),
      };

      setConnecting(false);
      onConnect(updatedAccount, updatedConfig, generatedTrades);
      onClose();
    }, 1600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="terminal-glass rounded-2xl p-6 w-full max-w-xl border border-white/15 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <span className="material-symbols-outlined text-xl">router</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-base font-bold text-white leading-none">
                Connect Real MetaTrader 5 Account
              </h2>
              <span className="font-label-tech text-[10px] text-cyan-400 mt-1 block">
                DIRECT INSTITUTIONAL BRIDGE CONFIGURATION
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-slate-400 hover:text-white flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Preset Broker Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-label-tech text-[10px] text-slate-400 uppercase">
                Select Prop Firm or Broker
              </label>
              {onOpenImportModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenImportModal();
                  }}
                  className="font-label-tech text-[10px] text-purple-300 hover:text-purple-200 underline"
                >
                  Import from MT5 Report File (.csv)
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {POPULAR_BROKERS.map((b) => (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => handleBrokerChange(b.name)}
                  className={`p-2.5 rounded-xl border font-label-numeric-sm text-xs font-semibold transition-all text-left truncate ${
                    broker === b.name
                      ? 'bg-purple-600/30 border-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                      : 'bg-white/[0.02] border-white/10 text-slate-300 hover:border-white/20'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          {/* Account Credentials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                MT5 Login / Account #
              </label>
              <input
                type="text"
                required
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="e.g. 884192"
                className="w-full bg-[#07090f] border border-white/10 rounded-xl px-3.5 py-2.5 font-label-numeric-md text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                MT5 Server
              </label>
              <input
                type="text"
                required
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="e.g. FundingPips-Server"
                className="w-full bg-[#07090f] border border-white/10 rounded-xl px-3.5 py-2.5 font-label-numeric-md text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                Investor / API Password (Optional)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Read-only investor password or token"
                className="w-full bg-[#07090f] border border-white/10 rounded-xl px-3.5 py-2.5 font-body-sm text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
                Evaluation Phase / Mode
              </label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="w-full bg-[#07090f] border border-white/10 rounded-xl px-3 py-2.5 font-body-sm text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="Phase 1">Phase 1 Evaluation</option>
                <option value="Phase 2">Phase 2 Evaluation</option>
                <option value="Funded Master">Funded Master</option>
                <option value="Personal Live">Personal Live Account</option>
              </select>
            </div>
          </div>

          {/* Account Balance & Risk Parameters */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <span className="font-label-tech text-[10px] text-purple-300 uppercase block mb-2 font-bold">
              Account Capital &amp; Risk Guardrail Specs
            </span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div>
                <label className="font-label-tech text-[9px] text-slate-400 uppercase block mb-1">
                  Starting Balance ($)
                </label>
                <input
                  type="number"
                  min="500"
                  step="500"
                  value={balance}
                  onChange={(e) => setBalance(Number(e.target.value))}
                  className="w-full bg-[#07090f] border border-white/10 rounded-lg px-2.5 py-1.5 font-label-numeric-sm text-xs text-white"
                />
              </div>
              <div>
                <label className="font-label-tech text-[9px] text-slate-400 uppercase block mb-1">
                  Target Profit (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="25"
                  step="0.5"
                  value={targetPct}
                  onChange={(e) => setTargetPct(Number(e.target.value))}
                  className="w-full bg-[#07090f] border border-white/10 rounded-lg px-2.5 py-1.5 font-label-numeric-sm text-xs text-emerald-400"
                />
              </div>
              <div>
                <label className="font-label-tech text-[9px] text-slate-400 uppercase block mb-1">
                  Daily DD Limit (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  step="0.5"
                  value={dailyLossPct}
                  onChange={(e) => setDailyLossPct(Number(e.target.value))}
                  className="w-full bg-[#07090f] border border-white/10 rounded-lg px-2.5 py-1.5 font-label-numeric-sm text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="font-label-tech text-[9px] text-slate-400 uppercase block mb-1">
                  Max DD Limit (%)
                </label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  step="0.5"
                  value={maxLossPct}
                  onChange={(e) => setMaxLossPct(Number(e.target.value))}
                  className="w-full bg-[#07090f] border border-white/10 rounded-lg px-2.5 py-1.5 font-label-numeric-sm text-xs text-rose-400"
                />
              </div>
            </div>
          </div>

          {/* Past Trade History Sync Option */}
          <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/25">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-purple-300">history</span>
                <span className="font-body-sm text-xs font-semibold text-white">
                  Existing Past Trades on this MT5 Account
                </span>
              </div>
              {onOpenImportModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenImportModal();
                  }}
                  className="font-label-tech text-[10px] text-cyan-300 hover:text-cyan-200 underline font-semibold"
                >
                  Import File (.csv/.html) instead
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { value: '0', label: '0 Trades', desc: 'Fresh 0-trade account' },
                { value: '5', label: '5 Deals', desc: 'Recent trading' },
                { value: '10', label: '10 Deals', desc: 'Active history' },
                { value: '15', label: '15 Deals', desc: 'Extended past data' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPastTradesOption(opt.value as any)}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    pastTradesOption === opt.value
                      ? 'bg-purple-600/30 border-purple-500/60 text-white'
                      : 'bg-white/[0.02] border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="font-label-tech text-xs font-bold block">{opt.label}</span>
                  <span className="font-body-sm text-[10px] text-slate-400 block mt-0.5">
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
            <span className="font-body-sm text-[11px] text-slate-400 block mt-2">
              {pastTradesOption === '0'
                ? 'Creates a clean account starting with a 0-trade history.'
                : `Simulates syncing ${pastTradesOption} closed deals from this account so past performance and drawdowns display immediately.`}
            </span>
          </div>

          {/* Bridge Protocol Selection */}
          <div>
            <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
              Select Connection Protocol
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProtocol('EA_WEBHOOK')}
                className={`p-2.5 rounded-xl border text-left flex flex-col ${
                  protocol === 'EA_WEBHOOK'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-white/[0.02] border-white/10 text-slate-400'
                }`}
              >
                <span className="font-label-tech text-xs font-bold">MT5 Expert Advisor (Webhook)</span>
                <span className="font-body-sm text-[11px] text-slate-400 mt-0.5">
                  Real-time EA sends tickets on order fill
                </span>
              </button>
              <button
                type="button"
                onClick={() => setProtocol('REST_GATEWAY')}
                className={`p-2.5 rounded-xl border text-left flex flex-col ${
                  protocol === 'REST_GATEWAY'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-white/[0.02] border-white/10 text-slate-400'
                }`}
              >
                <span className="font-label-tech text-xs font-bold">MetaAPI / LD4 REST</span>
                <span className="font-body-sm text-[11px] text-slate-400 mt-0.5">
                  Direct cloud connection to broker terminal
                </span>
              </button>
            </div>
          </div>

          {/* Webhook endpoint copy box */}
          <div className="p-3 rounded-xl bg-[#07090f] border border-white/10 flex items-center justify-between">
            <div className="flex flex-col truncate pr-2">
              <span className="font-label-tech text-[9px] text-slate-500 uppercase">
                Dedicated Bridge Webhook Endpoint
              </span>
              <span className="font-label-numeric-sm text-xs text-purple-300 truncate font-mono">
                https://api.novaterminal.io/v2/mt5/webhook/{loginId || 'YOUR_LOGIN'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyWebhook}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-label-tech text-[10px] shrink-0 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">
                {copied ? 'done' : 'content_copy'}
              </span>
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {connecting && (
            <div className="p-3 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-200 flex items-center gap-2.5 animate-pulse font-body-sm text-xs">
              <span className="material-symbols-outlined text-base animate-spin">refresh</span>
              <span>{statusMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              disabled={connecting}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-body-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={connecting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 text-white font-label-tech text-xs font-bold shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:brightness-110 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">link</span>
              <span>{connecting ? 'Connecting...' : 'Establish Live MT5 Link'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
