import { nodeId } from '@storystage/ast';
import { basisFor } from '@storystage/check';
import { exampleProduction, type Frame, type Production } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import {
  NONE_REHEARSED,
  frameProgress,
  framesReached,
  isCoded,
  isStaged,
  withRehearsed,
} from './frameProgress.ts';

// A frame's status on the strip (07-ux 2.3): Planned, Staged, Coded, Rehearsed, then the check's.

const p = exampleProduction();
const first = p.frames.find((f) => f.scene === p.scenes[0]!.id)!;

/** The example with frame `first` changed. */
const withFrame = (change: Partial<Frame>, base: Production = p): Production => ({
  ...base,
  frames: base.frames.map((f) => (f.id === first.id ? { ...f, ...change } : f)),
});
const frameIn = (q: Production) => q.frames.find((f) => f.id === first.id)!;

describe('a frame’s status', () => {
  it('is Coded when it links to a block that’s still in the program', () => {
    expect(isCoded(p, first)).toBe(true);
    expect(frameProgress(p, first, NONE_REHEARSED)).toBe('coded');
    const unlinked = withFrame({ links: [] });
    expect(isCoded(unlinked, frameIn(unlinked))).toBe(false);
    const gone = withFrame({ links: [nodeId('nowhere')] });
    expect(isCoded(gone, frameIn(gone))).toBe(false);
  });

  it('is Staged when every character it sketches is on the stage', () => {
    const unlinked = withFrame({ links: [] });
    expect(isStaged(unlinked, frameIn(unlinked))).toBe(true);
    expect(frameProgress(unlinked, frameIn(unlinked), NONE_REHEARSED)).toBe('staged');
    // The cast's penguin sketched, but the stage emptied: back to Planned.
    const empty: Production = {
      ...unlinked,
      scenes: unlinked.scenes.map((s) =>
        s.id === first.scene ? { ...s, setup: { ...s.setup, objects: [] } } : s,
      ),
    };
    expect(isStaged(empty, frameIn(empty))).toBe(false);
    expect(frameProgress(empty, frameIn(empty), NONE_REHEARSED)).toBe('planned');
  });

  it('is Rehearsed once a run reaches it, until something it depends on changes', () => {
    const rehearsed = withRehearsed(NONE_REHEARSED, p, [first]);
    expect(frameProgress(p, first, rehearsed)).toBe('rehearsed');
    const moved = withFrame({ lengthSeconds: first.lengthSeconds + 1 });
    expect(frameProgress(moved, frameIn(moved), rehearsed)).toBe('coded');
  });

  it('gives back the same map when nothing new was reached', () => {
    const once = withRehearsed(NONE_REHEARSED, p, [first]);
    expect(withRehearsed(once, p, [first])).toBe(once);
    expect(withRehearsed(once, p, [])).toBe(once);
  });

  it('shows the check’s Checked or Look at while its result stands', () => {
    const items = [
      {
        id: 'onScreen:penguin',
        kind: 'onScreen',
        outcome: 'flag',
        words: 'Penguin isn’t on screen',
      },
    ] as NonNullable<Frame['check']>['items'];
    const flagged = withFrame({ check: { basis: basisFor(p, first), items, kept: [] } });
    expect(frameProgress(flagged, frameIn(flagged), NONE_REHEARSED)).toBe('lookAt');
    const kept = withFrame({
      check: { basis: basisFor(p, first), items, kept: ['onScreen:penguin'] },
    });
    expect(frameProgress(kept, frameIn(kept), NONE_REHEARSED)).toBe('checked');
    // A stale result: the studio's own status shows.
    const stale = withFrame({ check: { basis: 'old', items, kept: [] } });
    expect(frameProgress(stale, frameIn(stale), NONE_REHEARSED)).toBe('coded');
  });
});

describe('framesReached', () => {
  it('reaches a frame when one of its blocks ran, and an unlinked one at the scene’s end', () => {
    const unlinked = withFrame({ links: [] });
    const scene = first.scene;
    const ran = new Set(p.frames.filter((f) => f.scene === scene).flatMap((f) => f.links));
    expect(framesReached(p, scene, ran, false).map((f) => f.id)).toContain(first.id);
    expect(framesReached(unlinked, scene, new Set(), false).map((f) => f.id)).not.toContain(
      first.id,
    );
    expect(framesReached(unlinked, scene, new Set(), true).map((f) => f.id)).toContain(first.id);
  });
});
