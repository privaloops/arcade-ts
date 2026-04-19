/**
 * BackgroundLayer — fullscreen blurry screenshot behind the browser UI.
 *
 * Uses a two-layer stack for crossfade: when a new screenshot URL
 * resolves, the idle layer picks it up and fades in while the previous
 * layer fades out. A probe <img> walks the candidate URL cascade so a
 * 404 from ArcadeDB doesn't produce an empty background.
 */

export class BackgroundLayer {
  readonly root: HTMLDivElement;

  private readonly layerA: HTMLDivElement;
  private readonly layerB: HTMLDivElement;
  private current: "A" | "B" = "A";
  private currentUrl: string | null = null;
  private probeToken = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "af-bg";

    this.layerA = this.makeLayer(true);
    this.layerB = this.makeLayer(false);
    this.root.appendChild(this.layerA);
    this.root.appendChild(this.layerB);

    const overlay = document.createElement("div");
    overlay.className = "af-bg-overlay";
    this.root.appendChild(overlay);

    container.appendChild(this.root);
  }

  /**
   * Set the background from an ordered cascade of URLs — the first one
   * that loads wins. Pass an empty array to clear.
   */
  setScreenshotCandidates(urls: string[]): void {
    const token = ++this.probeToken;
    if (urls.length === 0) {
      this.swapTo(null);
      return;
    }
    const probe = new Image();
    let i = 0;
    probe.onload = () => {
      if (token !== this.probeToken) return;
      this.swapTo(probe.src);
    };
    probe.onerror = () => {
      if (token !== this.probeToken) return;
      if (i >= urls.length) { this.swapTo(null); return; }
      probe.src = urls[i++]!;
    };
    probe.src = urls[i++]!;
  }

  private swapTo(url: string | null): void {
    if (url === this.currentUrl) return;
    this.currentUrl = url;
    const next = this.current === "A" ? this.layerB : this.layerA;
    const prev = this.current === "A" ? this.layerA : this.layerB;
    if (url) next.style.backgroundImage = `url("${url}")`;
    else next.style.backgroundImage = "";
    next.classList.add("is-visible");
    prev.classList.remove("is-visible");
    this.current = this.current === "A" ? "B" : "A";
  }

  private makeLayer(visible: boolean): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "af-bg-layer";
    if (visible) el.classList.add("is-visible");
    return el;
  }
}
