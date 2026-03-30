/**
 * CaptureManager — manages sprite pose capture and scroll tile capture sessions.
 *
 * Extracted from SpriteEditorUI to isolate per-frame capture logic from UI.
 */

import type { Emulator } from '../emulator';
import type { SpriteEditor } from './sprite-editor';
import type { CPS1Video } from '../video/cps1-video';
import type { CapturedPose, SpriteGroup as SpriteGroupData } from './sprite-analyzer';
import type { LayerGroup } from './layer-model';
import type { ScrollCaptureSession, ScrollSet } from './scroll-capture';
import { readAllSprites, groupCharacter, poseHash, capturePose } from './sprite-analyzer';
import { readPalette } from './palette-editor';
import { createSpriteGroup } from './layer-model';
import { createScrollSession, captureScrollFrame, buildScrollSets, scrollLayerName } from './scroll-capture';
import { showToast } from '../ui/toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaptureSession {
  poses: CapturedPose[];
  seenHashes: Set<string>;
  refTileCount: number;
}

// ---------------------------------------------------------------------------
// CaptureManager
// ---------------------------------------------------------------------------

export class CaptureManager {
  /** Active sprite capture sessions keyed by palette index. */
  readonly activeSessions = new Map<number, CaptureSession>();
  /** Active scroll capture sessions keyed by layerId. */
  readonly scrollSessions = new Map<number, ScrollCaptureSession>();
  /** Completed scroll sets from finished capture sessions. */
  readonly scrollSets: ScrollSet[] = [];

  private scrollTickCounter = 0;
  private captureCounter = 0;
  allSpriteCaptureActive = false;

  constructor(
    private readonly emulator: Emulator,
    private readonly editor: SpriteEditor,
    private readonly layerGroups: LayerGroup[],
    private readonly onRefresh: () => void,
  ) {}

  // -- Sprite capture --

  /** Toggle capture of ALL sprite palettes (called from REC button in layer panel). */
  toggleAllSpriteCapture(): void {
    if (this.allSpriteCaptureActive) {
      this.stopAllCaptures();
      this.allSpriteCaptureActive = false;
      this.onRefresh();
      showToast('Sprite capture stopped', true);
    } else {
      this.allSpriteCaptureActive = true;
      showToast('Recording all sprites — play the game to capture poses', true);
    }
  }

  /** Toggle capture for the sprite at the given OBJ index. */
  toggleCaptureForSprite(spriteIndex: number): void {
    const video = this.emulator.getVideo();
    if (!video) return;

    const allSprites = readAllSprites(video);
    const group = groupCharacter(allSprites, spriteIndex);
    if (!group) return;

    const palette = group.palette;

    if (this.activeSessions.has(palette)) {
      this.stopCaptureForPalette(palette);
    } else {
      this.activeSessions.set(palette, { poses: [], seenHashes: new Set<string>(), refTileCount: group.sprites.length });
      this.captureGroupsForPalette(video, palette);
      showToast(`Recording sprite (palette ${palette})`, true);
    }

    this.onRefresh();
  }

  /** Stop capture for a specific palette and save the group. */
  private stopCaptureForPalette(palette: number): void {
    const session = this.activeSessions.get(palette);
    if (!session) return;
    this.activeSessions.delete(palette);

    if (session.poses.length > 0) {
      this.captureCounter++;
      const name = `Sprite #${this.captureCounter}`;
      this.layerGroups.push(createSpriteGroup(name, session.poses, palette));
      showToast(`Captured ${session.poses.length} pose${session.poses.length !== 1 ? 's' : ''} → ${name}`, true);
    } else {
      showToast('No poses captured', false);
    }

    this.onRefresh();
  }

  /** Stop all active sprite captures. */
  stopAllCaptures(): void {
    for (const palette of [...this.activeSessions.keys()]) {
      this.stopCaptureForPalette(palette);
    }
  }

  /**
   * Called every frame from the overlay loop. Captures unique poses
   * for all active palette sessions.
   */
  captureFrame(): void {
    const video = this.emulator.getVideo();
    if (!video) return;

    // Auto-capture all sprite palettes when REC Sprites is active
    if (this.allSpriteCaptureActive) {
      const allSprites = readAllSprites(video);
      const visiblePalettes = new Set(allSprites.map(s => s.palette));
      for (const pal of visiblePalettes) {
        if (!this.activeSessions.has(pal)) {
          this.activeSessions.set(pal, { poses: [], seenHashes: new Set<string>(), refTileCount: 0 });
        }
      }
    }

    if (this.activeSessions.size === 0) return;

    let changed = false;
    for (const palette of this.activeSessions.keys()) {
      if (this.captureGroupsForPalette(video, palette)) changed = true;
    }

    if (changed) this.onRefresh();
  }

  /** Capture all connected sprite groups for a palette. Returns true if new poses were found. */
  private captureGroupsForPalette(video: CPS1Video, palette: number): boolean {
    const session = this.activeSessions.get(palette);
    if (!session) return false;

    const allSprites = readAllSprites(video);
    const samePalette = allSprites.filter(s => s.palette === palette);
    if (samePalette.length === 0) return false;

    const gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return false;
    const bufs = this.emulator.getBusBuffers();

    const visited = new Set<number>();
    const groups: SpriteGroupData[] = [];
    for (const sprite of samePalette) {
      if (visited.has(sprite.index)) continue;
      const group = groupCharacter(allSprites, sprite.index);
      if (!group) continue;
      for (const s of group.sprites) visited.add(s.index);
      groups.push(group);
    }

    if (groups.length === 0) return false;

    const ref = session.refTileCount;
    let bestGroup: SpriteGroupData | null = null;
    let bestDiff = Infinity;
    for (const g of groups) {
      const diff = Math.abs(g.sprites.length - ref);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestGroup = g;
      }
    }

    if (!bestGroup) return false;

    const hash = poseHash(bestGroup);
    if (session.seenHashes.has(hash)) return false;
    session.seenHashes.add(hash);

    const pal = readPalette(bufs.vram, video.getPaletteBase(), bestGroup.palette);
    session.poses.push(capturePose(gfxRom, bestGroup, pal));
    return true;
  }

  // -- Scroll capture --

  /** Toggle scroll capture from the layer panel REC button. */
  toggleScrollCaptureFromPanel(layerId: number): void {
    if (this.scrollSessions.has(layerId)) {
      const session = this.scrollSessions.get(layerId)!;
      this.scrollSessions.delete(layerId);
      const sets = buildScrollSets(session);
      this.scrollSets.push(...sets);
      this.onRefresh();
      showToast(`Captured ${session.tileMap.size} tiles → ${sets.length} scroll set(s)`, true);
    } else {
      const session = createScrollSession(layerId);
      this.scrollSessions.set(layerId, session);
      showToast(`Recording ${scrollLayerName(layerId)} — scroll around to capture`, true);
    }
  }

  /** Called each frame to capture scroll tiles for active sessions. */
  captureScrollTick(): void {
    const video = this.emulator.getVideo();
    if (!video) return;
    const bufs = this.emulator.getBusBuffers();
    const paletteBase = video.getPaletteBase();
    for (const session of this.scrollSessions.values()) {
      captureScrollFrame(session, video, bufs.vram, paletteBase);
    }
    if (this.scrollSessions.size > 0 && ++this.scrollTickCounter >= 60) {
      this.scrollTickCounter = 0;
      this.onRefresh();
    }
  }
}
