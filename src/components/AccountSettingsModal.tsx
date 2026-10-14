import React, { useEffect, useState } from 'react';
import type { AccountClassification, ChallengeStage, ChallengeType, PropAccount } from '../data/terminalData';

type FormState = {
  account_name: string;
  starting_balance: string;
  classification: AccountClassification;
  notes: string;
  prop_firm_name: string;
  type: ChallengeType | '';
  stage: ChallengeStage | '';
  fee: string;
  size: string;
  phase1_target_percent: string;
  phase2_target_percent: string;
  daily_drawdown_percent: string;
  max_drawdown_percent: string;
  minimum_trading_days: string;
};

const inputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-[#090d18] px-3 py-2.5 text-sm text-white outline-none transition focus:border-violet-400/60';
const labelClass = 'block text-xs font-medium text-slate-300';
const emptyForm = (account: PropAccount): FormState => ({
  account_name: account.name,
  starting_balance: account.accountSettings?.starting_balance?.toString() || '',
  classification: account.classification || 'PROP_FIRM',
  notes: account.accountSettings?.notes || '',
  prop_firm_name: account.accountSettings?.prop_firm_name || '',
  type: account.accountSettings?.challenge?.type || '',
  stage: account.accountSettings?.challenge?.stage || '',
  fee: account.accountSettings?.challenge?.fee?.toString() || '',
  size: account.accountSettings?.challenge?.size?.toString() || '',
  phase1_target_percent: account.accountSettings?.challenge?.phase1_target_percent?.toString() || '',
  phase2_target_percent: account.accountSettings?.challenge?.phase2_target_percent?.toString() || '',
  daily_drawdown_percent: account.accountSettings?.challenge?.daily_drawdown_percent?.toString() || '',
  max_drawdown_percent: account.accountSettings?.challenge?.max_drawdown_percent?.toString() || '',
  minimum_trading_days: account.accountSettings?.challenge?.minimum_trading_days?.toString() || '',
});

interface Props {
  account: PropAccount;
  onClose: () => void;
  onSave: (accountId: string, payload: { account_name: string; account_settings: Record<string, unknown> }) => Promise<void>;
}

export const AccountSettingsModal: React.FC<Props> = ({ account, onClose, onSave }) => {
  const [form, setForm] = useState(() => emptyForm(account));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(emptyForm(account)), [account]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const canBeLive = account.connectionMode ? account.connectionMode === 'REAL' : account.accountType === 'live_personal';
  const canBeDemo = account.connectionMode ? account.connectionMode === 'DEMO' : account.accountType === 'demo';
  const stageOptions: ChallengeStage[] = form.type === 'INSTANT_FUNDING'
    ? ['INSTANT_FUNDED', 'FUNDED']
    : form.type === 'TWO_STEP'
      ? ['PHASE_1', 'PHASE_2', 'FUNDED', 'EVALUATION']
      : form.type === 'ONE_STEP'
        ? ['PHASE_1', 'FUNDED', 'EVALUATION']
        : ['PHASE_1', 'PHASE_2', 'FUNDED', 'INSTANT_FUNDED', 'EVALUATION'];

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.account_name.trim()) return setError('Account name is required.');
    const numberOrNull = (raw: string) => raw.trim() === '' ? null : Number(raw);
    const values: Record<string, number | null> = {
      fee: numberOrNull(form.fee), size: numberOrNull(form.size),
      phase1_target_percent: numberOrNull(form.phase1_target_percent),
      phase2_target_percent: numberOrNull(form.phase2_target_percent),
      daily_drawdown_percent: numberOrNull(form.daily_drawdown_percent),
      max_drawdown_percent: numberOrNull(form.max_drawdown_percent),
      minimum_trading_days: numberOrNull(form.minimum_trading_days),
    };
    for (const [name, value] of Object.entries(values)) {
      if (value !== null && !Number.isFinite(value)) return setError(`${name.replaceAll('_', ' ')} must be a valid number.`);
    }
    if (form.type === 'TWO_STEP' && values.phase2_target_percent === null) return setError('Add the Phase 2 target for a two-step challenge.');
    if (form.type === 'INSTANT_FUNDING' && ['PHASE_1', 'PHASE_2'].includes(form.stage)) return setError('Instant funding does not use evaluation phases.');
    const manualStartingBalance = form.starting_balance.trim() ? Number(form.starting_balance) : null;
    if (manualStartingBalance !== null && (!Number.isFinite(manualStartingBalance) || manualStartingBalance <= 0 || manualStartingBalance > 1_000_000_000_000)) return setError('Starting balance must be a positive valid amount.');
    setSaving(true);
    try {
      await onSave(account.id, {
        account_name: form.account_name.trim(),
        account_settings: {
          classification: form.classification,
          notes: form.notes.trim() || null,
          prop_firm_name: form.prop_firm_name.trim() || null,
          challenge: {
            type: form.type || null, stage: form.stage || null,
            ...values,
          },
          ...(account.source === 'MYFXBOOK' ? { starting_balance: manualStartingBalance } : {}),
        },
      });
      onClose();
    } catch (saveError) {
      setError((saveError as Error).message || 'Could not save account settings.');
    } finally {
      setSaving(false);
    }
  };

  const numberInput = (title: string, key: keyof FormState, suffix?: string, max = 1_000_000_000) => (
    <label className={labelClass}>{title}
      <span className="relative block"><input className={`${inputClass} pr-10`} type="number" min="0" max={max} step="any" value={form[key]} onChange={(event) => set(key, event.target.value)} /><span className="absolute right-3 top-3 text-xs text-slate-500">{suffix}</span></span>
    </label>
  );

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form onSubmit={(event) => void save(event)} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-blue-300/15 bg-[#0b1020] p-5 shadow-2xl sm:p-7" aria-label={`Edit ${account.name}`}>
      <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.2em] text-violet-300">Account configuration</p><h2 className="mt-1 text-xl font-semibold text-white">Edit account</h2><p className="mt-1 text-xs text-slate-400">NOVA-only settings persist separately. Provider identity and broker-reported financial data stay read-only.</p></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border border-white/10 px-3 py-2 text-slate-400 hover:text-white">×</button></div>
      <div className="space-y-5">
        <section className="rounded-xl border border-white/[.08] bg-white/[.02] p-4"><h3 className="mb-3 text-sm font-semibold text-white">Account identity</h3><div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>Display name<input className={inputClass} maxLength={100} value={form.account_name} onChange={(event) => set('account_name', event.target.value)} /></label>
          <label className={labelClass}>Classification<select className={inputClass} value={form.classification} onChange={(event) => set('classification', event.target.value as AccountClassification)}><option value="PROP_FIRM">Prop Firm</option><option value="LIVE_BROKERAGE" disabled={!canBeLive}>Live Brokerage{!canBeLive ? ' · MT5 has not confirmed real mode' : ''}</option><option value="DEMO" disabled={!canBeDemo}>Demo{!canBeDemo ? ' · MT5 has not confirmed demo mode' : ''}</option></select></label>
          {form.classification === 'PROP_FIRM' && <label className={labelClass}>Prop firm name<input className={inputClass} maxLength={100} value={form.prop_firm_name} onChange={(event) => set('prop_firm_name', event.target.value)} placeholder="Name shown for this challenge" /></label>}
          <div className="rounded-lg border border-white/[.06] bg-black/15 p-3 text-xs text-slate-400"><strong className="text-slate-200">Provider data</strong><p className="mt-1">{account.provider || 'Provider unavailable'} · {account.currency || 'Currency unavailable'} · {account.connectionStatus || 'Status unavailable'}</p><p className="mt-1">Provider ID, connection type, broker-reported balance, equity and imported history cannot be changed here.</p></div>
          {account.source === 'MYFXBOOK' && <label className={labelClass}>Manual starting balance
            <span className="relative block"><input className={`${inputClass} pr-14`} type="number" min="0.01" max="1000000000000" step="any" value={form.starting_balance} onChange={(event) => set('starting_balance', event.target.value)} /><span className="absolute right-3 top-3 text-xs text-slate-500">{account.currency || 'currency'}</span></span>
            <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">Myfxbook exposes only the latest 50 history transactions, so NOVA cannot verify which deposit was the original funding event. This value is your manual reference and never changes broker data.</span>
          </label>}
          <label className={`${labelClass} sm:col-span-2`}>Personal notes<textarea className={`${inputClass} min-h-20 resize-y`} maxLength={1000} value={form.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Optional label or notes for this account" /></label>
        </div></section>
        {form.classification === 'PROP_FIRM' && <section className="rounded-xl border border-violet-400/15 bg-violet-400/[.025] p-4"><div className="mb-1"><h3 className="text-sm font-semibold text-white">Challenge configuration</h3><p className="mt-1 text-[11px] text-slate-400">These are your configured reference values, not verified rules or automated risk enforcement. A target percentage is relative to the challenge size below.</p></div>
          <div className="grid gap-3 pt-3 sm:grid-cols-2">
            <label className={labelClass}>Challenge type<select className={inputClass} value={form.type} onChange={(event) => {
              const type = event.target.value as ChallengeType | '';
              const allowed: ChallengeStage[] = type === 'INSTANT_FUNDING' ? ['INSTANT_FUNDED', 'FUNDED'] : type === 'TWO_STEP' ? ['PHASE_1', 'PHASE_2', 'FUNDED', 'EVALUATION'] : ['PHASE_1', 'FUNDED', 'EVALUATION'];
              setForm((current) => ({ ...current, type, stage: current.stage && allowed.includes(current.stage) ? current.stage : type === 'INSTANT_FUNDING' ? 'INSTANT_FUNDED' : 'PHASE_1' }));
            }}><option value="">Not configured</option><option value="ONE_STEP">One-Step Challenge</option><option value="TWO_STEP">Two-Step Challenge</option><option value="INSTANT_FUNDING">Instant Funding / Instant Funded</option></select></label>
            <label className={labelClass}>Current stage<select className={inputClass} value={form.stage} onChange={(event) => set('stage', event.target.value as ChallengeStage | '')}><option value="">Not configured</option>{stageOptions.map((stage) => <option key={stage} value={stage}>{stage.replaceAll('_', ' ')}</option>)}</select></label>
            {numberInput('Challenge purchase fee', 'fee', account.currency || 'currency')}
            {numberInput('Challenge size', 'size', account.currency || 'currency')}
            {form.type !== 'INSTANT_FUNDING' && numberInput(form.type === 'ONE_STEP' ? 'Challenge target' : 'Phase 1 target', 'phase1_target_percent', '%', 100)}
            {form.type === 'TWO_STEP' && numberInput('Phase 2 target', 'phase2_target_percent', '%', 100)}
            {numberInput('Daily drawdown limit', 'daily_drawdown_percent', '%', 100)}
            {numberInput('Maximum overall drawdown', 'max_drawdown_percent', '%', 100)}
            {form.type !== 'INSTANT_FUNDING' && numberInput('Minimum trading days (optional)', 'minimum_trading_days', 'days', 365)}
          </div>
        </section>}
        {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        <div className="flex flex-col-reverse justify-between gap-3 border-t border-white/[.08] pt-4 sm:flex-row"><button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save Changes'}</button></div>
      </div>
    </form>
  </div>;
};
