import React, { useState } from 'react';

interface ConnectAccountScreenProps {
  onConnected: () => Promise<void> | void;
  onCancel?: () => void;
}

const CONNECTOR_URL = 'http://127.0.0.1:5001';

export const ConnectAccountScreen: React.FC<ConnectAccountScreenProps> = ({ onConnected, onCancel }) => {
  const [login, setLogin] = useState('');
  const [server, setServer] = useState('');
  const [investorPassword, setInvestorPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('Connecting to the local MT5 connector…');

    try {
      const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: Number(login), server: server.trim(), password: investorPassword }),
        signal: AbortSignal.timeout(30000),
        targetAddressSpace: 'loopback',
      } as RequestInit & { targetAddressSpace: 'loopback' };

      const response = await fetch(`${CONNECTOR_URL}/connect`, requestOptions);
      const contentType = response.headers.get('content-type') || '';
      const result = contentType.includes('application/json') ? await response.json() : {};
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'The local connector could not connect to MT5. Check that it is running.');
      }

      setInvestorPassword('');
      setMessage(`Connected to MT5 account ${result.account_number}. Loading account data…`);
      await onConnected();
    } catch (error) {
      const reason = (error as Error).message || '';
      setMessage(reason === 'Failed to fetch'
        ? 'Could not reach the local connector. Start it on this computer and allow the browser local-network permission.'
        : reason || 'Could not reach the local MT5 connector.');
    } finally {
      setInvestorPassword('');
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-[#11141e] p-6 sm:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">MT5 connection</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Connect a trading account</h1>
        <p className="mt-2 text-sm text-slate-400">
          Enter your MT5 login, broker server, and read-only Investor Password. The password is sent directly to the
          connector on this computer and is not saved by NOVA.
        </p>
        <p className="mt-2 text-xs text-slate-500">Keep the NOVA MT5 connector running. Your browser may ask permission to connect to this computer.</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={connect}>
        <label className="text-sm text-slate-300">
          MT5 account login
          <input
            required
            inputMode="numeric"
            autoComplete="off"
            value={login}
            onChange={(event) => setLogin(event.target.value.replace(/\D/g, ''))}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#08090d] px-3 py-2.5 text-white outline-none focus:border-purple-400"
            placeholder="Account number"
          />
        </label>
        <label className="text-sm text-slate-300">
          MT5 server
          <input
            required
            autoComplete="off"
            value={server}
            onChange={(event) => setServer(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#08090d] px-3 py-2.5 text-white outline-none focus:border-purple-400"
            placeholder="Broker server name shown in MetaTrader 5"
          />
        </label>
        <label className="text-sm text-slate-300">
          Investor Password
          <input
            required
            type="password"
            autoComplete="new-password"
            value={investorPassword}
            onChange={(event) => setInvestorPassword(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#08090d] px-3 py-2.5 text-white outline-none focus:border-purple-400"
            placeholder="Read-only password"
          />
        </label>

        {message && <p role="status" className="text-sm text-slate-300">{message}</p>}

        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy || !login || !server.trim() || !investorPassword}
            className="rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Connecting…' : 'Connect account'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="rounded-lg border border-white/15 px-5 py-2.5 text-sm text-slate-300">
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
};
