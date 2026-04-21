/**
 * Browser-native TTS via the Web Speech API. Zero network latency, zero
 * cost, uses the system voices — useful for fast dev iteration. The
 * hype factor is limited vs ElevenLabs, so keep this as a toggle, not
 * the demo default.
 */

import type { TtsPlayerOptions } from './tts-player';

export interface LocalTtsOptions extends TtsPlayerOptions {
  /** BCP-47 locale, e.g. "fr-FR", "en-US". */
  lang?: string;
  /** Playback rate in [0.1..10], default 1.15 for caster feel. */
  rate?: number;
  /** Pitch in [0..2], default 1.0. */
  pitch?: number;
}

export class LocalTtsPlayer {
  private readonly opts: LocalTtsOptions;
  private readonly synth: SpeechSynthesis | null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private stopped = false;

  constructor(opts: LocalTtsOptions = {}) {
    this.opts = opts;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis ?? null : null;
  }

  speak(text: string): void {
    if (this.stopped || !this.synth) return;
    const line = phoneticize(text.trim(), this.opts.lang ?? 'en-US');
    if (!line) return;

    this.cancelCurrent();

    const utterance = new SpeechSynthesisUtterance(line);
    utterance.lang = this.opts.lang ?? 'en-US';
    utterance.rate = this.opts.rate ?? 1.15;
    utterance.pitch = this.opts.pitch ?? 1.0;

    const voice = pickVoice(this.synth, utterance.lang);
    if (voice) utterance.voice = voice;

    utterance.addEventListener('start', () => this.opts.onStart?.());
    utterance.addEventListener('end', () => {
      if (this.currentUtterance === utterance) this.currentUtterance = null;
      this.opts.onEnd?.();
    });
    utterance.addEventListener('error', (e) => {
      if (this.currentUtterance === utterance) this.currentUtterance = null;
      this.opts.onError?.(e.error ?? 'speech error');
    });

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  cancelCurrent(): void {
    if (this.synth && this.synth.speaking) this.synth.cancel();
    this.currentUtterance = null;
  }

  destroy(): void {
    this.stopped = true;
    this.cancelCurrent();
  }
}

/**
 * The system voices spell Japanese fighter / move names letter by
 * letter ("R-Y-U"), which kills immersion. Rewrite a handful of known
 * names phonetically for the target locale before synthesis. Only
 * applied to the local engine — ElevenLabs handles them natively.
 */
function phoneticize(text: string, lang: string): string {
  if (!text) return text;
  const map = lang.toLowerCase().startsWith('fr') ? FR_PHONETIC_MAP : EN_PHONETIC_MAP;
  let out = text;
  for (const [pattern, replacement] of map) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

const FR_PHONETIC_MAP: Array<[RegExp, string]> = [
  // Fighter names — re-spell so the French TTS voice doesn't spell them.
  [/\bRyu\b/gi, 'Riou'],
  [/\bKen\b/gi, 'Kène'],
  [/\bGuile\b/gi, 'Gaïle'],
  [/\bDhalsim\b/gi, 'Dalssim'],
  [/\bSagat\b/gi, 'Sagatte'],
  [/\bVega\b/gi, 'Véga'],
  [/\bE\.?\s*Honda\b/gi, 'Honda'],
  [/\bChun-?Li\b/gi, 'Tchoune-Li'],
  // Special moves.
  [/\bHadouken\b/gi, 'Adouken'],
  [/\bShoryuken\b/gi, 'Shorioukène'],
  [/\bShoryu\b/gi, 'Shoriou'],
  [/\bTatsumaki\b/gi, 'Tatsoumaki'],
  [/\bTatsu\b/gi, 'Tatsou'],
  [/\bPsycho\s+Crusher\b/gi, 'Psycho Crusher'],
  [/\bSumo\s+Headbutt\b/gi, 'Headbutt'],
  [/\bSumo\s+Splash\b/gi, 'Splash'],
];

const EN_PHONETIC_MAP: Array<[RegExp, string]> = [
  // English TTS also tends to spell "Ryu" — force a phonetic rewrite.
  [/\bRyu\b/g, 'Ryoo'],
];

/**
 * Pick a reasonable voice for the requested locale. Prefer a local
 * voice (no network), then any voice matching the language prefix.
 * Returns null if nothing better than the default is found.
 */
function pickVoice(synth: SpeechSynthesis, lang: string): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (voices.length === 0) return null;
  const prefix = lang.slice(0, 2).toLowerCase();
  const localMatch = voices.find(v => v.localService && v.lang.toLowerCase().startsWith(prefix));
  if (localMatch) return localMatch;
  const anyMatch = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
  return anyMatch ?? null;
}
