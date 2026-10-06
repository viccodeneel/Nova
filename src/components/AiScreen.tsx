import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { motion } from 'motion/react';
import { ApiClient } from '../services/apiClient.ts';
import { createSpeechRecognition, isSpeechRecognitionSupported } from '../services/speechRecognition.ts';
import type { SpeechRecognitionErrorEventLike } from '../services/speechRecognition.ts';
import type { NavSection } from '../data/terminalData.ts';

export type LinkState = 'CONNECTED' | 'STALE' | 'DISCONNECTED' | 'NONE';

const tone = (ok: boolean | 'warn') => (ok === true ? 'text-emerald-400' : ok === 'warn' ? 'text-amber-400' : 'text-slate-500');
type AccountSnapshot = NonNullable<Awaited<ReturnType<typeof ApiClient.askAi>>['account']>;
type ChatMessage = { role: 'user' | 'nova'; text: string; account?: AccountSnapshot };

const speechErrorMessage = (event: SpeechRecognitionErrorEventLike): string => {
  switch (event.error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was blocked. Allow microphone access for NOVA in your browser settings.';
    case 'audio-capture':
      return 'No microphone was found. Connect or enable a microphone and try again.';
    case 'no-speech':
      return 'No speech was detected. Try speaking a little closer to the microphone.';
    case 'network':
      return 'The browser speech service could not be reached. Check your connection and try again.';
    default:
      return 'Voice input stopped unexpectedly. Please try again.';
  }
};

// Every status row below reflects real state. Nothing here pretends the AI core exists yet.
export const AiScreen: React.FC<{ mt5: LinkState; name?: string; activeAccountId?: string; onNavigate?: (page: NavSection) => void }> = ({ mt5, name, activeAccountId, onNavigate }) => {
  const h = new Date().getHours();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState('');
  const [voiceConversation, setVoiceConversation] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [voicePulse, setVoicePulse] = useState(0);
  const [voicePulseSequence, setVoicePulseSequence] = useState(0);
  const voiceSpeakingRef = useRef(false);
  const spokenTextRef = useRef('');
  const spokenCharIndexRef = useRef(0);
  const voicePulseTimeoutRef = useRef<number | null>(null);
  const voiceConversationRef = useRef(false);
  const waitingForReplyRef = useRef(false);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition>>(null);
  const speechHadResultRef = useRef(false);
  const speechHadErrorRef = useRef(false);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const pendingNavigationRef = useRef<NavSection | null>(null);
  const chatStarted = messages.length > 0;
  useEffect(() => { conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);
  const speechSupported = isSpeechRecognitionSupported();
  const speechOutputSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const voiceConversationSupported = speechSupported && speechOutputSupported;
  useEffect(() => { let live = true; ApiClient.getAiStatus().then((v) => { if (live) setAiReady(v.enabled); }).catch(() => { if (live) setAiReady(false); }); return () => { live = false; }; }, []);
  useEffect(() => () => { voiceConversationRef.current = false; recognitionRef.current?.abort(); recognitionRef.current = null; if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);
  const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const rows: Array<[string, string, boolean | 'warn']> = [
    ['MT5 data link', mt5 === 'CONNECTED' ? 'LIVE' : mt5 === 'STALE' ? 'STALE' : mt5 === 'NONE' ? 'NO ACCOUNT' : 'OFFLINE', mt5 === 'CONNECTED' ? true : mt5 === 'STALE' ? 'warn' : false],
    ['Reasoning core', aiReady === null ? 'CHECKING' : aiReady ? 'CONFIGURED' : 'NOT CONFIGURED', aiReady === true],
    ['Voice chat', !voiceConversationSupported ? 'UNSUPPORTED' : voiceConversation ? (listening ? 'LISTENING' : 'ACTIVE') : 'READY', voiceConversation ? 'warn' : voiceConversationSupported],
    ['Market data feed', 'NOT CONNECTED', false],
  ];
  const isNovaSpeechEcho = (transcript: string): boolean => {
    const normalized = transcript.toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();
    if (normalized.length < 5) return false;
    const start = Math.max(0, spokenCharIndexRef.current - 70);
    const spokenWindow = spokenTextRef.current.slice(start, spokenCharIndexRef.current + 190).toLowerCase().replace(/[^a-z0-9']+/g, ' ');
    if (spokenWindow.includes(normalized)) return true;
    const words = normalized.split(/\s+/).filter((word) => word.length > 2);
    if (words.length < 3) return false;
    const matched = words.filter((word) => spokenWindow.includes(word)).length;
    return matched / words.length >= 0.78;
  };

  const toggleListening = (monitorNovaSpeech = false) => {
    const activeRecognition = recognitionRef.current;
    if (activeRecognition) {
      activeRecognition.stop();
      return;
    }

    const recognition = createSpeechRecognition();
    if (!recognition) {
      setVoiceFeedback('Voice input is not supported in this browser. Try a recent version of Chrome or Edge.');
      return;
    }

    speechHadResultRef.current = false;
    speechHadErrorRef.current = false;
    setVoiceFeedback('');
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = monitorNovaSpeech;
    recognition.interimResults = monitorNovaSpeech;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let transcript = '';
      let hasFinalResult = !monitorNovaSpeech;
      const firstResult = event.resultIndex ?? 0;
      for (let index = firstResult; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript || '';
        if (event.results[index]?.isFinal) hasFinalResult = true;
      }
      const cleanTranscript = transcript.trim();
      if (!cleanTranscript) return;

      if (monitorNovaSpeech && voiceConversationRef.current) {
        if (voiceSpeakingRef.current && isNovaSpeechEcho(cleanTranscript)) return;
        if (voiceSpeakingRef.current) {
          pendingNavigationRef.current = null;
          voiceSpeakingRef.current = false;
          setVoiceSpeaking(false);
          setVoicePulse(0);
          waitingForReplyRef.current = false;
          window.speechSynthesis.cancel();
          setVoiceFeedback('I hear you — go ahead.');
        }
        if (!hasFinalResult) return;
        speechHadResultRef.current = true;
        waitingForReplyRef.current = true;
        setVoiceFeedback('NOVA is preparing a reply…');
        recognition.stop();
        void submitMessage(cleanTranscript, true);
        return;
      }

      if (!hasFinalResult) return;
      speechHadResultRef.current = true;
      setInput((current) => {
        const existing = current.trim();
        const separator = existing ? ' ' : '';
        const remaining = Math.max(0, 2000 - existing.length - separator.length);
        return [existing, cleanTranscript.slice(0, remaining)].filter(Boolean).join(separator);
      });
      if (voiceConversationRef.current) {
        waitingForReplyRef.current = true;
        setVoiceFeedback('NOVA is preparing a reply…');
        void submitMessage(cleanTranscript, true);
      } else {
        setVoiceFeedback('Transcript ready. Review it, then press Ask.');
      }
    };
    recognition.onerror = (event) => {
      speechHadErrorRef.current = true;
      setVoiceFeedback(speechErrorMessage(event));
    };
    recognition.onend = () => {
      setListening(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (!speechHadResultRef.current && !speechHadErrorRef.current) {
        setVoiceFeedback(voiceConversationRef.current ? 'Listening again…' : 'No speech was detected. Try again when you’re ready.');
      }
      if (voiceConversationRef.current && !waitingForReplyRef.current) {
        if (speechHadErrorRef.current) {
          voiceConversationRef.current = false;
          setVoiceConversation(false);
          return;
        }
        window.setTimeout(() => { if (voiceConversationRef.current) toggleListening(voiceSpeakingRef.current); }, 350);
      }
    };
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setVoiceFeedback('Voice input could not start. Check microphone access and try again.');
    }
  };

  const finishVoiceTurn = () => {
    if (!waitingForReplyRef.current) return;
    waitingForReplyRef.current = false;
    voiceSpeakingRef.current = false;
    setVoiceSpeaking(false);
    setVoicePulse(0);
    if (voicePulseTimeoutRef.current !== null) window.clearTimeout(voicePulseTimeoutRef.current);
    if (!voiceConversationRef.current) return;
    const pendingPage = pendingNavigationRef.current;
    if (pendingPage) {
      pendingNavigationRef.current = null;
      voiceConversationRef.current = false;
      setVoiceConversation(false);
      onNavigate?.(pendingPage);
      return;
    }
    setVoiceFeedback('Listening for your next message…');
    if (recognitionRef.current) return;
    window.setTimeout(() => { if (voiceConversationRef.current) toggleListening(); }, 350);
  };

  const speakResponse = (text: string) => {
    if (!voiceConversationRef.current || !speechOutputSupported) return;
    window.speechSynthesis.cancel();
    spokenTextRef.current = text;
    spokenCharIndexRef.current = 0;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || 'en-US';
    utterance.onstart = () => {
      voiceSpeakingRef.current = true;
      setVoiceSpeaking(true);
      setVoiceFeedback('NOVA is speaking — speak over me to interrupt.');
      if (!recognitionRef.current) toggleListening(true);
    };
    utterance.onboundary = (event) => {
      spokenCharIndexRef.current = event.charIndex;
      const word = text.slice(event.charIndex).match(/^[A-Za-z0-9']+/)?.[0] || '';
      const pulse = Math.min(0.14, 0.04 + word.length * 0.009);
      setVoicePulse(pulse + (voicePulseSequence % 2) * 0.008);
      setVoicePulseSequence((count) => count + 1);
      if (voicePulseTimeoutRef.current !== null) window.clearTimeout(voicePulseTimeoutRef.current);
      voicePulseTimeoutRef.current = window.setTimeout(() => setVoicePulse(0), 170);
    };
    utterance.onend = finishVoiceTurn;
    utterance.onerror = finishVoiceTurn;
    window.speechSynthesis.speak(utterance);
  };

  const submitMessage = async (text: string, speak: boolean) => {
    if (!text || busy) { waitingForReplyRef.current = false; return; }
    setMessages((old) => [...old, { role: 'user', text }, ...(!speak ? [{ role: 'nova' as const, text: '' }] : [])]);
    setInput('');
    setError('');
    setBusy(true);
    const onChunk = speak ? undefined : (chunk: string) => {
      setMessages((old) => {
        const lastAssistant = old.reduce((last, message, index) => message.role === 'nova' ? index : last, -1);
        if (lastAssistant < 0) return [...old, { role: 'nova', text: chunk }];
        return old.map((message, index) => index === lastAssistant ? { ...message, text: message.text + chunk } : message);
      });
    };
    try {
      const result = await ApiClient.askAi(text, activeAccountId, onChunk);
      setMessages((old) => {
        if (speak) return [...old, { role: 'nova', text: result.response, account: result.account || undefined }];
        const lastAssistant = old.reduce((last, message, index) => message.role === 'nova' ? index : last, -1);
        if (lastAssistant < 0) return [...old, { role: 'nova', text: result.response, account: result.account || undefined }];
        return old.map((message, index) => index === lastAssistant ? { ...message, text: result.response, account: result.account || undefined } : message);
      });
      if (result.navigation) {
        if (speak) {
          pendingNavigationRef.current = result.navigation.page;
          speakResponse(result.response);
        } else {
          setVoiceFeedback(`Opening ${result.navigation.label}…`);
          window.setTimeout(() => onNavigate?.(result.navigation.page), 900);
        }
      } else if (speak) {
        speakResponse(result.response);
      }
    } catch (e) {
      setMessages((old) => old.filter((message, index) => !(index === old.length - 1 && message.role === 'nova' && !message.text)));
      setError((e as Error).message);
      if (speak) speakResponse('Sorry, I could not get a reply just now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || listening) return;
    await submitMessage(text, false);
  };

  const startVoiceConversation = () => {
    if (!voiceConversationSupported) {
      setVoiceFeedback('Voice conversations need speech recognition and speech playback. Try the latest Chrome or Edge.');
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
      setListening(false);
    }
    waitingForReplyRef.current = false;
    voiceConversationRef.current = true;
    setVoiceConversation(true);
    setVoiceFeedback('Voice chat started. Speak naturally; NOVA will answer aloud.');
    toggleListening();
  };

  const stopVoiceConversation = () => {
    voiceConversationRef.current = false;
    pendingNavigationRef.current = null;
    voiceSpeakingRef.current = false;
    setVoiceSpeaking(false);
    setVoicePulse(0);
    if (voicePulseTimeoutRef.current !== null) window.clearTimeout(voicePulseTimeoutRef.current);
    waitingForReplyRef.current = false;
    setVoiceConversation(false);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
    window.speechSynthesis?.cancel();
    setVoiceFeedback('Voice conversation ended.');
  };

  const handleOrbClick = () => {
    if (!voiceConversationRef.current) {
      startVoiceConversation();
      return;
    }
    if (voiceSpeakingRef.current) {
      pendingNavigationRef.current = null;
      waitingForReplyRef.current = false;
      voiceSpeakingRef.current = false;
      setVoiceSpeaking(false);
      setVoicePulse(0);
      window.speechSynthesis.cancel();
      setVoiceFeedback('Interrupted. Listening — go ahead.');
      if (!recognitionRef.current) toggleListening();
      return;
    }
    stopVoiceConversation();
  };

  return (
    <div className={`grid gap-4 sm:gap-6 ${voiceConversation ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_340px]'}`}>
      <motion.section
        layout
        transition={{ layout: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } }}
        className={`hud-panel relative flex min-h-[min(78svh,680px)] overflow-hidden p-4 sm:min-h-[680px] sm:p-8 ${voiceConversation ? 'flex-col items-center justify-center' : chatStarted ? 'flex-row items-stretch gap-3 sm:gap-6' : 'flex-col items-center justify-center'}`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-cyan-400/10 to-transparent nova-scan" />
        <motion.button
          type="button"
          layout
          onClick={handleOrbClick}
          aria-label={voiceConversation ? voiceSpeaking ? 'Interrupt NOVA' : listening ? 'End voice conversation' : 'Return to text chat' : 'Start a voice conversation with NOVA'}
          aria-pressed={voiceConversation}
          animate={{ scale: voiceConversation && voiceSpeaking ? [1, 1 + voicePulse, 1] : voiceConversation && listening ? [1, 0.99, 1.018, 1] : 1 }}
          transition={{ layout: { duration: 0.65, ease: [0.22, 1, 0.36, 1] }, scale: { duration: voiceSpeaking ? 0.18 : 2, ease: 'easeOut', repeat: voiceConversation && listening && !voiceSpeaking ? Infinity : 0 } }}
          className={`relative z-10 flex shrink-0 cursor-pointer flex-col items-center border-0 bg-transparent p-0 outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-cyan-300 ${voiceConversation ? 'w-[min(78vw,520px)] max-w-full' : chatStarted ? 'w-[60px] pt-2 sm:w-[104px] sm:pt-4' : 'w-full max-w-[420px]'}`}
        >
          <svg viewBox="0 0 400 400" className="w-full" aria-hidden="true">
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
          {voiceConversation
            ? <p className="mt-3 text-center font-label-tech text-[10px] uppercase tracking-[0.2em] text-cyan-300 sm:text-xs">NOVA · voice</p>
            : chatStarted
              ? <p className="mt-2 text-center font-label-tech text-[9px] uppercase tracking-[0.18em] text-cyan-300 sm:text-[10px]">NOVA</p>
              : <>
                <p className="mt-4 font-label-tech text-xs uppercase tracking-[0.4em] text-cyan-300">NOVA · standby</p>
                <h1 className="mt-3 text-center text-2xl font-semibold text-white sm:text-3xl">{greeting}{name ? `, ${name}` : ''}</h1>
                <p className="mt-2 max-w-sm text-center text-sm text-slate-400">Ask about your account. NOVA checks connected account data before answering account questions.</p>
              </>}
        </motion.button>

        <motion.div
          layout
          transition={{ layout: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }}
          className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col ${voiceConversation ? 'w-full items-center justify-center text-center' : chatStarted ? 'justify-between' : 'w-full items-center justify-center'}`}
        >
          {voiceConversation ? (
            <div className="flex max-w-md flex-col items-center px-3 text-center">
              <p role="status" aria-live="polite" className="font-label-tech text-xs uppercase tracking-[0.2em] text-cyan-200 sm:text-sm">
                {voiceSpeaking ? 'NOVA is speaking' : busy ? 'NOVA is thinking' : listening ? 'Listening — speak naturally' : 'Voice chat is paused'}
              </p>
              <p className="mt-2 text-xs text-slate-500 sm:text-sm">
                {voiceSpeaking ? 'Speak over NOVA or tap the orb to interrupt.' : 'Tap the orb again to end voice chat.'}
              </p>
              {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
              {voiceFeedback && <p className="mt-3 text-xs text-cyan-200">{voiceFeedback}</p>}
              <p className="mt-4 text-[10px] leading-relaxed text-slate-600 sm:text-xs">Your browser may send microphone audio to its speech service. NOVA receives recognized words to answer.</p>
            </div>
          ) : chatStarted ? (
            <>
              <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
                <div>
                  <p className="font-label-tech text-[10px] uppercase tracking-[0.24em] text-cyan-300">NOVA conversation</p>
                  <p className="mt-1 text-xs text-slate-500">Account-aware assistant</p>
                </div>
                {busy && <span role="status" className="text-xs text-cyan-200">Thinking…</span>}
              </div>
              <div aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto py-3 pr-1 sm:pr-3">
                {messages.map((m, i) => (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={`max-w-[88%] sm:max-w-[78%] ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                      <p className={`mb-1 px-1 font-label-tech text-[9px] uppercase tracking-[0.18em] ${m.role === 'user' ? 'text-slate-500' : 'text-cyan-300'}`}>{m.role === 'user' ? 'You' : 'NOVA'}</p>
                      <p className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-br-md border border-cyan-400/15 bg-cyan-500/10 text-cyan-50' : 'rounded-bl-md border border-white/10 bg-white/[0.045] text-slate-200'}`}>{m.text}</p>
                      {m.account && <div className="mt-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3 text-left text-xs">
                        <div className="mb-2 flex items-center justify-between gap-3"><span className="truncate text-slate-300">Selected MT5 account · verified snapshot</span><span className={m.account.connection_status === 'CONNECTED' ? 'text-emerald-300' : 'text-amber-300'}>{m.account.connection_status}</span></div>
                        <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-slate-400">
                          <span>Balance</span><span className="text-right text-slate-200">{m.account.currency} {Number(m.account.balance).toFixed(2)}</span>
                          <span>Equity</span><span className="text-right text-slate-200">{m.account.currency} {Number(m.account.equity).toFixed(2)}</span>
                          <span>Realized today (UTC)</span><span className="text-right text-slate-200">{m.account.currency} {Number(m.account.realized_pnl_today).toFixed(2)}</span>
                          <span>Open positions</span><span className="text-right text-slate-200">{m.account.open_positions}</span>
                        </div>
                        {m.account.last_synced_at && <p className="mt-2 text-right text-[10px] text-slate-600">Synced {new Date(m.account.last_synced_at).toLocaleString()}</p>}
                      </div>}
                    </div>
                  </div>
                ))}
                {busy && <div className="flex justify-start"><p className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-slate-400">NOVA is thinking…</p></div>}
                <div ref={conversationEndRef} />
              </div>
              {error && <p role="alert" className="mb-2 text-sm text-rose-300">{error}</p>}
              <form onSubmit={submit} className="mt-3 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                <input value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} maxLength={2000} aria-label="Ask NOVA" placeholder="Message NOVA…" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
                <button type="button" onClick={toggleListening} disabled={busy || voiceConversation || (!speechSupported && !listening)} aria-label={listening ? 'Stop voice input' : 'Start voice input'} aria-pressed={listening} title={listening ? 'Stop listening' : 'Speak to NOVA'} className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${listening ? 'border-rose-400/40 text-rose-300' : 'border-cyan-400/20 text-cyan-200'}`}>
                  {listening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
                  <span className="hidden sm:inline">{listening ? 'Stop' : 'Talk'}</span>
                </button>
                <button type="submit" disabled={busy || listening || !input.trim()} className="shrink-0 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40">{busy ? '…' : 'Ask'}</button>
              </form>
              {voiceFeedback && <p role="status" aria-live="polite" className="mt-2 text-xs text-cyan-200">{voiceFeedback}</p>}
              <p className="mt-2 text-[10px] text-slate-600">Your browser may send audio to its speech service for transcription. NOVA receives the transcript only after you press Ask.</p>
            </>
          ) : (
            <>
              {error && <p role="alert" className="mt-4 w-full max-w-lg text-sm text-rose-300">{error}</p>}
              <form onSubmit={submit} className="mt-6 flex w-full max-w-lg items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                <input value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} maxLength={2000} aria-label="Ask NOVA" placeholder="Ask NOVA about your account…" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
                <button type="button" onClick={toggleListening} disabled={busy || (!speechSupported && !listening)} aria-label={listening ? 'Stop voice input' : 'Start voice input'} aria-pressed={listening} title={listening ? 'Stop listening' : 'Speak to NOVA'} className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${listening ? 'border-rose-400/40 text-rose-300' : 'border-cyan-400/20 text-cyan-200'}`}>
                  {listening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
                  <span>{listening ? 'Stop' : 'Talk'}</span>
                </button>
                <button type="submit" disabled={busy || listening || !input.trim()} className="shrink-0 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40">{busy ? '…' : 'Ask'}</button>
              </form>
              {voiceFeedback && <p role="status" aria-live="polite" className="mt-2 w-full max-w-lg text-xs text-cyan-200">{voiceFeedback}</p>}
              <p className="mt-2 max-w-lg text-center text-[11px] text-slate-500">Your browser may send audio to its speech service for transcription. NOVA receives the transcript only after you press Ask.</p>
            </>
          )}
        </motion.div>
      </motion.section>
      <aside className={`hud-panel p-5 ${voiceConversation ? 'hidden' : ''}`}>
        <h2 className="font-label-tech text-[11px] uppercase tracking-[0.25em] text-cyan-300">System status</h2>
        <ul className="mt-4 divide-y divide-white/5">
          {rows.map(([k, v, ok]) => (
            <li key={k} className="flex items-center justify-between py-3 text-sm">
              <span className="text-slate-300">{k}</span>
              <span className={`font-label-tech text-[11px] font-semibold ${tone(ok)}`}>{v}</span>
            </li>
          ))}
        </ul>
        {aiReady === false && <p className="mt-4 text-xs text-slate-500">Set GEMINI_API_KEY in the backend environment to enable text reasoning.</p>}
      </aside>
    </div>
  );
};
