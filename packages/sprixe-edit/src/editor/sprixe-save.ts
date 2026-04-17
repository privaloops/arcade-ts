/**
 * Sprixe Save/Load — .sprixe file format.
 *
 * Serializes ROM edits as sparse diffs + captured pose refs to a JSON file.
 * Previews are NOT stored — they are rebuilt from GFX ROM on load.
 */

import type { RomStore, DiffEntry, RomDiffs } from '@sprixe/engine/rom-store';
import type { CapturedPose, SpriteGroup } from './sprite-analyzer';
import { assembleCharacter, poseHash } from './sprite-analyzer';
import { readPalette } from './palette-editor';

// ---------------------------------------------------------------------------
// File format types
// ---------------------------------------------------------------------------

interface DiffEntrySerialized {
  offset: number;
  bytes: string; // base64
}

interface PoseEntrySerialized {
  palette: number;
  tiles: Array<{
    relX: number;
    relY: number;
    mappedCode: number;
    flipX: boolean;
    flipY: boolean;
  }>;
}

interface SprixeFile {
  version: 1;
  gameName: string;
  createdAt: string;
  modifiedAt: string;
  diffs: {
    graphics: DiffEntrySerialized[];
    program: DiffEntrySerialized[];
    oki: DiffEntrySerialized[];
  };
  poses: PoseEntrySerialized[];
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

function serializeDiffs(entries: DiffEntry[]): DiffEntrySerialized[] {
  return entries.map(e => ({ offset: e.offset, bytes: uint8ToBase64(e.bytes) }));
}

function serializePoses(poses: CapturedPose[]): PoseEntrySerialized[] {
  return poses.map(p => ({
    palette: p.palette,
    tiles: p.tiles.map(t => ({
      relX: t.relX,
      relY: t.relY,
      mappedCode: t.mappedCode,
      flipX: t.flipX,
      flipY: t.flipY,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Deserialize
// ---------------------------------------------------------------------------

function deserializeDiffs(entries: DiffEntrySerialized[]): DiffEntry[] {
  return entries.map(e => ({ offset: e.offset, bytes: base64ToUint8(e.bytes) }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the .sprixe JSON content from current RomStore state + poses.
 */
export function buildSaveData(
  romStore: RomStore,
  poses: CapturedPose[],
  existingCreatedAt?: string,
): SprixeFile {
  const diffs = romStore.computeDiffs();
  const now = new Date().toISOString();
  return {
    version: 1,
    gameName: romStore.name,
    createdAt: existingCreatedAt ?? now,
    modifiedAt: now,
    diffs: {
      graphics: serializeDiffs(diffs.graphics),
      program: serializeDiffs(diffs.program),
      oki: serializeDiffs(diffs.oki),
    },
    poses: serializePoses(poses),
  };
}

/**
 * Export a .sprixe file (triggers browser download).
 */
export function exportSaveFile(
  romStore: RomStore,
  poses: CapturedPose[],
  filename?: string,
  existingCreatedAt?: string,
): void {
  const data = buildSaveData(romStore, poses, existingCreatedAt);
  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `${romStore.name}.sprixe`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse and validate a .sprixe file.
 * Returns null with an error message if invalid.
 */
export function parseSaveFile(json: string): { data: SprixeFile } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: 'Fichier .sprixe invalide (JSON malformé)' };
  }

  const file = parsed as SprixeFile;
  if (file.version !== 1) {
    return { error: `Version de fichier non supportée : ${file.version}` };
  }
  if (!file.gameName || !file.diffs) {
    return { error: 'Fichier .sprixe incomplet' };
  }
  return { data: file };
}

/**
 * Apply a parsed .sprixe file to a RomStore.
 * Returns the restored poses (with rebuilt previews).
 */
export function applySaveFile(
  file: SprixeFile,
  romStore: RomStore,
  vram: Uint8Array,
  paletteBase: number,
): { poses: CapturedPose[] } | { error: string } {
  if (file.gameName !== romStore.name) {
    return { error: `Ce fichier est pour ${file.gameName}, pas pour ${romStore.name}` };
  }

  // Apply diffs
  const diffs: RomDiffs = {
    graphics: deserializeDiffs(file.diffs.graphics),
    program: deserializeDiffs(file.diffs.program),
    oki: deserializeDiffs(file.diffs.oki),
  };
  romStore.applyDiffs(diffs);

  // Rebuild poses with previews
  const poses: CapturedPose[] = file.poses.map(p => {
    const maxX = Math.max(...p.tiles.map(t => t.relX));
    const maxY = Math.max(...p.tiles.map(t => t.relY));
    const w = maxX + 16;
    const h = maxY + 16;

    const palette = readPalette(vram, paletteBase, p.palette);
    // Add palette to tiles (not stored in save file, use the pose palette)
    const tiles = p.tiles.map(t => ({ ...t, palette: p.palette }));
    const group: SpriteGroup = {
      sprites: [],
      palette: p.palette,
      bounds: { x: 0, y: 0, w, h },
      tiles,
    };
    const preview = assembleCharacter(romStore.graphicsRom, group, palette);

    return {
      tileHash: poseHash(group),
      tiles,
      w,
      h,
      palette: p.palette,
      preview,
    };
  });

  return { poses };
}
