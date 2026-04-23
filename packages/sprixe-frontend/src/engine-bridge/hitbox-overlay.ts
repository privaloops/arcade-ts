import type { CoachController } from "@sprixe/coach/coach-controller";
import type { CharacterState, CPUState, GameState, HitboxRect } from "@sprixe/coach/types";
import { actionForAnimPtr } from "@sprixe/coach/agent/tas/move-map";
import { getFrameData } from "@sprixe/coach/agent/frame-data";
import { minGapToHurtboxes, pushboxHorizontalGap } from "@sprixe/coach/agent/policy/threat-geometry";

const CPS1_SCREEN_WIDTH = 384;
const CPS1_SCREEN_HEIGHT = 224;
// Empirically calibrated from a ground-standing P1 (posY=40 in RAM).
// 240 matches the CPS1 playfield ground line (≈ screen y=200 for feet).
// Formula: screen_y = OFFSET - posY. Tune here if characters look shifted.
const WORLD_TO_SCREEN_Y_OFFSET = 240;

const COLORS: Record<HitboxRect["kind"], string> = {
  attack: "rgba(255, 40, 40, 0.55)",
  hurt_head: "rgba(40, 220, 80, 0.40)",
  hurt_body: "rgba(40, 220, 80, 0.40)",
  hurt_legs: "rgba(40, 220, 80, 0.40)",
  push: "rgba(80, 140, 255, 0.30)",
};

/**
 * Debug overlay that draws the live hitboxes read from SF2HF RAM on top
 * of the game canvas. Toggled via a keyboard shortcut so it can be
 * flipped on/off without recompiling.
 *
 * World → screen conversion: screen_x = world_x - cameraX. Y is already
 * in screen-local space (pos_y counts from the top of the playfield).
 */
export class HitboxOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly gameCanvas: HTMLCanvasElement;
  private readonly coach: CoachController;
  private rafId: number | null = null;
  private enabled = false;
  private resizeObserver: ResizeObserver | null = null;
  private keyListener: ((e: KeyboardEvent) => void) | null = null;
  // Per-character previous X sample, keyed on the CPS1 frameIdx so we
  // only recompute dx when a fresh vblank state arrives (rAF runs at
  // screen refresh, CPS1 at 59.6 Hz — without this gate dx would
  // flicker between real values and 0 on duplicate samples).
  private prevP1X: number | null = null;
  private prevP2X: number | null = null;
  private prevFrameIdx = -1;
  private lastP1Dx = 0;
  private lastP2Dx = 0;
  // Per-character move tracking: animPtr at startup + CPS1 frameIdx
  // when it was entered. Lets us compute elapsed frames and thus
  // recovery_left for the HUD. Null when the character isn't in an
  // attack state right now.
  private p1MoveStart: { animPtr: number; frameIdx: number } | null = null;
  private p2MoveStart: { animPtr: number; frameIdx: number } | null = null;
  // Rolling history of the last 5 completed moves per character.
  // Newest at index 0 (unshift + slice). Each entry is the move name
  // plus its actual duration in frames (end - start), so patterns
  // like "cLK cLK sweep" or repeated whiffs are visible at a glance.
  private p1History: Array<{ name: string; frames: number }> = [];
  private p2History: Array<{ name: string; frames: number }> = [];

  constructor(gameCanvas: HTMLCanvasElement, coach: CoachController) {
    this.gameCanvas = gameCanvas;
    this.coach = coach;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "sprixe-hitbox-overlay";
    this.canvas.style.position = "absolute";
    this.canvas.style.pointerEvents = "none";
    this.canvas.style.zIndex = "999";
    this.canvas.style.display = "none";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("overlay: 2d context unavailable");
    this.ctx = ctx;
    this.positionOverCanvas();
    gameCanvas.parentElement?.appendChild(this.canvas);

    // Keep the overlay glued to the game canvas as it resizes.
    this.resizeObserver = new ResizeObserver(() => this.positionOverCanvas());
    this.resizeObserver.observe(gameCanvas);

    // F7 toggles the overlay. Kept simple — no UI for now.
    this.keyListener = (e) => {
      if (e.key === "F7") {
        e.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener("keydown", this.keyListener);
  }

  private positionOverCanvas(): void {
    const rect = this.gameCanvas.getBoundingClientRect();
    const parentRect = this.gameCanvas.parentElement?.getBoundingClientRect();
    const offsetX = parentRect ? rect.left - parentRect.left : 0;
    const offsetY = parentRect ? rect.top - parentRect.top : 0;
    this.canvas.style.left = `${offsetX}px`;
    this.canvas.style.top = `${offsetY}px`;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.canvas.width = CPS1_SCREEN_WIDTH;
    this.canvas.height = CPS1_SCREEN_HEIGHT;
  }

  toggle(): void {
    this.enabled = !this.enabled;
    this.canvas.style.display = this.enabled ? "block" : "none";
    console.log(`[hitbox-overlay] ${this.enabled ? "ON" : "OFF"} — press F7 to toggle`);
    if (this.enabled) this.startLoop();
    else this.stopLoop();
  }

  private startLoop(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      this.draw();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private draw(): void {
    const state = this.coach.getLatestState();
    if (!state) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CPS1_SCREEN_WIDTH, CPS1_SCREEN_HEIGHT);
    const cameraX = state.cameraX ?? 0;
    this.drawChar(ctx, state.p1, cameraX);
    this.drawChar(ctx, state.p2, cameraX);
    this.drawDebugText(ctx, state, cameraX);
  }

  /** Reset the dx reference points. Call when the round resets so the
   *  next frame doesn't report a teleport-sized dx. */
  resetSampling(): void {
    this.prevP1X = null;
    this.prevP2X = null;
    this.p1MoveStart = null;
    this.p2MoveStart = null;
    this.p1History = [];
    this.p2History = [];
  }

  private drawDebugText(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    _cameraX: number,
  ): void {
    // Recompute per-frame derivatives only when the CPS1 vblank
    // advanced. On a duplicate sample (same frameIdx seen by two
    // consecutive rAFs) we reuse the last known values — otherwise
    // the HUD would flicker back to 0 and hide short walk bursts /
    // mis-count the move timeline.
    let p1Dx = this.lastP1Dx;
    let p2Dx = this.lastP2Dx;
    if (state.frameIdx !== this.prevFrameIdx) {
      p1Dx = deriveDx(this.prevP1X, state.p1.x);
      p2Dx = deriveDx(this.prevP2X, state.p2.x);
      this.prevP1X = state.p1.x;
      this.prevP2X = state.p2.x;
      const p1Next = updateMoveStart(this.p1MoveStart, state.p1, state.frameIdx);
      const p2Next = updateMoveStart(this.p2MoveStart, state.p2, state.frameIdx);
      recordCompletedMove(this.p1History, this.p1MoveStart, p1Next, state.p1.charId, state.frameIdx);
      recordCompletedMove(this.p2History, this.p2MoveStart, p2Next, state.p2.charId, state.frameIdx);
      this.p1MoveStart = p1Next;
      this.p2MoveStart = p2Next;
      this.prevFrameIdx = state.frameIdx;
      this.lastP1Dx = p1Dx;
      this.lastP2Dx = p2Dx;
    }

    const p1Lines = buildCharLines("P1", state.p1, p1Dx, this.p1MoveStart, state.frameIdx);
    const p2Lines = buildCharLines("P2", state.p2, p2Dx, this.p2MoveStart, state.frameIdx);
    const gapLines = buildGapLines(state);
    const p1History = `P1 recent: ${formatHistory(this.p1History)}`;
    const p2History = `P2 recent: ${formatHistory(this.p2History)}`;
    const lines = [
      ...p1Lines,
      "",
      ...p2Lines,
      "",
      ...gapLines,
      "",
      p1History,
      p2History,
    ];

    // Bottom-left panel with a dark semi-opaque background so the text
    // stays legible over any stage background colour.
    ctx.font = "8px monospace";
    const lineH = 10;
    const padX = 4;
    const padY = 3;
    const panelW = 320;
    const panelH = lines.length * lineH + padY * 2;
    const panelX = 0;
    const panelY = CPS1_SCREEN_HEIGHT - panelH;
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.fillStyle = "rgba(255, 255, 0, 0.95)";
    for (let i = 0; i < lines.length; i++) {
      const y = panelY + padY + (i + 1) * lineH - 2;
      ctx.fillText(lines[i]!, panelX + padX, y);
    }

    // Reference ground line: expected floor screen Y = 240 - 40 = 200.
    const groundY = WORLD_TO_SCREEN_Y_OFFSET - 40;
    ctx.strokeStyle = "rgba(255, 255, 0, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(CPS1_SCREEN_WIDTH, groundY);
    ctx.stroke();
  }

  private drawChar(
    ctx: CanvasRenderingContext2D,
    char: { hurtboxes?: HitboxRect[]; attackbox?: HitboxRect | null; pushbox?: HitboxRect | null },
    cameraX: number,
  ): void {
    const boxes: HitboxRect[] = [];
    if (char.pushbox) boxes.push(char.pushbox);
    if (char.hurtboxes) boxes.push(...char.hurtboxes);
    if (char.attackbox) boxes.push(char.attackbox);
    for (const b of boxes) this.drawRect(ctx, b, cameraX);
  }

  private drawRect(ctx: CanvasRenderingContext2D, box: HitboxRect, cameraX: number): void {
    // World X → screen X: subtract camera. World Y (grows up) → screen Y
    // (grows down): invert around the tuned baseline.
    const screenCx = box.cx - cameraX;
    const screenCy = WORLD_TO_SCREEN_Y_OFFSET - box.cy;
    const x = screenCx - box.halfW;
    const y = screenCy - box.halfH;
    const w = box.halfW * 2;
    const h = box.halfH * 2;
    ctx.fillStyle = COLORS[box.kind];
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS[box.kind].replace(/[\d.]+\)$/, "1.0)");
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  destroy(): void {
    this.stopLoop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.keyListener) {
      window.removeEventListener("keydown", this.keyListener);
      this.keyListener = null;
    }
    this.canvas.remove();
  }
}

/**
 * Build the per-character text block for the HUD. One label line, one
 * pose line, one move line, one delta line. The character's GameState
 * values are mapped into short, aligned strings so the panel stays
 * readable at 8px monospace.
 */
function buildCharLines(
  label: string,
  char: CharacterState | CPUState,
  dx: number,
  moveStart: { animPtr: number; frameIdx: number } | null,
  nowFrame: number,
): string[] {
  const y = (char.posY ?? 40) - 40;
  const posture = derivePosture(char, dx);
  const stateHex = char.stateByte.toString(16).padStart(2, "0").toUpperCase();
  const yokeHex = char.yoke.toString(16).padStart(2, "0").toUpperCase();
  const ptrHex = char.animPtr.toString(16).padStart(8, "0").toUpperCase();
  const moveName = actionForAnimPtr(char.charId, char.animPtr) ?? "-";
  const dxArrow = dx > 0 ? "→" : dx < 0 ? "←" : "=";
  const phaseLine = derivePhaseLine(char, moveStart, nowFrame);
  return [
    `${label} ${char.charId}  x=${char.x} y=${y}`,
    `  posture=${posture}`,
    `  state=0x${stateHex}  yoke=0x${yokeHex}`,
    `  move=${moveName}  ptr=0x${ptrHex}`,
    `  ${phaseLine}`,
    `  dx=${dxArrow}${dx >= 0 ? "+" : ""}${dx}`,
  ];
}

/**
 * Update the anchor used to compute elapsed frames of the current
 * move. Handles three re-anchor cases:
 *   (1) entering an attack state from idle/walk — fresh anchor.
 *   (2) switching to a different catalogued startup animPtr — new move.
 *   (3) the previous move's total frame budget is elapsed and we see
 *       a known startup again — the user repeated the same move (e.g.
 *       auto-fire pressing cLK cLK cLK). Without this case the anchor
 *       would stay on the first press and the counter would grow
 *       unbounded across repeated presses.
 * Returns null when the character is no longer in an attack state.
 */
function updateMoveStart(
  prev: { animPtr: number; frameIdx: number } | null,
  char: CharacterState | CPUState,
  frameIdx: number,
): { animPtr: number; frameIdx: number } | null {
  const inAttackState = char.stateByte === 0x0A || char.stateByte === 0x0C;
  if (!inAttackState) return null;
  const moveName = actionForAnimPtr(char.charId, char.animPtr);
  // Case (1): first frame of attack.
  if (prev === null) {
    return moveName !== null ? { animPtr: char.animPtr, frameIdx } : null;
  }
  // Case (2): animPtr jumped to a different known startup.
  if (moveName !== null && char.animPtr !== prev.animPtr) {
    return { animPtr: char.animPtr, frameIdx };
  }
  // Case (3): same startup animPtr as before AND the previous move's
  // total duration has elapsed — must be a fresh press of the same
  // move (auto-fire loop).
  if (moveName !== null && char.animPtr === prev.animPtr) {
    const prevFd = getFrameData(moveName);
    if (prevFd) {
      const elapsed = frameIdx - prev.frameIdx;
      const total = prevFd.startup + prevFd.active + prevFd.recovery;
      if (elapsed >= total) return { animPtr: char.animPtr, frameIdx };
    }
  }
  // Else: keep prev — we're mid-move on an animPtr that isn't the
  // catalogued startup (SF2HF walks the animation over several ptrs).
  return prev;
}

/**
 * One-line summary of where the current move is in its timeline.
 * Uses the calibrated frame-data (startup / active / recovery) when
 * the move is catalogued, otherwise falls back to the yoke2 bit.
 *
 * Format: `phase=<name> (elapsed f / total f)  recovery_left=N`.
 */
function derivePhaseLine(
  char: CharacterState | CPUState,
  moveStart: { animPtr: number; frameIdx: number } | null,
  nowFrame: number,
): string {
  const inAttackState = char.stateByte === 0x0A || char.stateByte === 0x0C;
  if (!inAttackState) {
    // Not attacking. Show a neutral marker unless the extractor flags
    // isRecovery (yoke2==0x01) which can linger for a frame or two.
    if (char.isRecovery) return "phase=recovery (no move tracked)";
    return "phase=-";
  }
  // Resolve the move name from the startup animPtr anchored at entry,
  // not the current animPtr: SF2HF walks through several animation
  // pointers during a move's lifetime and only the startup is in our
  // lookup table.
  const anchorPtr = moveStart?.animPtr ?? char.animPtr;
  const moveName = actionForAnimPtr(char.charId, anchorPtr);
  const fd = moveName ? getFrameData(moveName) : null;
  if (!moveStart || !fd) {
    // Attack state but no anchor yet or unknown frame data. Fall back
    // to yoke2 — it's the Capcom-authored recovery bit.
    const phase = char.isRecovery ? "recovery" : "startup/active";
    return `phase=${phase} (unknown timing)`;
  }
  const elapsed = nowFrame - moveStart.frameIdx;
  const total = fd.startup + fd.active + fd.recovery;
  const recoveryLeft = Math.max(0, total - elapsed);
  let phase: string;
  if (elapsed < fd.startup) phase = "startup";
  else if (elapsed < fd.startup + fd.active) phase = "active";
  else phase = "recovery";
  return `phase=${phase} (${elapsed}f / ${total}f)  recov_left=${recoveryLeft}`;
}

/**
 * Boil the character's posture down to one short phrase, using
 * SF2HF's FSM byte as the source of truth:
 *   0x00 = idle or walking (disambiguated by dx)
 *   0x02 = crouching (empirically validated from live traces — the
 *          extractor's `isCrouching` derived from a ROM metadata byte
 *          does NOT fire here, so we ignore it)
 *   0x04 = airborne (jump)
 *   0x0A = normal attack
 *   0x0C = special attack
 *   0x0E = hurt
 *
 * Walk has no dedicated state, it's just 0x00 with x moving. We use
 * dx ≥ 1 as the threshold.
 */
function derivePosture(char: CharacterState | CPUState, dx: number): string {
  if (char.isAirborne) {
    const arc = char.yoke === 0x17 ? "neutral" : char.yoke === 0x06 ? "directional" : "airborne";
    return `airborne (${arc})`;
  }
  const st = char.stateByte;
  if (st === 0x0E) return "hurt";
  if (st === 0x0A) return "attacking";
  if (st === 0x0C) return "special";
  if (st === 0x02) return "crouch";
  if (char.isBlocking) return "block";
  if (st === 0x00) {
    if (Math.abs(dx) >= 1) return dx > 0 ? "walk+" : "walk-";
    return "idle";
  }
  return `state 0x${st.toString(16).padStart(2, '0')}`;
}

/**
 * Signed dx between the previous sample and the current x. Returns 0
 * when there is no previous sample, and also when the difference is
 * teleport-sized (round reset, position snap) which would otherwise
 * mis-report motion at the edge of a scene change.
 */
function deriveDx(prev: number | null, current: number): number {
  if (prev === null) return 0;
  const raw = current - prev;
  if (Math.abs(raw) > 30) return 0;
  return raw;
}

/**
 * Geometry summary between the two characters. Shows:
 *   dist     — centre-to-centre horizontal distance (|p1.x - p2.x|).
 *   pushGap  — pushbox horizontal gap (≤0 means the two pushboxes are
 *              touching, i.e. throw range).
 *   p1→p2    — closest signed gap between P1's live attackbox and any
 *              P2 hurtbox. null when P1 has no active attackbox.
 *              Negative = overlapping → the hit is connecting NOW.
 *   p2→p1    — symmetric gap, P2's attackbox vs P1's hurtboxes.
 */
function buildGapLines(state: GameState): string[] {
  const dist = Math.abs(state.p1.x - state.p2.x);
  const pushGap = pushboxHorizontalGap(state.p1, state.p2);
  const p1Atk = state.p1.attackbox
    ? minGapToHurtboxes(state.p1.attackbox, state.p2)
    : null;
  const p2Atk = state.p2.attackbox
    ? minGapToHurtboxes(state.p2.attackbox, state.p1)
    : null;
  return [
    `P1 ↔ P2`,
    `  dist=${dist}  pushGap=${fmtGap(pushGap)}`,
    `  p1→p2 atk=${fmtGap(p1Atk)}  p2→p1 atk=${fmtGap(p2Atk)}`,
  ];
}

function fmtGap(g: number | null): string {
  if (g === null) return "-";
  if (g === 0) return "0";
  return g > 0 ? `+${g.toFixed(0)}` : `${g.toFixed(0)}`;
}

/**
 * Push the previous anchor into the rolling history buffer whenever
 * the anchor transitions: a completed (anchor→null) clear, or a swap
 * to a different anchor (move chained or re-pressed in auto-fire).
 *
 * Duration priority:
 *   (1) canonical frame-data total when the move is catalogued — same
 *       move always prints the same number (cLK always 11f, etc.).
 *   (2) observed wall-clock elapsed otherwise — jittery but better
 *       than nothing for uncatalogued moves.
 */
function recordCompletedMove(
  history: Array<{ name: string; frames: number }>,
  prev: { animPtr: number; frameIdx: number } | null,
  next: { animPtr: number; frameIdx: number } | null,
  charId: string,
  nowFrame: number,
): void {
  if (prev === null) return;
  const sameAnchor = next !== null
    && next.animPtr === prev.animPtr
    && next.frameIdx === prev.frameIdx;
  if (sameAnchor) return;
  const name = actionForAnimPtr(charId as never, prev.animPtr) ?? "?";
  const fd = name !== "?" ? getFrameData(name as never) : null;
  const frames = fd
    ? fd.startup + fd.active + fd.recovery
    : Math.max(0, nowFrame - prev.frameIdx);
  history.unshift({ name, frames });
  if (history.length > 5) history.length = 5;
}

/**
 * Render the rolling history as a compact one-liner, newest first.
 * Empty placeholder when no move has finished yet. Space-separated,
 * short aliases, parens around the actual frame duration.
 */
function formatHistory(entries: readonly { name: string; frames: number }[]): string {
  if (entries.length === 0) return "-";
  return entries
    .slice(0, 5)
    .map((e) => `${shortMoveName(e.name)}(${e.frames})`)
    .join(" ");
}

/** Compact alias for move names so the history line fits the panel. */
function shortMoveName(name: string): string {
  const map: Record<string, string> = {
    crouch_jab: "cLP",
    crouch_short: "cLK",
    crouch_strong: "cMP",
    crouch_mk: "cMK",
    crouch_fierce: "cHP",
    sweep: "swp",
    standing_jab: "sLP",
    standing_strong: "sMP",
    standing_fierce: "sHP",
    standing_short: "sLK",
    standing_forward: "sMK",
    standing_rh: "sHK",
    hadouken_jab: "HadLP",
    hadouken_strong: "HadMP",
    hadouken_fierce: "HadHP",
    shoryu_jab: "DpLP",
    shoryu_strong: "DpMP",
    shoryu_fierce: "DpHP",
    tatsu_lk: "TatLK",
    tatsu_mk: "TatMK",
    tatsu_hk: "TatHK",
  };
  return map[name] ?? name;
}
