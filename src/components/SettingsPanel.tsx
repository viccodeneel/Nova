import React, { useEffect, useRef, useState } from 'react';
import { loadPrefs, makeUtterance, pickDefaultVoice, savePrefs, whenVoicesReady } from '../voice/voicePrefs.ts';
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
  wake?: { supported: boolean; enabled: boolean; status: string; onChange: (on: boolean) => void };
}

const VoiceCard: React.FC = () => {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => { if (supported) void whenVoicesReady().then(setVoices); }, [supported]);
  const update = (next: typeof prefs) => { setPrefs(next); savePrefs(next); };
  const automatic = pickDefaultVoice(voices);
  const preview = () => {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(makeUtterance('Hello, this is how I sound. Tell me what you need.', prefs));
  };
  if (!supported) return <Card title="NOVA’s voice"><p className="text-sm text-slate-500">This browser can’t speak aloud. Try a recent Chrome or Edge.</p></Card>;
  return (
    <Card title="NOVA’s voice" hint="Browsers differ in their default voice, so pick one for NOVA and it will keep it. The list depends on your browser and device.">
      <select aria-label="Voice" value={prefs.voiceURI ?? ''} onChange={(e) => update({ ...prefs, voiceURI: e.target.value || null })} className={inputCls}>
        <option value="">Automatic{automatic ? ` (${automatic.name})` : ''}</option>
        {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}{v.localService ? '' : ' · online'}</option>)}
      </select>
      <label className="mt-4 flex items-center gap-3 text-sm text-slate-300">
        Speed
        <input type="range" min="0.7" max="1.4" step="0.05" value={prefs.rate} onChange={(e) => update({ ...prefs, rate: Number(e.target.value) })} className="flex-1 accent-cyan-400" aria-label="Speaking speed" />
        <span className="w-10 text-right tabular-nums text-slate-400">{prefs.rate.toFixed(2)}×</span>
      </label>
      <button type="button" onClick={preview} className="mt-4 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white transition hover:border-cyan-400">Preview voice</button>
    </Card>
  );
};

const MemoryCard: React.FC = () => {
  const [items, setItems] = useState<Array<{ id: string; kind: string; content: string }> | null>(null);
  const [err, setErr] = useState('');
  const load = () => ApiClient.listMemories().then((m) => { setItems(m); setErr(''); }).catch((e) => setErr((e as Error).message));
  useEffect(() => { void load(); }, []);
  return (
    <Card title="What NOVA remembers" hint="Only things you explicitly ask it to remember, like “remember that I only trade gold in the London session”. You can remove anything here.">
      {err && <p role="alert" className="text-sm text-rose-400">{err}</p>}
      {items === null && !err && <p className="text-sm text-slate-500">Loading…</p>}
      {items?.length === 0 && <p className="text-sm text-slate-500">Nothing stored yet.</p>}
      <ul className="divide-y divide-white/5">
        {items?.map((m) => (
          <li key={m.id} className="flex items-start gap-3 py-2.5">
            <span className="mt-0.5 rounded-md bg-white/5 px-2 py-0.5 font-label-tech text-[10px] uppercase text-slate-400">{m.kind}</span>
            <span className="flex-1 text-sm text-slate-200">{m.content}</span>
            <button type="button" aria-label="Forget this" onClick={() => void ApiClient.deleteMemory(m.id).then(load).catch((e) => setErr((e as Error).message))} className="text-slate-600 transition hover:text-rose-400"><span className="material-symbols-outlined text-[18px]">delete</span></button>
          </li>
        ))}
      </ul>
    </Card>
  );
};

export const SettingsPanel: React.FC<Props> = ({ profile, onProfileChange, accounts, onDeleteAccount, onConnect, onSignOut, wake }) => {
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

      {wake && (
        <Card title="Voice" hint="Say “Hey NOVA” on any tab and NOVA slides in from the right.">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm text-white">Wake word</span>
            <input type="checkbox" role="switch" checked={wake.enabled} disabled={!wake.supported} onChange={(e) => wake.onChange(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
          </label>
          <p className="mt-3 text-xs text-slate-500">
            {!wake.supported ? 'This browser does not support speech recognition. Use a recent Chrome or Edge.'
              : wake.status === 'blocked' ? 'Microphone access is blocked. Allow it in your browser settings, then switch this back on.'
              : wake.enabled ? 'Listening for “NOVA” while this tab is open.' : 'Off. NOVA only listens when you start a conversation.'}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
            While on, your browser keeps the microphone open and streams audio to its speech service (Google, for Chrome) to detect the wake word. It only works with this tab open, and it won’t work on a freshly loaded page until you click once.
          </p>
        </Card>
      )}

      <VoiceCard />
      <MemoryCard />

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
