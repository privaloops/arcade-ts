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
