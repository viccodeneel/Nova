import React, { useState } from 'react';
import { motion } from 'motion/react';
import type { NovaVoice } from '../voice/useNovaVoice.ts';
import type { NavSection } from '../data/terminalData.ts';
import type { LiveKitVoice } from '../voice/useLiveKitVoice.ts';

type OrbState = 'thinking' | 'connecting' | 'speaking' | 'listening' | 'ready' | 'standby' | 'error';
const LABEL: Record<OrbState, string> = { thinking: 'Thinking…', connecting: 'Connecting…', speaking: 'Speaking', listening: 'Listening', ready: 'Ready', standby: 'Standby', error: 'Disconnected' };
const RING: Record<OrbState, string> = { thinking: '#a78bfa', connecting: '#a78bfa', speaking: '#22d3ee', listening: '#34d399', ready: '#38bdf8', standby: '#64748b', error: '#fb7185' };

const Orb: React.FC<{ state: OrbState; size: number }> = ({ state, size }) => (
  <svg viewBox="0 0 400 400" width={size} height={size} aria-hidden="true">
    <defs><radialGradient id={`dock-core-${size}`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#e0f2fe" /><stop offset="40%" stopColor={RING[state]} /><stop offset="100%" stopColor="#7c3aed" stopOpacity="0" /></radialGradient></defs>
    <g className={state === 'thinking' ? 'nova-spin-fast' : 'nova-spin-slow'}><circle cx="200" cy="200" r="185" fill="none" stroke={RING[state]} strokeOpacity=".5" strokeWidth="2" strokeDasharray="2 10" /></g>
    <g className={state === 'thinking' ? 'nova-spin-fast' : 'nova-spin-rev'}><circle cx="200" cy="200" r="150" fill="none" stroke="#a78bfa" strokeOpacity=".6" strokeWidth="3" strokeDasharray="90 30 10 30" /></g>
    <circle cx="200" cy="200" r="112" fill="none" stroke={RING[state]} strokeOpacity=".4" strokeWidth="2" />
    <circle className="nova-breathe" cx="200" cy="200" r="78" fill={`url(#dock-core-${size})`} />
    <polygon points="200,168 227,184 227,216 200,232 173,216 173,184" fill="none" stroke="#e0f2fe" strokeOpacity=".85" strokeWidth="2" />
  </svg>
);

/** Right-side NOVA: a slim launcher that expands into a conversation panel on any tab except the NOVA screen itself. */
export const NovaOrbDock: React.FC<{ nova: NovaVoice; activeNav: NavSection; livekit: LiveKitVoice }> = ({ nova, activeNav, livekit }) => {
  const [text, setText] = useState('');
  const here = activeNav === 'ai';
  const open = nova.dockOpen && !here;
  const state: OrbState = livekit.phase === 'connecting' ? 'connecting' : livekit.phase === 'speaking' ? 'speaking' : livekit.active ? 'listening' : livekit.phase === 'error' ? 'error' : nova.busy ? 'thinking' : nova.voiceSpeaking ? 'speaking' : nova.listening ? 'listening' : nova.voiceConversation ? 'ready' : 'standby';
  const lastUser = [...nova.messages].reverse().find((m) => m.role === 'user');
  const lastNova = [...nova.messages].reverse().find((m) => m.role === 'nova' && m.text);
  const wakeOn = !livekit.active && nova.wakeEnabled && (nova.wakeStatus === 'listening' || nova.wakeStatus === 'paused');
  const tab = open ? 0 : -1;

  return (
    <>
      <button
        type="button"
        aria-label="Open NOVA"
        onClick={nova.openDock}
        className={`fixed bottom-20 right-3 z-[54] flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/30 bg-[#0a0c13]/90 backdrop-blur-xl transition-all duration-500 hover:scale-110 hover:border-cyan-300 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 ${open || here ? 'pointer-events-none translate-x-8 opacity-0' : 'opacity-90'} ${wakeOn || livekit.active ? 'shadow-[0_0_24px_rgba(34,211,238,.35)]' : ''}`}
      >
        <Orb state={wakeOn ? 'listening' : 'standby'} size={36} />
      </button>

      <aside
        aria-label="NOVA conversation"
        aria-hidden={!open}
        className={`fixed bottom-24 right-3 z-[55] max-h-[calc(100svh-7rem)] w-[min(92vw,300px)] overflow-y-auto transition-[transform,opacity,filter] duration-500 ease-[cubic-bezier(.22,1,.36,1)] sm:bottom-auto sm:right-6 sm:top-1/2 sm:-translate-y-1/2 ${open ? 'translate-x-0 opacity-100 blur-0' : 'pointer-events-none translate-x-[125%] opacity-0 blur-sm'}`}
      >
        <div className="hud-panel p-4 shadow-[0_0_60px_rgba(34,211,238,.12)]">
          <div className="flex items-center justify-between">
            <span className="font-label-tech text-[10px] uppercase tracking-[0.3em] text-cyan-300">NOVA</span>
            <span className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-slate-400" style={{ color: RING[state] }}>{LABEL[state]}</span>
              <button type="button" tabIndex={tab} aria-label="Close NOVA" onClick={nova.closeDock} className="text-slate-500 transition hover:text-white"><span className="material-symbols-outlined text-[18px]">close</span></button>
            </span>
          </div>

          <motion.button
            type="button"
            tabIndex={tab}
            onClick={() => { if (livekit.active) void livekit.disconnect(); else nova.handleOrbClick(); }}
            aria-label={livekit.active ? 'Disconnect LiveKit voice' : nova.voiceConversation ? (nova.voiceSpeaking ? 'Interrupt NOVA' : 'End voice conversation') : 'Start browser voice conversation'}
            animate={{ scale: state === 'speaking' ? [1, 1 + nova.voicePulse, 1] : state === 'listening' ? [1, 1.03, 1] : 1 }}
            transition={{ duration: state === 'speaking' ? 0.18 : 1.8, ease: 'easeOut', repeat: state === 'listening' ? Infinity : 0 }}
            className="mx-auto mt-2 flex cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <Orb state={state} size={150} />
          </motion.button>

          <p className="mt-1 min-h-[1.25rem] text-center text-[11px] text-slate-400" aria-live="polite">{nova.voiceFeedback}</p>

          <div className="mt-3 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.03] p-3">
            <p className="font-label-tech text-[9px] uppercase tracking-[0.2em] text-cyan-300">LiveKit voice · {livekit.phase}</p>
            <p role="status" aria-live="polite" className="mt-1 text-[10px] leading-relaxed text-slate-400">{livekit.error || livekit.message}</p>
            {livekit.audioNeedsActivation && <button type="button" onClick={() => void livekit.enableAudio()} className="mt-2 w-full rounded-lg border border-amber-300/20 px-3 py-2 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-300/10">Enable NOVA audio</button>}
            {livekit.active
              ? <button type="button" onClick={() => void livekit.disconnect()} className="mt-2 w-full rounded-lg border border-rose-400/20 px-3 py-2 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-400/10">Disconnect LiveKit voice</button>
              : <button type="button" disabled={!livekit.available || livekit.phase === 'connecting'} onClick={() => void livekit.connect()} className="mt-2 w-full rounded-lg border border-cyan-400/20 px-3 py-2 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40">{livekit.phase === 'connecting' ? 'Connecting…' : livekit.phase === 'error' ? 'Try LiveKit again' : 'Connect LiveKit voice'}</button>}
            {!livekit.active && <button type="button" disabled={!nova.voiceConversationSupported} onClick={nova.startVoiceConversation} className="mt-2 w-full rounded-lg border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">Start browser voice fallback</button>}
          </div>

          {(lastUser || lastNova) && (
            <div className="mt-3 max-h-36 space-y-2 overflow-y-auto rounded-xl border border-white/5 bg-black/30 p-3 text-xs">
              {lastUser && <p className="text-slate-400"><span className="text-slate-500">You: </span>{lastUser.text}</p>}
              {lastNova && <p className="text-slate-100"><span className="text-cyan-300">NOVA: </span>{lastNova.text}</p>}
            </div>
          )}
          {nova.error && <p role="alert" className="mt-2 text-[11px] text-rose-300">{nova.error}</p>}

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t || nova.busy) return; setText(''); void nova.sendText(t); }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} tabIndex={tab} maxLength={2000} aria-label="Message NOVA" placeholder="Type to NOVA…" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400" />
            <button tabIndex={tab} disabled={nova.busy || !text.trim()} className="rounded-lg bg-cyan-500 px-3 text-xs font-semibold text-black disabled:opacity-40">Send</button>
          </form>
          <p className="mt-2 text-center text-[10px] text-slate-600">{livekit.active ? 'Wake phrase paused while LiveKit uses the microphone.' : wakeOn ? 'Browser wake phrase is listening.' : 'Browser voice is available on this device.'}</p>
        </div>
      </aside>
    </>
  );
};
