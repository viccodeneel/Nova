import { useEffect, useRef, useState } from 'react';
import { ApiClient } from '../services/apiClient.ts';
import { createSpeechRecognition, isSpeechRecognitionSupported } from '../services/speechRecognition.ts';
import type { SpeechRecognitionErrorEventLike } from '../services/speechRecognition.ts';
import type { NavSection } from '../data/terminalData.ts';
import { makeUtterance, splitForSpeech } from './voicePrefs.ts';

type AccountSnapshot = NonNullable<Awaited<ReturnType<typeof ApiClient.askAi>>['account']>;
export type ChatMessage = { role: 'user' | 'nova'; text: string; account?: AccountSnapshot };
export type WakeStatus = 'off' | 'listening' | 'paused' | 'blocked' | 'unsupported';

const WAKE_RE = /\b(?:(?:hey|ok|okay|hi)[\s,]+)?nova\b/i;
const LEADING_WAKE_RE = /^\s*(?:(?:hey|ok|okay|hi)[\s,]+)?nova[\s,.:;!?-]*/i;
const END_RE = /^(?:(?:ok(?:ay)?|alright)[\s,]+)?(?:thanks?(?: you)?|that'?s all|goodbye|bye|stop listening|go to sleep|dismiss|never ?mind)(?:[\s,]+nova)?[\s.!]*$/i;
const WAKE_KEY = 'nova_wake_enabled';
const IDLE_MS = 25_000;

/** Returns the command spoken after the wake word ('' if none), or null if the wake word wasn't said. */
export function matchWake(text: string): { command: string } | null {
  const m = WAKE_RE.exec(text);
  return m ? { command: text.slice(m.index + m[0].length).replace(/^[\s,.:;!?-]+/, '').trim() } : null;
}
export const isEndPhrase = (text: string): boolean => END_RE.test(text.trim());

const speechErrorMessage = (event: SpeechRecognitionErrorEventLike): string => {
  switch (event.error) {
    case 'not-allowed':
    case 'service-not-allowed': return 'Microphone access was blocked. Allow microphone access for NOVA in your browser settings.';
    case 'audio-capture': return 'No microphone was found. Connect or enable a microphone and try again.';
    case 'no-speech': return 'No speech was detected. Try speaking a little closer to the microphone.';
    case 'network': return 'The browser speech service could not be reached. Check your connection and try again.';
    default: return 'Voice input stopped unexpectedly. Please try again.';
  }
};

interface Options { enabled: boolean; onNavigate: (page: NavSection) => void; getAccountId: () => string | undefined; getActiveTab?: () => string }

/**
 * App-level NOVA engine: chat, voice conversation, and wake word. It lives above the screens, so
 * switching tabs never interrupts a conversation. Callbacks only touch refs and state setters, so
 * closures created in earlier renders stay valid.
 */
export function useNovaVoice(options: Options) {
  const optsRef = useRef(options);
  optsRef.current = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState('');
  const [voiceConversation, setVoiceConversation] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [voicePulse, setVoicePulse] = useState(0);
  const [dockOpen, setDockOpen] = useState(false);
  const [wakeEnabled, setWakeEnabledState] = useState(() => { try { return localStorage.getItem(WAKE_KEY) === '1'; } catch { return false; } });
  const [wakeStatus, setWakeStatus] = useState<WakeStatus>('off');

  const wakeEnabledRef = useRef(wakeEnabled);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const busyRef = useRef(false);
  const queuedRef = useRef<string | null>(null);
  const voiceConversationRef = useRef(false);
  const voiceSpeakingRef = useRef(false);
  const waitingForReplyRef = useRef(false);
  const wakeSessionRef = useRef(false);
  const wakeHeardRef = useRef(false);
  const wakeFailuresRef = useRef(0);
  const speechIdRef = useRef(0);
  const spokenTextRef = useRef('');
  const spokenCharIndexRef = useRef(0);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition>>(null);
  const wakeRecRef = useRef<ReturnType<typeof createSpeechRecognition>>(null);
  const speechHadResultRef = useRef(false);
  const speechHadErrorRef = useRef(false);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const timers = useRef<Record<string, number | undefined>>({});

  const speechSupported = isSpeechRecognitionSupported();
  const speechOutputSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const voiceConversationSupported = speechSupported && speechOutputSupported;

  const setTimer = (name: string, fn: () => void, ms: number) => { window.clearTimeout(timers.current[name]); timers.current[name] = window.setTimeout(fn, ms); };
  const clearTimer = (name: string) => { window.clearTimeout(timers.current[name]); timers.current[name] = undefined; };

  // ---------- idle / dock ----------
  const clearIdle = () => clearTimer('idle');
  const touchIdle = () => {
    clearIdle();
    if (wakeSessionRef.current && voiceConversationRef.current) setTimer('idle', () => stopVoiceConversation('Standing by. Say “Hey NOVA” when you need me.'), IDLE_MS);
  };
  const cancelDockClose = () => clearTimer('dockClose');
  const scheduleDockClose = () => setTimer('dockClose', () => setDockOpen(false), 2500);

  // ---------- wake word ----------
  const stopWakeRecognition = () => { clearTimer('wakeRestart'); const rec = wakeRecRef.current; wakeRecRef.current = null; try { rec?.abort(); } catch { /* already stopped */ } };
  const resumeWake = () => setTimer('wakeResume', startWake, 700);

  function startWake() {
    if (!optsRef.current.enabled || !wakeEnabledRef.current || voiceConversationRef.current || wakeRecRef.current || recognitionRef.current) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const rec = createSpeechRecognition();
    if (!rec) { setWakeStatus('unsupported'); return; }
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      wakeFailuresRef.current = 0;
      for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = (result?.[0]?.transcript || '').trim();
        if (!text) continue;
        const hit = matchWake(text);
        if (!hit) {
          if (result.isFinal && wakeHeardRef.current && !voiceConversationRef.current) { wakeHeardRef.current = false; scheduleDockClose(); }
          continue;
        }
        if (!result.isFinal) {
          if (!wakeHeardRef.current) { wakeHeardRef.current = true; cancelDockClose(); setDockOpen(true); setVoiceFeedback('NOVA heard you…'); }
          continue;
        }
        wakeHeardRef.current = false;
        beginWakeSession(hit.command);
        return;
      }
    };
    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wakeEnabledRef.current = false;
        try { localStorage.setItem(WAKE_KEY, '0'); } catch { /* storage unavailable */ }
        setWakeEnabledState(false);
        setWakeStatus('blocked');
        setVoiceFeedback('Microphone access was blocked, so the wake word is off.');
      } else if (event.error !== 'aborted') wakeFailuresRef.current += 1;
    };
    rec.onend = () => {
      if (wakeRecRef.current === rec) wakeRecRef.current = null;
      if (!wakeEnabledRef.current || voiceConversationRef.current) return;
      setWakeStatus('paused');
      setTimer('wakeRestart', startWake, Math.min(10_000, 400 * 2 ** Math.min(wakeFailuresRef.current, 5)));
    };
    wakeRecRef.current = rec;
    try { rec.start(); setWakeStatus('listening'); }
    catch { wakeRecRef.current = null; wakeFailuresRef.current += 1; setTimer('wakeRestart', startWake, 2000); }
  }

  function beginWakeSession(command: string) {
    stopWakeRecognition();
    cancelDockClose();
    setDockOpen(true);
    wakeSessionRef.current = true;
    voiceConversationRef.current = true;
    setVoiceConversation(true);
    waitingForReplyRef.current = true;
    if (command) { setVoiceFeedback('NOVA is preparing a reply…'); void submitMessage(command, true); }
    else { setVoiceFeedback('Yes?'); window.setTimeout(() => speakResponse('Yes?'), 250); }
  }

  const setWakeEnabled = (on: boolean) => {
    wakeEnabledRef.current = on;
    try { localStorage.setItem(WAKE_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
    setWakeEnabledState(on);
    if (on) { if (!speechSupported) { setWakeStatus('unsupported'); return; } startWake(); }
    else { stopWakeRecognition(); clearTimer('wakeResume'); setWakeStatus('off'); }
  };

  // ---------- speech out ----------
  const clearSpeechTimers = () => { clearTimer('speechStart'); clearTimer('speechEnd'); };

  function finishVoiceTurn(feedback = 'Listening for your next message…') {
    clearSpeechTimers();
    voiceSpeakingRef.current = false;
    setVoiceSpeaking(false);
    setVoicePulse(0);
    if (!waitingForReplyRef.current) return;
    waitingForReplyRef.current = false;
    if (!voiceConversationRef.current) return;
    setVoiceFeedback(feedback);
    touchIdle();
    if (recognitionRef.current) return;
    window.setTimeout(() => { if (voiceConversationRef.current && !recognitionRef.current) toggleListening(); }, 350);
  }

  function speakResponse(text: string) {
    if (!voiceConversationRef.current || !speechOutputSupported) return;
    clearSpeechTimers();
    window.speechSynthesis.cancel();
    const id = ++speechIdRef.current;
    const chunks = splitForSpeech(text);
    const done = (feedback?: string) => { if (id === speechIdRef.current) finishVoiceTurn(feedback); };
    if (!chunks.length) { done(); return; }
    spokenTextRef.current = chunks.join(' ');
    spokenCharIndexRef.current = 0;
    const offsets: number[] = [];
    chunks.reduce((acc, chunk) => { offsets.push(acc); return acc + chunk.length + 1; }, 0);
    let next = 0;
    // Long replies are spoken sentence by sentence: some browsers cut off a single long utterance.
    const speakNext = () => {
      if (id !== speechIdRef.current) return;
      if (next >= chunks.length) { done(); return; }
      const n = next;
      next += 1;
      const utterance = makeUtterance(chunks[n]);
      utterance.onstart = () => {
        if (id !== speechIdRef.current) return;
        clearTimer('speechStart');
        if (voiceSpeakingRef.current) return;
        voiceSpeakingRef.current = true;
        setVoiceSpeaking(true);
        setVoiceFeedback('NOVA is speaking — speak over me to interrupt.');
        if (!recognitionRef.current) toggleListening(true);
      };
      utterance.onboundary = (event) => {
        if (id !== speechIdRef.current) return;
        spokenCharIndexRef.current = offsets[n] + event.charIndex;
        const word = chunks[n].slice(event.charIndex).match(/^[A-Za-z0-9']+/)?.[0] || '';
        setVoicePulse(Math.min(0.14, 0.04 + word.length * 0.009));
        setTimer('pulse', () => setVoicePulse(0), 170);
      };
      utterance.onend = speakNext;
      utterance.onerror = () => done();
      window.speechSynthesis.speak(utterance);
    };
    // Browsers do not always fire speech events. These watchdogs keep the conversation moving regardless.
    setTimer('speechStart', () => {
      if (id !== speechIdRef.current || voiceSpeakingRef.current) return;
      window.speechSynthesis.cancel();
      done('Voice playback was blocked by the browser. Click anywhere on the page once, then try again.');
    }, 2000);
    setTimer('speechEnd', () => { if (id !== speechIdRef.current) return; window.speechSynthesis.cancel(); done(); }, Math.max(5000, spokenTextRef.current.length * 95 + 3500));
    speakNext();
  }

  // ---------- speech in ----------
  const isNovaSpeechEcho = (transcript: string): boolean => {
    const normalized = transcript.toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();
    if (normalized.length < 5) return false;
    const start = Math.max(0, spokenCharIndexRef.current - 70);
    const spokenWindow = spokenTextRef.current.slice(start, spokenCharIndexRef.current + 190).toLowerCase().replace(/[^a-z0-9']+/g, ' ');
    if (spokenWindow.includes(normalized)) return true;
    const words = normalized.split(/\s+/).filter((word) => word.length > 2);
    if (words.length < 3) return false;
    return words.filter((word) => spokenWindow.includes(word)).length / words.length >= 0.78;
  };

  function toggleListening(monitorNovaSpeech = false) {
    const active = recognitionRef.current;
    if (active) { active.stop(); return; }
    stopWakeRecognition();
    const recognition = createSpeechRecognition();
    if (!recognition) { setVoiceFeedback('Voice input is not supported in this browser. Try a recent version of Chrome or Edge.'); return; }
    speechHadResultRef.current = false;
    speechHadErrorRef.current = false;
    if (!voiceConversationRef.current) setVoiceFeedback('');
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = monitorNovaSpeech;
    recognition.interimResults = monitorNovaSpeech;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let transcript = '';
      let hasFinalResult = !monitorNovaSpeech;
      for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript || '';
        if (event.results[index]?.isFinal) hasFinalResult = true;
      }
      const clean = transcript.trim();
      if (!clean) return;
      if (monitorNovaSpeech && voiceConversationRef.current) {
        if (voiceSpeakingRef.current && isNovaSpeechEcho(clean)) return;
        if (voiceSpeakingRef.current) {
          speechIdRef.current += 1;
          clearSpeechTimers();
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
        touchIdle();
        setVoiceFeedback('NOVA is preparing a reply…');
        recognition.stop();
        void submitMessage(clean, true);
        return;
      }
      if (!hasFinalResult) return;
      speechHadResultRef.current = true;
      setInput((current) => {
        const existing = current.trim();
        const separator = existing ? ' ' : '';
        return [existing, clean.slice(0, Math.max(0, 2000 - existing.length - separator.length))].filter(Boolean).join(separator);
      });
      if (voiceConversationRef.current) { waitingForReplyRef.current = true; setVoiceFeedback('NOVA is preparing a reply…'); void submitMessage(clean, true); }
      else setVoiceFeedback('Transcript ready. Review it, then press Ask.');
    };
    recognition.onerror = (event) => { speechHadErrorRef.current = true; setVoiceFeedback(speechErrorMessage(event)); };
    recognition.onend = () => {
      setListening(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (!speechHadResultRef.current && !speechHadErrorRef.current) setVoiceFeedback(voiceConversationRef.current ? 'Listening again…' : 'No speech was detected. Try again when you’re ready.');
      if (voiceConversationRef.current && !waitingForReplyRef.current) {
        if (speechHadErrorRef.current) { stopVoiceConversation(); return; }
        window.setTimeout(() => { if (voiceConversationRef.current && !recognitionRef.current) toggleListening(voiceSpeakingRef.current); }, 350);
      }
      if (!voiceConversationRef.current) resumeWake();
    };
    recognitionRef.current = recognition;
    setListening(true);
    try { recognition.start(); }
    catch { recognitionRef.current = null; setListening(false); setVoiceFeedback('Voice input could not start. Check microphone access and try again.'); }
  }

  // ---------- chat ----------
  async function submitMessage(rawText: string, speak: boolean): Promise<void> {
    let text = rawText.trim();
    if (speak) text = text.replace(LEADING_WAKE_RE, '').trim() || text;
    if (!text) { waitingForReplyRef.current = false; return; }
    if (speak && isEndPhrase(text)) {
      stopVoiceConversation('Standing by. Say “Hey NOVA” when you need me.');
      if (speechOutputSupported) window.speechSynthesis.speak(makeUtterance('Standing by.'));
      return;
    }
    if (busyRef.current) {
      // Never silently drop a spoken message: keep the latest and send it when the current request finishes.
      if (speak) queuedRef.current = text; else waitingForReplyRef.current = false;
      return;
    }
    clearIdle();
    const history = messagesRef.current.filter((m) => m.text.trim()).slice(-14).map((m) => ({ role: m.role === 'nova' ? 'assistant' as const : 'user' as const, text: m.text }));
    setMessages((old) => [...old, { role: 'user', text }, ...(!speak ? [{ role: 'nova' as const, text: '' }] : [])]);
    setInput('');
    setError('');
    busyRef.current = true;
    setBusy(true);
    const onChunk = speak ? undefined : (chunk: string) => {
      setMessages((old) => {
        const last = old.reduce((found, message, index) => (message.role === 'nova' ? index : found), -1);
        if (last < 0) return [...old, { role: 'nova', text: chunk }];
        return old.map((message, index) => (index === last ? { ...message, text: message.text + chunk } : message));
      });
    };
    try {
      const result = await ApiClient.askAi(text, optsRef.current.getAccountId(), onChunk, { history, activeTab: optsRef.current.getActiveTab?.(), mode: speak ? 'voice' : 'text' });
      setMessages((old) => {
        const entry = { role: 'nova' as const, text: result.response, account: result.account || undefined };
        if (speak) return [...old, entry];
        const last = old.reduce((found, message, index) => (message.role === 'nova' ? index : found), -1);
        return last < 0 ? [...old, entry] : old.map((message, index) => (index === last ? { ...message, ...entry } : message));
      });
      // The engine lives above the screens, so navigating never ends the conversation.
      if (result.navigation) optsRef.current.onNavigate(result.navigation.page);
      if (speak) speakResponse(result.response);
    } catch (e) {
      setMessages((old) => old.filter((message, index) => !(index === old.length - 1 && message.role === 'nova' && !message.text)));
      setError((e as Error).message);
      if (speak) speakResponse('Sorry, I could not get a reply just now. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
      const queued = queuedRef.current;
      queuedRef.current = null;
      if (queued && voiceConversationRef.current) void submitMessage(queued, true);
    }
  }

  // ---------- conversation control ----------
  function stopVoiceConversation(feedback = 'Voice conversation ended.') {
    voiceConversationRef.current = false;
    wakeSessionRef.current = false;
    clearIdle();
    clearSpeechTimers();
    speechIdRef.current += 1;
    voiceSpeakingRef.current = false;
    waitingForReplyRef.current = false;
    queuedRef.current = null;
    setVoiceSpeaking(false);
    setVoicePulse(0);
    setVoiceConversation(false);
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    try { rec?.abort(); } catch { /* already stopped */ }
    setListening(false);
    if (speechOutputSupported) window.speechSynthesis.cancel();
    setVoiceFeedback(feedback);
    scheduleDockClose();
    resumeWake();
  }

  function startVoiceConversation() {
    if (!voiceConversationSupported) { setVoiceFeedback('Voice conversations need speech recognition and speech playback. Try the latest Chrome or Edge.'); setDockOpen(true); return; }
    stopWakeRecognition();
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch { /* already stopped */ } recognitionRef.current = null; setListening(false); }
    cancelDockClose();
    setDockOpen(true);
    waitingForReplyRef.current = false;
    wakeSessionRef.current = false;
    voiceConversationRef.current = true;
    setVoiceConversation(true);
    setVoiceFeedback('Voice chat started. Speak naturally; NOVA will answer aloud.');
    toggleListening();
  }

  function handleOrbClick() {
    if (!voiceConversationRef.current) { startVoiceConversation(); return; }
    if (voiceSpeakingRef.current) {
      speechIdRef.current += 1;
      clearSpeechTimers();
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
  }

  const openDock = () => { cancelDockClose(); setDockOpen(true); };
  const closeDock = () => {
    if (voiceConversationRef.current || recognitionRef.current) stopVoiceConversation();
    cancelDockClose();
    setDockOpen(false);
  };

  // ---------- lifecycle ----------
  useEffect(() => { conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);
  useEffect(() => {
    optsRef.current = { ...optsRef.current, enabled: options.enabled };
    if (options.enabled && wakeEnabled) startWake();
    else { stopWakeRecognition(); setWakeStatus((prev) => (prev === 'blocked' ? prev : 'off')); }
    const onVisible = () => { if (!document.hidden) startWake(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [options.enabled, wakeEnabled]);
  useEffect(() => () => {
    voiceConversationRef.current = false;
    optsRef.current = { ...optsRef.current, enabled: false };
    Object.keys(timers.current).forEach(clearTimer);
    try { recognitionRef.current?.abort(); wakeRecRef.current?.abort(); } catch { /* already stopped */ }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  return {
    messages, input, setInput, busy, error, listening, voiceFeedback, voiceConversation, voiceSpeaking, voicePulse,
    dockOpen, openDock, closeDock, wakeEnabled, wakeStatus, setWakeEnabled, wakeSupported: speechSupported,
    speechSupported, voiceConversationSupported, conversationEndRef,
    sendText: (text: string) => submitMessage(text, false),
    toggleListening, handleOrbClick, startVoiceConversation, stopVoiceConversation,
  };
}

export type NovaVoice = ReturnType<typeof useNovaVoice>;
