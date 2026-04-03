import { describe, it, expect } from 'vitest';
import { groupCharacter, poseHash } from '../editor/sprite-analyzer';
import type { ObjSprite, SpriteGroup } from '../editor/sprite-analyzer';

let _nextUid = 0;
function makeSprite(overrides: Partial<ObjSprite> & { index: number }): ObjSprite {
  return {
    uid: _nextUid++,
    screenX: 0,
    screenY: 0,
    rawCode: 0,
    mappedCode: 0,
    palette: 0,
    flipX: false,
    flipY: false,
    ...overrides,
  };
}

describe('poseHash', () => {
  it('identical tile codes produce the same hash', () => {
    const group1: SpriteGroup = {
      sprites: [],
      palette: 1,
      bounds: { x: 0, y: 0, w: 32, h: 32 },
      tiles: [
        { relX: 0, relY: 0, mappedCode: 100, flipX: false, flipY: false, palette: 1 },
        { relX: 16, relY: 0, mappedCode: 200, flipX: false, flipY: false, palette: 1 },
      ],
    };
    const group2: SpriteGroup = {
      sprites: [],
      palette: 1,
      bounds: { x: 50, y: 50, w: 32, h: 32 },
      tiles: [
        { relX: 0, relY: 0, mappedCode: 100, flipX: true, flipY: false, palette: 1 },
        { relX: 16, relY: 0, mappedCode: 200, flipX: false, flipY: true, palette: 1 },
      ],
    };

    expect(poseHash(group1)).toBe(poseHash(group2));
  });

  it('different tile codes produce different hashes', () => {
    const group1: SpriteGroup = {
      sprites: [], palette: 1,
      bounds: { x: 0, y: 0, w: 16, h: 16 },
      tiles: [{ relX: 0, relY: 0, mappedCode: 100, flipX: false, flipY: false, palette: 1 }],
    };
    const group2: SpriteGroup = {
      sprites: [], palette: 1,
      bounds: { x: 0, y: 0, w: 16, h: 16 },
      tiles: [{ relX: 0, relY: 0, mappedCode: 101, flipX: false, flipY: false, palette: 1 }],
    };

    expect(poseHash(group1)).not.toBe(poseHash(group2));
  });

  it('hash is order-independent (sorted codes)', () => {
    const group1: SpriteGroup = {
      sprites: [], palette: 0,
      bounds: { x: 0, y: 0, w: 32, h: 16 },
      tiles: [
        { relX: 0, relY: 0, mappedCode: 50, flipX: false, flipY: false, palette: 0 },
        { relX: 16, relY: 0, mappedCode: 30, flipX: false, flipY: false, palette: 0 },
      ],
    };
    const group2: SpriteGroup = {
      sprites: [], palette: 0,
      bounds: { x: 0, y: 0, w: 32, h: 16 },
      tiles: [
        { relX: 0, relY: 0, mappedCode: 30, flipX: false, flipY: false, palette: 0 },
        { relX: 16, relY: 0, mappedCode: 50, flipX: false, flipY: false, palette: 0 },
      ],
    };

    expect(poseHash(group1)).toBe(poseHash(group2));
  });
});

describe('groupCharacter', () => {
  it('groups adjacent sprites with same palette', () => {
    const sprites: ObjSprite[] = [
      makeSprite({ index: 0, screenX: 100, screenY: 100, palette: 5, mappedCode: 10 }),
      makeSprite({ index: 1, screenX: 116, screenY: 100, palette: 5, mappedCode: 11 }), // adjacent right
      makeSprite({ index: 2, screenX: 100, screenY: 116, palette: 5, mappedCode: 12 }), // adjacent below
    ];

    const group = groupCharacter(sprites, 0);
    expect(group).not.toBeNull();
    expect(group!.sprites.length).toBe(3);
    expect(group!.palette).toBe(5);
  });

  it('groups adjacent sprites across palettes without filter', () => {
    const sprites: ObjSprite[] = [
      makeSprite({ index: 0, screenX: 100, screenY: 100, palette: 5, mappedCode: 10 }),
      makeSprite({ index: 1, screenX: 116, screenY: 100, palette: 6, mappedCode: 11 }),
    ];

    const group = groupCharacter(sprites, 0);
    expect(group).not.toBeNull();
    expect(group!.sprites.length).toBe(2);
    expect(group!.palette).toBe(5);
  });

  it('excludes other palettes when filterPalette is set', () => {
    const sprites: ObjSprite[] = [
      makeSprite({ index: 0, screenX: 100, screenY: 100, palette: 5, mappedCode: 10 }),
      makeSprite({ index: 1, screenX: 116, screenY: 100, palette: 6, mappedCode: 11 }),
      makeSprite({ index: 2, screenX: 132, screenY: 100, palette: 5, mappedCode: 12 }),
    ];

    // Without filter: all 3 grouped (cross-palette flood-fill)
    const all = groupCharacter(sprites, 0);
    expect(all!.sprites.length).toBe(3);

    // With filter: only palette 5 tiles, and sprite at 132 is not adjacent
    // to sprite at 100 without the palette 6 bridge at 116
    const mono = groupCharacter(sprites, 0, 5);
    expect(mono!.sprites.length).toBe(1);
    expect(mono!.tiles.every(t => t.palette === 5)).toBe(true);
  });

  it('does not group distant sprites even with same palette', () => {
    const sprites: ObjSprite[] = [
      makeSprite({ index: 0, screenX: 0, screenY: 0, palette: 5, mappedCode: 10 }),
      makeSprite({ index: 1, screenX: 200, screenY: 200, palette: 5, mappedCode: 11 }),
    ];

    const group = groupCharacter(sprites, 0);
    expect(group).not.toBeNull();
    expect(group!.sprites.length).toBe(1);
  });

  it('computes correct bounding box', () => {
    const sprites: ObjSprite[] = [
      makeSprite({ index: 0, screenX: 50, screenY: 100, palette: 1, mappedCode: 10 }),
      makeSprite({ index: 1, screenX: 66, screenY: 100, palette: 1, mappedCode: 11 }),
    ];

    const group = groupCharacter(sprites, 0);
    expect(group).not.toBeNull();
    expect(group!.bounds.x).toBe(50);
    expect(group!.bounds.y).toBe(100);
    expect(group!.bounds.w).toBe(32); // 66+16 - 50
    expect(group!.bounds.h).toBe(16);
  });

  it('tiles have correct relative positions', () => {
    const sprites: ObjSprite[] = [
      makeSprite({ index: 0, screenX: 50, screenY: 100, palette: 1, mappedCode: 10 }),
      makeSprite({ index: 1, screenX: 66, screenY: 100, palette: 1, mappedCode: 11 }),
    ];

    const group = groupCharacter(sprites, 0);
    const tiles = group!.tiles;
    expect(tiles.length).toBe(2);

    const tile0 = tiles.find(t => t.mappedCode === 10)!;
    expect(tile0.relX).toBe(0);
    expect(tile0.relY).toBe(0);

    const tile1 = tiles.find(t => t.mappedCode === 11)!;
    expect(tile1.relX).toBe(16);
    expect(tile1.relY).toBe(0);
  });

  it('returns null for non-existent sprite index', () => {
    const sprites: ObjSprite[] = [
      makeSprite({ index: 0, screenX: 0, screenY: 0, palette: 1, mappedCode: 10 }),
    ];

    expect(groupCharacter(sprites, 99)).toBeNull();
  });

  it('flood-fills through chain of adjacent sprites', () => {
    // A--B--C chain (each 16px wide, touching)
    const sprites: ObjSprite[] = [
      makeSprite({ index: 0, screenX: 0, screenY: 0, palette: 1, mappedCode: 10 }),
      makeSprite({ index: 1, screenX: 16, screenY: 0, palette: 1, mappedCode: 11 }),
      makeSprite({ index: 2, screenX: 32, screenY: 0, palette: 1, mappedCode: 12 }),
    ];

    // Click on first sprite — should find all 3 through flood-fill
    const group = groupCharacter(sprites, 0);
    expect(group!.sprites.length).toBe(3);
  });
});
