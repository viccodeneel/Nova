import React from 'react';

export type LinkState = 'CONNECTED' | 'STALE' | 'DISCONNECTED' | 'NONE';

const tone = (ok: boolean | 'warn') => (ok === true ? 'text-emerald-400' : ok === 'warn' ? 'text-amber-400' : 'text-slate-500');

// Every status row below reflects real state. Nothing here pretends the AI core exists yet.
export const AiScreen: React.FC<{ mt5: LinkState; name?: string }> = ({ mt5, name }) => {
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const rows: Array<[string, string, boolean | 'warn']> = [
    ['MT5 data link', mt5 === 'CONNECTED' ? 'LIVE' : mt5 === 'STALE' ? 'STALE' : mt5 === 'NONE' ? 'NO ACCOUNT' : 'OFFLINE', mt5 === 'CONNECTED' ? true : mt5 === 'STALE' ? 'warn' : false],
    ['Reasoning core', 'NOT INSTALLED', false],
    ['Voice interface', 'NOT INSTALLED', false],
    ['Market data feed', 'NOT CONNECTED', false],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="hud-panel relative flex min-h-[520px] sm:min-h-[560px] flex-col items-center justify-center overflow-hidden p-5 sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-cyan-400/10 to-transparent nova-scan" />
        <svg viewBox="0 0 400 400" className="w-full max-w-[420px]" role="img" aria-label="NOVA core, offline">
          <defs>
            <radialGradient id="core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#e0f2fe" /><stop offset="35%" stopColor="#38bdf8" /><stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g className="nova-spin-slow"><circle cx="200" cy="200" r="185" fill="none" stroke="#38bdf8" strokeOpacity=".35" strokeWidth="1" strokeDasharray="2 10" />
            {Array.from({ length: 36 }).map((_, i) => (<line key={i} x1="200" y1="10" x2="200" y2={i % 3 ? 18 : 28} stroke="#38bdf8" strokeOpacity=".6" transform={`rotate(${i * 10} 200 200)`} />))}</g>
          <g className="nova-spin-rev"><circle cx="200" cy="200" r="150" fill="none" stroke="#a78bfa" strokeOpacity=".55" strokeWidth="2" strokeDasharray="90 30 10 30" /></g>
          <g className="nova-spin-slow"><circle cx="200" cy="200" r="112" fill="none" stroke="#38bdf8" strokeOpacity=".5" strokeWidth="1.5" strokeDasharray="40 14" /></g>
          <circle cx="200" cy="200" r="78" fill="none" stroke="#38bdf8" strokeOpacity=".25" />
          <circle className="nova-breathe" cx="200" cy="200" r="64" fill="url(#core)" />
          <polygon points="200,168 227,184 227,216 200,232 173,216 173,184" fill="none" stroke="#e0f2fe" strokeOpacity=".8" />
        </svg>
        <p className="mt-4 font-label-tech text-xs uppercase tracking-[0.4em] text-cyan-300">NOVA · standby</p>
        <h1 className="mt-3 text-center text-2xl font-semibold text-white sm:text-3xl">{greeting}{name ? `, ${name}` : ''}</h1>
        <p className="mt-2 max-w-sm text-center text-sm text-slate-400">The AI core isn’t installed yet. This is the interface it will live in.</p>
        <div className="mt-8 flex w-full max-w-lg items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 opacity-60">
          <span className="material-symbols-outlined text-slate-500">mic_off</span>
          <input disabled placeholder="AI core not connected" className="w-full bg-transparent text-sm text-slate-400 outline-none" />
        </div>
      </section>
      <aside className="hud-panel p-5">
        <h2 className="font-label-tech text-[11px] uppercase tracking-[0.25em] text-cyan-300">System status</h2>
        <ul className="mt-4 divide-y divide-white/5">
          {rows.map(([k, v, ok]) => (
            <li key={k} className="flex items-center justify-between py-3 text-sm">
              <span className="text-slate-300">{k}</span>
              <span className={`font-label-tech text-[11px] font-semibold ${tone(ok)}`}>{v}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
};
