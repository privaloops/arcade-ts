import { describe, it, expect } from 'vitest';
import type { CaptureSession } from '../editor/capture-session';

/**
 * CaptureManager requires Emulator + SpriteEditor — not unit-testable.
 * CaptureSession is a plain interface used by CaptureManager.
 * We validate the type contract and factory behavior only.
 */

function createSession(refTileCount = 0): CaptureSession {
  return {
    poses: [],
    seenHashes: new Set<string>(),
    refTileCount,
    lastCenterX: -1,
    lastCenterY: -1,
    prevPoseCount: 0,
  };
}

describe('CaptureSession type contract', () => {
  it('conforms to the CaptureSession interface', () => {
    const session: CaptureSession = createSession();
    expect(session.poses).toBeInstanceOf(Array);
    expect(session.seenHashes).toBeInstanceOf(Set);
    expect(typeof session.refTileCount).toBe('number');
  });

  it('stores refTileCount for character size matching', () => {
    const session = createSession(6);
    expect(session.refTileCount).toBe(6);
  });

  it('default refTileCount is 0', () => {
    const session = createSession();
    expect(session.refTileCount).toBe(0);
  });
});
