// @vitest-environment node
import {
  checkReferences,
  exampleProduction,
  frameId,
  sceneId,
  type FrameId,
} from '@storystage/production';
import { describe, expect, it } from 'vitest';
import { LIMITS } from './edits.ts';
import {
  FRAME_LENGTH,
  addFrame,
  deleteFrame,
  frameHasContent,
  moveFrame,
  sceneFrames,
  setCaption,
  setLength,
  setShot,
} from './frames.ts';

const s1 = sceneId('s1');
const ids = (p: ReturnType<typeof exampleProduction>) => sceneFrames(p, s1).map((f) => f.id);

describe('frames (10.6)', () => {
  it('adds an empty medium shot of 3 seconds after the current frame', () => {
    const p = exampleProduction();
    const added = addFrame(p, s1, frameId('f1'))!;
    const frame = added.production.frames.find((f) => f.id === added.frame)!;
    expect(frame).toMatchObject({ scene: 's1', caption: '', shot: 'medium', lengthSeconds: 3 });
    expect(ids(added.production)).toEqual(['f1', added.frame]);
    expect(checkReferences(added.production)).toEqual([]);
  });

  it('adds at the end with no current frame, taking the first free id', () => {
    let p = exampleProduction();
    p = addFrame(p, s1, null)!.production;
    const second = addFrame(p, s1, frameId('f1'))!;
    expect(ids(second.production)).toEqual(['f1', second.frame, ids(p)[1]]);
    expect(new Set(second.production.frames.map((f) => f.id)).size).toBe(
      second.production.frames.length,
    );
    expect(checkReferences(second.production)).toEqual([]);
  });

  it(`stops at ${LIMITS.framesPerScene} frames in a scene`, () => {
    let p = exampleProduction();
    while (sceneFrames(p, s1).length < LIMITS.framesPerScene) p = addFrame(p, s1, null)!.production;
    expect(addFrame(p, s1, null)).toBeNull();
    expect(checkReferences(p)).toEqual([]);
  });

  it('deletes a frame, renumbers the rest and unpins its lines', () => {
    let p = exampleProduction();
    p = addFrame(p, s1, null)!.production;
    const after = deleteFrame(p, frameId('f1'));
    expect(ids(after)).toEqual([ids(p)[1]]);
    expect(sceneFrames(after, s1)[0]!.order).toBe(0);
    expect(after.script.find((l) => l.id === 'l1')!.pinnedFrame).toBeNull();
    expect(checkReferences(after)).toEqual([]);
  });

  it('knows when deleting a frame takes something with it', () => {
    let p = exampleProduction();
    expect(frameHasContent(p, frameId('f1'))).toBe(true);
    const added = addFrame(p, s1, null)!;
    p = added.production;
    expect(frameHasContent(p, added.frame)).toBe(false);
  });

  it('moves a frame within its scene, counting after it has left its place', () => {
    let p = exampleProduction();
    p = addFrame(p, s1, null)!.production;
    p = addFrame(p, s1, null)!.production;
    const [a, b, c] = ids(p) as [FrameId, FrameId, FrameId];
    expect(ids(moveFrame(p, c, 0))).toEqual([c, a, b]);
    expect(ids(moveFrame(p, a, 2))).toEqual([b, c, a]);
    expect(moveFrame(p, a, 3)).toBe(p);
    expect(checkReferences(moveFrame(p, c, 0))).toEqual([]);
  });

  it('sets the caption, up to its limit, the shot and the length', () => {
    const f1 = frameId('f1');
    let p = setCaption(exampleProduction(), f1, 'x'.repeat(300));
    expect(p.frames[0]!.caption).toHaveLength(LIMITS.caption);
    p = setShot(p, f1, 'overTheShoulder');
    expect(p.frames[0]!.shot).toBe('overTheShoulder');
    expect(setLength(p, f1, 7.4).frames[0]!.lengthSeconds).toBe(7);
    expect(setLength(p, f1, 0).frames[0]!.lengthSeconds).toBe(FRAME_LENGTH.min);
    expect(setLength(p, f1, 99).frames[0]!.lengthSeconds).toBe(FRAME_LENGTH.max);
  });
});
