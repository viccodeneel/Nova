/** NOVA's chosen voice. The browser's default voice differs per browser and OS, so we pin one and remember it. */
export interface VoicePrefs { voiceURI: string | null; rate: number }
const KEY = 'nova_voice_prefs';

export function loadPrefs(): VoicePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const rate = Number(raw.rate);
    return { voiceURI: typeof raw.voiceURI === 'string' ? raw.voiceURI : null, rate: Number.isFinite(rate) ? Math.min(1.4, Math.max(0.7, rate)) : 1 };
  } catch { return { voiceURI: null, rate: 1 }; }
}
export function savePrefs(prefs: VoicePrefs): void { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ } }

// Voices that tend to sound natural. Availability depends on the browser and OS, so this is a ranked wish list.
const PREFERRED = [/Aria/i, /Jenny/i, /Sonia/i, /Libby/i, /Google UK English Female/i, /Google US English/i, /Samantha/i, /Serena/i, /Karen/i, /Ava\b/i, /Zira/i, /female/i];

export function pickDefaultVoice(voices: SpeechSynthesisVoice[], lang = typeof navigator !== 'undefined' ? navigator.language : 'en-US'): SpeechSynthesisVoice | null {
  const base = lang.split('-')[0].toLowerCase();
  const sameLanguage = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  const pool = sameLanguage.length ? sameLanguage : voices;
  for (const wanted of PREFERRED) { const hit = pool.find((v) => wanted.test(v.name)); if (hit) return hit; }
  return pool.find((v) => v.default) || pool[0] || null;
}
export function resolveVoice(voices: SpeechSynthesisVoice[], prefs: VoicePrefs): SpeechSynthesisVoice | null {
  return voices.find((v) => v.voiceURI === prefs.voiceURI) || pickDefaultVoice(voices);
}
export const currentVoices = (): SpeechSynthesisVoice[] =>
  (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.getVoices?.()) || [];

/** Voices load asynchronously in Chrome; resolves once they are available (or after a short wait). */
export function whenVoicesReady(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return resolve([]);
    const now = currentVoices();
    if (now.length) return resolve(now);
    const done = () => { window.speechSynthesis.removeEventListener?.('voiceschanged', done); resolve(currentVoices()); };
    window.speechSynthesis.addEventListener?.('voiceschanged', done);
    window.setTimeout(done, 1500);
  });
}

export function makeUtterance(text: string, prefs: VoicePrefs = loadPrefs()): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = resolveVoice(currentVoices(), prefs);
  if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = navigator.language || 'en-US';
  utterance.rate = prefs.rate;
  utterance.pitch = 1;
  return utterance;
}

/** Removes markdown-ish symbols that sound wrong when read aloud. */
export function stripForSpeech(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[*_`#>~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits a reply into sentence-sized chunks. Long single utterances get cut off by some browsers' network voices. */
export function splitForSpeech(text: string, max = 180): string[] {
  const sentences = stripForSpeech(text).split(/(?<=[.!?…])\s+/).filter(Boolean);
  const pieces: string[] = [];
  for (const sentence of sentences) {
    let rest = sentence;
    while (rest.length > max) {
      const cut = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf(' ', max));
      const at = cut > 40 ? cut + 1 : max;
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) pieces.push(rest);
  }
  const chunks: string[] = [];
  for (const piece of pieces) {
    const last = chunks[chunks.length - 1];
    if (last && last.length + piece.length + 1 <= max) chunks[chunks.length - 1] = `${last} ${piece}`; else chunks.push(piece);
  }
  return chunks;
}
