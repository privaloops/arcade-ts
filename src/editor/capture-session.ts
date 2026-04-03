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
  /** Last known center position for spatial tracking */
  lastCenterX: number;
  lastCenterY: number;
  /** Existing LayerGroup being resumed */
  resumeTarget?: LayerGroup;
  /** Number of poses in the group before this session started */
  prevPoseCount: number;
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

  constructor(
    private readonly emulator: Emulator,
    private readonly editor: SpriteEditor,
    private readonly layerGroups: LayerGroup[],
    private readonly onRefresh: () => void,
  ) {}

  // -- Sprite capture --

  /** Toggle capture for the sprite at the given OBJ index (click-to-track). */
  toggleCaptureForSprite(spriteIndex: number): void {
    const video = this.emulator.getVideo();
    if (!video) return;

    const allSprites = readAllSprites(video);
    const clicked = allSprites.find(s => s.index === spriteIndex);
    if (!clicked) return;
    const palette = clicked.palette;

    const group = groupCharacter(allSprites, spriteIndex, palette);
    if (!group) return;

    if (this.activeSessions.has(palette)) {
      this.stopCaptureForPalette(palette);
    } else {
      const cx = group.bounds.x + group.bounds.w / 2;
      const cy = group.bounds.y + group.bounds.h / 2;
      // Resume existing group: pre-seed seenHashes and append poses live
      const existing = this.layerGroups.find(
        g => g.type === 'sprite' && g.spriteCapture?.palette === palette,
      );
      const seenHashes = new Set<string>(
        existing?.spriteCapture?.poses.map(p => p.tileHash) ?? [],
      );
      const existingPoses = existing?.spriteCapture?.poses ?? [];
      const session: CaptureSession = {
        poses: existingPoses,
        seenHashes,
        refTileCount: group.sprites.length,
        lastCenterX: cx, lastCenterY: cy,
        prevPoseCount: existingPoses.length,
      };
      if (existing) session.resumeTarget = existing;
      this.activeSessions.set(palette, session);
      this.captureGroupsForPalette(video, palette);
      const msg = existing ? `Resuming capture (palette ${palette})` : `Recording sprite (palette ${palette})`;
      showToast(msg, true);
    }

    this.onRefresh();
  }

  /** Stop capture for a specific palette and save the group. */
  stopCaptureForPalette(palette: number): void {
    const session = this.activeSessions.get(palette);
    if (!session) return;
    this.activeSessions.delete(palette);

    const newPoses = session.poses.length - session.prevPoseCount;

    if (session.resumeTarget) {
      // Resume mode: poses were appended live to the existing group
      const name = session.resumeTarget.name;
      if (newPoses > 0) {
        showToast(`+${newPoses} pose${newPoses !== 1 ? 's' : ''} → ${name} (${session.poses.length} total)`, true);
      } else {
        showToast(`No new poses → ${name}`, false);
      }
    } else if (newPoses > 0) {
      this.captureCounter++;
      const name = `Sprite #${this.captureCounter}`;
      this.layerGroups.push(createSpriteGroup(name, session.poses, palette));
      showToast(`Captured ${newPoses} pose${newPoses !== 1 ? 's' : ''} → ${name}`, true);
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

    if (this.activeSessions.size === 0) return;

    let changed = false;
    for (const palette of this.activeSessions.keys()) {
      if (this.captureGroupsForPalette(video, palette)) changed = true;
    }

    if (changed) this.onRefresh();
  }

  /** Minimum sprite count to consider a group (filters HUD/text fragments) */
  private static readonly MIN_TILE_COUNT = 4;

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
      if (visited.has(sprite.uid)) continue;
      // Mono-palette grouping: only follow tiles of the target palette
      const group = groupCharacter(allSprites, sprite.index, palette);
      if (!group) continue;
      for (const s of group.sprites) visited.add(s.uid);
      if (group.sprites.length >= CaptureManager.MIN_TILE_COUNT) {
        groups.push(group);
      }
    }

    if (groups.length === 0) return false;

    let bestGroup: SpriteGroupData | null = null;

    if (session.lastCenterX >= 0 && session.lastCenterY >= 0) {
      // Spatial tracking: pick the group closest to the last known center
      let bestDist = Infinity;
      for (const g of groups) {
        const cx = g.bounds.x + g.bounds.w / 2;
        const cy = g.bounds.y + g.bounds.h / 2;
        const dist = (cx - session.lastCenterX) ** 2 + (cy - session.lastCenterY) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestGroup = g;
        }
      }
    } else {
      // Fallback (all-capture mode): pick the largest group
      let bestSize = 0;
      for (const g of groups) {
        if (g.sprites.length > bestSize) {
          bestSize = g.sprites.length;
          bestGroup = g;
        }
      }
    }

    if (!bestGroup) return false;

    // Update tracking position
    session.lastCenterX = bestGroup.bounds.x + bestGroup.bounds.w / 2;
    session.lastCenterY = bestGroup.bounds.y + bestGroup.bounds.h / 2;

    const hash = poseHash(bestGroup);
    if (session.seenHashes.has(hash)) return false;
    session.seenHashes.add(hash);

    const paletteBase = video.getPaletteBase();
    const pal = readPalette(bufs.vram, paletteBase, palette);
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
