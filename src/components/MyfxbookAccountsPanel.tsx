import React from 'react';
import { RefreshCw, WalletCards } from 'lucide-react';
import { getMyfxbookLoadState, MyfxbookAccountsResponse, MyfxbookRequestError } from '../services/myfxbookAccounts';

interface Props {
  data: MyfxbookAccountsResponse | null;
  loading: boolean;
  error: MyfxbookRequestError | null;
  onRefresh: () => void;
}

function formatAmount(value: number | undefined, currency: string | undefined): string {
  if (value === undefined) return 'Unavailable';
  if (currency) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    } catch { /* Show the actual currency label separately when it is not a supported ISO code. */ }
  }
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;
}

function retrievedAt(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}

export const MyfxbookAccountsPanel: React.FC<Props> = ({ data, loading, error, onRefresh }) => {
  const state = getMyfxbookLoadState({ loading, error, data });

  return <section className="overview-panel min-w-0 p-4 sm:p-5" aria-labelledby="myfxbook-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="myfxbook-heading" className="font-headline-sm text-base font-semibold text-white">Myfxbook accounts</h2>
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-cyan-200">Myfxbook · Read only</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">Provider account data, shown separately from NOVA’s MT5 accounts.</p>
      </div>
      <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[.03] px-3 text-xs text-slate-200 transition hover:border-cyan-300/30 hover:text-white disabled:cursor-wait disabled:opacity-60" aria-label="Refresh Myfxbook accounts">
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>{loading ? 'Loading' : 'Refresh'}
      </button>
    </div>

    {error && data && <p role="status" className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[.04] px-3 py-2 text-xs text-amber-200">The latest refresh failed. Showing the last response retrieved by NOVA.</p>}
    {state === 'loading' && <div role="status" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><span className="sr-only">Loading Myfxbook accounts</span>{[0, 1].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl border border-white/[.07] bg-white/[.025]"/> )}</div>}
    {state === 'authentication-error' && <div role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[.04] p-4 text-sm text-amber-100"><strong className="block">NOVA sign-in required</strong><span className="mt-1 block text-xs text-amber-100/70">{error?.message || 'Sign in again to view Myfxbook accounts.'}</span></div>}
    {state === 'provider-error' && <div role="alert" className="mt-4 rounded-xl border border-rose-300/15 bg-rose-300/[.035] p-4 text-sm text-slate-200"><strong className="block">Myfxbook data is unavailable</strong><span className="mt-1 block text-xs text-slate-400">{error?.message || 'NOVA could not load provider data. Try refreshing.'}</span></div>}
    {state === 'empty' && <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-4"><WalletCards size={20} className="shrink-0 text-slate-500"/><p className="text-xs text-slate-400">No Myfxbook accounts were returned for this connection.</p></div>}
    {data && data.accounts.length > 0 && <>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.accounts.map((account) => <article key={account.id} className="min-w-0 rounded-xl border border-blue-200/[.09] bg-[#080c17]/70 p-4">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white" title={account.name || undefined}>{account.name || 'Myfxbook account'}</h3><p className="mt-1 truncate text-[10px] text-slate-500">{account.provider}{account.mtAccountNumber ? ` · ${account.mtAccountNumber}` : ''}</p></div>
            {typeof account.demo === 'boolean' && <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${account.demo ? 'border-slate-400/20 bg-slate-400/[.06] text-slate-300' : 'border-emerald-400/20 bg-emerald-400/[.06] text-emerald-200'}`}>{account.demo ? 'Demo' : 'Live'}</span>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[.12em] text-slate-500">Balance</p><p className="mt-1 truncate text-sm font-semibold tabular-nums text-white" title={formatAmount(account.balance, account.currency)}>{formatAmount(account.balance, account.currency)}</p></div>
            <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[.12em] text-slate-500">Equity</p><p className="mt-1 truncate text-sm font-semibold tabular-nums text-cyan-100" title={formatAmount(account.equity, account.currency)}>{formatAmount(account.equity, account.currency)}</p></div>
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/[.06] pt-3 text-[10px] text-slate-500">
            <span>{account.currency || 'Currency unavailable'}</span>{account.server && <><span aria-hidden="true">·</span><span className="max-w-full truncate">{account.server}</span></>}
          </div>
        </article>)}
      </div>
      <p className="mt-3 text-[10px] text-slate-500" title={data.timestampSemantics || undefined}>Retrieved by NOVA: {retrievedAt(data.fetchedAt)}</p>
    </>}
  </section>;
};
