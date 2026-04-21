/**
 * Browser TTS player. Takes a finished commentator line, fetches an MP3
 * from the dev proxy, plays it. Cancels any in-flight playback when a
 * new line arrives so the commentator doesn't talk over himself.
 */

export interface TtsPlayerOptions {
  /** Optional voice override forwarded to the proxy. */
  voiceId?: string;
  /** Optional model override forwarded to the proxy. */
  modelId?: string;
  /** Called once the audio element has actually started playing. */
  onStart?(): void;
  /** Called when the line finishes playing naturally. */
  onEnd?(): void;
  /** Called on any upstream error so the UI can degrade gracefully. */
  onError?(err: string): void;
}

export class TtsPlayer {
  private readonly opts: TtsPlayerOptions;
  private current: HTMLAudioElement | null = null;
  private stopped = false;
  // Shared AudioContext used to route every <audio> through a GainNode.
  // ElevenLabs voices — especially multilingual ones — tend to master at
  // a lower peak than a native MP3, so we boost by +4.5dB (~1.7x).
  // Created lazily on first speak() call so the user-gesture autoplay
  // policy isn't tripped at construction time.
  private audioContext: AudioContext | null = null;
  private static readonly GAIN = 1.7;

  constructor(opts: TtsPlayerOptions = {}) {
    this.opts = opts;
  }

  /**
   * Play a line of commentary. Uses a GET on the dev proxy with the
   * text in the query string so the <audio> element can begin
   * progressive playback the instant MP3 bytes arrive — much lower
   * perceived latency than buffering the whole blob first.
   */
  speak(text: string): void {
    if (this.stopped) return;
    const line = text.trim();
    if (!line) return;

    this.cancelCurrent();

    const params = new URLSearchParams({ text: line });
    if (this.opts.voiceId) params.set('voiceId', this.opts.voiceId);
    if (this.opts.modelId) params.set('modelId', this.opts.modelId);
    const src = `/api/coach/tts?${params.toString()}`;

    const audio = new Audio(src);
    audio.preload = 'auto';
    this.current = audio;

    // Route audio through a GainNode for the volume boost. Wrapped in
    // try/catch because createMediaElementSource throws in a few edge
    // cases (Safari with strict CORS, AudioContext not allowed yet) —
    // in those cases we fall back to the raw <audio> at default volume.
    try {
      if (!this.audioContext) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) this.audioContext = new AC();
      }
      if (this.audioContext) {
        if (this.audioContext.state === 'suspended') {
          // Resume is a promise but we don't need to await — the first
          // user gesture that loaded the page already unlocked it in
          // practice, and if not the boost just no-ops this one line.
          void this.audioContext.resume();
        }
        const source = this.audioContext.createMediaElementSource(audio);
        const gain = this.audioContext.createGain();
        gain.gain.value = TtsPlayer.GAIN;
        source.connect(gain);
        gain.connect(this.audioContext.destination);
      }
    } catch {
      // Fallback: native <audio> plays at its own volume.
    }

    audio.addEventListener('playing', () => this.opts.onStart?.(), { once: true });
    audio.addEventListener('ended', () => {
      if (this.current === audio) this.current = null;
      this.opts.onEnd?.();
    }, { once: true });
    audio.addEventListener('error', () => {
      if (this.current === audio) this.current = null;
      this.opts.onError?.('audio element error');
    }, { once: true });

    audio.play().catch((e: unknown) => {
      if (this.current === audio) this.current = null;
      if (e instanceof DOMException && e.name === 'NotAllowedError') return;
      this.opts.onError?.(e instanceof Error ? e.message : String(e));
    });
  }

  cancelCurrent(): void {
    if (this.current) {
      try { this.current.pause(); } catch { /* noop */ }
      this.current.src = '';
      this.current = null;
    }
  }

  destroy(): void {
    this.stopped = true;
    this.cancelCurrent();
  }
}
