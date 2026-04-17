import { describe, it, expect } from 'vitest';
import { createScrollSession, buildScrollSets, scrollLayerName } from '../editor/scroll-capture';
import type { ScrollTile } from '../editor/scroll-capture';
import { LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3 } from '@sprixe/engine/video/cps1-video';

function makeTile(overrides: Partial<ScrollTile> & { absX: number; absY: number }): ScrollTile {
  return {
    tileCode: 1,
    tileCol: 0,
    tileRow: 0,
    palette: 0,
    flipX: false,
    flipY: false,
    tileW: 16,
    tileH: 16,
    charSize: 128,
    rawCode: 1,
    ...overrides,
  };
}

describe('createScrollSession', () => {
  it('creates session for scroll1 with tileW=8', () => {
    const session = createScrollSession(LAYER_SCROLL1);
    expect(session.layerId).toBe(LAYER_SCROLL1);
    expect(session.tileW).toBe(8);
    expect(session.tileH).toBe(8);
    expect(session.tileMap.size).toBe(0);
  });

  it('creates session for scroll2 with tileW=16', () => {
    const session = createScrollSession(LAYER_SCROLL2);
    expect(session.tileW).toBe(16);
    expect(session.tileH).toBe(16);
  });

  it('creates session for scroll3 with tileW=32', () => {
    const session = createScrollSession(LAYER_SCROLL3);
    expect(session.tileW).toBe(32);
    expect(session.tileH).toBe(32);
  });
});

describe('buildScrollSets', () => {
  it('groups tiles by palette into separate ScrollSets', () => {
    const session = createScrollSession(LAYER_SCROLL2);
    session.tileMap.set('0,0', makeTile({ absX: 0, absY: 0, palette: 1, tileCode: 10 }));
    session.tileMap.set('16,0', makeTile({ absX: 16, absY: 0, palette: 1, tileCode: 11 }));
    session.tileMap.set('0,16', makeTile({ absX: 0, absY: 16, palette: 2, tileCode: 20 }));

    const sets = buildScrollSets(session);

    expect(sets.length).toBe(2);
    const pal1 = sets.find(s => s.palette === 1)!;
    const pal2 = sets.find(s => s.palette === 2)!;
    expect(pal1.tiles.length).toBe(2);
    expect(pal2.tiles.length).toBe(1);
  });

  it('sets are sorted by palette index', () => {
    const session = createScrollSession(LAYER_SCROLL2);
    session.tileMap.set('0,0', makeTile({ absX: 0, absY: 0, palette: 5 }));
    session.tileMap.set('16,0', makeTile({ absX: 16, absY: 0, palette: 2 }));
    session.tileMap.set('32,0', makeTile({ absX: 32, absY: 0, palette: 8 }));

    const sets = buildScrollSets(session);
    expect(sets.map(s => s.palette)).toEqual([2, 5, 8]);
  });

  it('empty session produces no sets', () => {
    const session = createScrollSession(LAYER_SCROLL2);
    expect(buildScrollSets(session)).toEqual([]);
  });

  it('sets have no capturedColors when VRAM not provided', () => {
    const session = createScrollSession(LAYER_SCROLL2);
    session.tileMap.set('0,0', makeTile({ absX: 0, absY: 0, palette: 3 }));

    const sets = buildScrollSets(session);
    expect(sets[0]!.capturedColors).toBeUndefined();
  });

  it('sets carry correct layerId and tile dimensions', () => {
    const session = createScrollSession(LAYER_SCROLL3);
    session.tileMap.set('0,0', makeTile({ absX: 0, absY: 0, palette: 0, tileW: 32, tileH: 32 }));

    const sets = buildScrollSets(session);
    expect(sets[0]!.layerId).toBe(LAYER_SCROLL3);
    expect(sets[0]!.tileW).toBe(32);
    expect(sets[0]!.tileH).toBe(32);
  });
});

describe('scrollLayerName', () => {
  it('returns correct names for each layer', () => {
    expect(scrollLayerName(LAYER_SCROLL1)).toBe('Scroll 1 (8×8)');
    expect(scrollLayerName(LAYER_SCROLL2)).toBe('Scroll 2 (16×16)');
    expect(scrollLayerName(LAYER_SCROLL3)).toBe('Scroll 3 (32×32)');
  });

  it('returns fallback for unknown layer', () => {
    expect(scrollLayerName(99)).toBe('Layer 99');
  });
});
