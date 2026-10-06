import React, { useRef, useState } from 'react';
import { ApiClient } from '../services/apiClient.ts';
import type { PropAccount } from '../data/terminalData.ts';

export interface Profile { display_name: string; avatar: string | null; currency: string; networth_goal: number | null }

async function toAvatar(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const size = 256, c = document.createElement('canvas'); c.width = c.height = size;
  const min = Math.min(bmp.width, bmp.height);
  c.getContext('2d')!.drawImage(bmp, (bmp.width - min) / 2, (bmp.height - min) / 2, min, min, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.8);
}

export const Avatar: React.FC<{ profile: Profile; className?: string }> = ({ profile, className = 'h-8 w-8 rounded-lg' }) =>
  profile.avatar
    ? <img src={profile.avatar} alt={profile.display_name} className={`${className} object-cover ring-1 ring-cyan-400/40`} />
    : <div className={`${className} flex items-center justify-center bg-gradient-to-br from-cyan-500 to-violet-600 text-xs font-bold text-white`}>{(profile.display_name || 'N').slice(0, 1).toUpperCase()}</div>;

const Card: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="hud-panel p-5 sm:p-6">
    <h2 className="text-base font-semibold text-white">{title}</h2>
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    <div className="mt-4">{children}</div>
  </section>
);
const inputCls = 'w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400';
const Msg: React.FC<{ m: { ok: boolean; t: string } | null }> = ({ m }) => m ? <p role={m.ok ? 'status' : 'alert'} className={`mt-3 text-sm ${m.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{m.t}</p> : null;

interface Props {
  profile: Profile; onProfileChange: (p: Profile) => void; accounts: PropAccount[];
  onDeleteAccount: (id: string) => void | Promise<void>; onConnect: () => void; onSignOut?: () => void;
}

export const SettingsPanel: React.FC<Props> = ({ profile, onProfileChange, accounts, onDeleteAccount, onConnect, onSignOut }) => {
  const [name, setName] = useState(profile.display_name);
  const [pm, setPm] = useState<{ ok: boolean; t: string } | null>(null);
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [nw2, setNw2] = useState('');
  const [sm, setSm] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const save = async (patch: object, ok: string) => {
    setBusy(true); setPm(null);
    try { onProfileChange(await ApiClient.updateProfile(patch)); setPm({ ok: true, t: ok }); }
    catch (e) { setPm({ ok: false, t: (e as Error).message }); } finally { setBusy(false); }
  };
  const pickImage = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return setPm({ ok: false, t: 'Choose an image file.' });
    try { await save({ avatar: await toAvatar(f) }, 'Profile picture updated.'); } catch { setPm({ ok: false, t: 'Could not read that image.' }); }
  };
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setSm(null);
    if (nw.length < 12) return setSm({ ok: false, t: 'New password must be at least 12 characters.' });
    if (nw !== nw2) return setSm({ ok: false, t: 'The new passwords do not match.' });
    setBusy(true);
    try { await ApiClient.changePassword(cur, nw); setCur(''); setNw(''); setNw2(''); setSm({ ok: true, t: 'Password changed. Use it next time you sign in.' }); }
    catch (er) { setSm({ ok: false, t: (er as Error).message }); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-10">
      <Card title="Profile" hint="Shown in the header and greeting.">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => file.current?.click()} aria-label="Change profile picture" className="group relative shrink-0">
            <Avatar profile={profile} className="h-20 w-20 rounded-2xl text-2xl" />
            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 opacity-0 transition group-hover:opacity-100"><span className="material-symbols-outlined text-white">photo_camera</span></span>
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="flex flex-col gap-1 text-sm">
            <button type="button" onClick={() => file.current?.click()} className="text-left text-cyan-300 hover:underline">Upload photo</button>
            {profile.avatar && <button type="button" onClick={() => void save({ avatar: null }, 'Profile picture removed.')} className="text-left text-slate-500 hover:text-rose-400">Remove</button>}
          </div>
        </div>
        <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void save({ display_name: name }, 'Name saved.'); }}>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Display name" placeholder="Display name" className={inputCls} />
          <button disabled={busy || !name.trim() || name.trim() === profile.display_name} className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-black transition disabled:opacity-40">Save</button>
        </form>
        <Msg m={pm} />
      </Card>

      <Card title="Preferences" hint="Currency is a display label for Net Worth. Values are not converted.">
        <select value={profile.currency} onChange={(e) => void save({ currency: e.target.value }, 'Currency saved.')} aria-label="Currency" className={inputCls}>
          {['USD', 'GHS', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}
        </select>
      </Card>

      <Card title="Password" hint="At least 12 characters. Other signed-in devices stay signed in until their session expires (12 hours).">
        <form onSubmit={changePw} className="flex flex-col gap-3">
          <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" className={inputCls} />
          <input type="password" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} placeholder="New password" className={inputCls} />
          <input type="password" autoComplete="new-password" value={nw2} onChange={(e) => setNw2(e.target.value)} placeholder="Confirm new password" className={inputCls} />
          <button disabled={busy || !cur || !nw || !nw2} className="rounded-xl bg-cyan-500 py-3 text-sm font-semibold text-black transition disabled:opacity-40">Change password</button>
        </form>
        <Msg m={sm} />
      </Card>

      <Card title="MT5 accounts" hint="Read-only connections. Removing an account deletes its synced positions and trades from NOVA, not from your broker.">
        {accounts.length === 0 && <p className="text-sm text-slate-500">No MT5 accounts connected.</p>}
        <ul className="divide-y divide-white/5">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <span className={`h-2 w-2 shrink-0 rounded-full ${a.connectionStatus === 'CONNECTED' ? 'bg-emerald-400' : a.connectionStatus === 'STALE' ? 'bg-amber-400' : 'bg-rose-400'}`} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{a.name}</span><span className="text-xs text-slate-500">{a.connectionStatus === 'CONNECTED' ? 'Connected' : a.connectionStatus === 'STALE' ? 'Data stale' : 'Disconnected'}</span></span>
              <button type="button" onClick={() => void onDeleteAccount(a.id)} className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-500/10">Remove</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onConnect} className="mt-3 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white transition hover:border-cyan-400">Connect an account</button>
      </Card>

      {onSignOut && <button type="button" onClick={onSignOut} className="rounded-xl border border-white/10 py-3 text-sm text-slate-300 transition hover:border-rose-400 hover:text-rose-300">Sign out</button>}
    </div>
  );
};
