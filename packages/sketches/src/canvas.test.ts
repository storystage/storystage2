import { exampleProduction, type Frame } from '@storystage/production';
import { backstageId } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import {
  NUDGE,
  SCALE,
  SKETCH_LIMIT,
  across,
  addSketch,
  flipSketch,
  inLayerOrder,
  layerSketch,
  moveSketch,
  nudgeSketch,
  removeSketch,
  resizeSketch,
  scaleSketch,
} from './canvas.ts';

const empty = (): Frame => ({ ...exampleProduction().frames[0]!, sketches: [] });
const owl = backstageId('mark/speech');
const cat = { standIn: 'cat' } as const;

function threeSketches() {
  let frame = empty();
  const ids: string[] = [];
  for (const item of [owl, cat, { standIn: 'key' }]) {
    const added = addSketch(frame, { item })!;
    frame = added.frame;
    ids.push(added.id);
  }
  return { frame, ids: ids as [string, string, string] };
}

const order = (frame: Frame) => inLayerOrder(frame).map((s) => s.id);

describe('the frame canvas (10.6)', () => {
  it('adds a sketch in the middle, in front, at standard size', () => {
    const { frame, id } = addSketch(empty(), { item: owl })!;
    expect(frame.sketches).toEqual([
      {
        id,
        item: owl,
        facing: 'front',
        pose: null,
        x: 0.5,
        y: 0.5,
        scale: 1,
        flipped: false,
        layer: 0,
      },
    ]);
    const second = addSketch(frame, { item: cat, x: 0.8, y: 0.7, facing: 'side' })!;
    expect(order(second.frame)).toEqual([id, second.id]);
    expect(second.frame.sketches[1]).toMatchObject({ x: 0.8, y: 0.7, facing: 'side', layer: 1 });
  });

  it(`stops at ${SKETCH_LIMIT} sketches`, () => {
    let frame = empty();
    for (let i = 0; i < SKETCH_LIMIT; i++) frame = addSketch(frame, { item: cat })!.frame;
    expect(addSketch(frame, { item: cat })).toBeNull();
    expect(new Set(frame.sketches.map((s) => s.id)).size).toBe(SKETCH_LIMIT);
  });

  it('moves and nudges a sketch, keeping it on the frame', () => {
    const { frame, ids } = threeSketches();
    expect(moveSketch(frame, ids[0], 0.2, 0.9).sketches[0]).toMatchObject({ x: 0.2, y: 0.9 });
    expect(moveSketch(frame, ids[0], -1, 2).sketches[0]).toMatchObject({ x: 0, y: 1 });
    const nudged = nudgeSketch(frame, ids[1], NUDGE.large, -NUDGE.small);
    expect(nudged.sketches[1]).toMatchObject({ x: 0.6, y: 0.49 });
  });

  it('resizes by 10% a step, within the limits', () => {
    const { frame, ids } = threeSketches();
    expect(resizeSketch(frame, ids[0], 1).sketches[0]!.scale).toBe(1.1);
    expect(resizeSketch(frame, ids[0], -1).sketches[0]!.scale).toBeCloseTo(0.9091, 4);
    expect(resizeSketch(frame, ids[0], 100).sketches[0]!.scale).toBe(SCALE.max);
    expect(resizeSketch(frame, ids[0], -100).sketches[0]!.scale).toBe(SCALE.min);
    expect(scaleSketch(frame, ids[0], 1.23456).sketches[0]!.scale).toBe(1.2346);
    expect(scaleSketch(frame, ids[0], 9).sketches[0]!.scale).toBe(SCALE.max);
  });

  it('flips a sketch, and back', () => {
    const { frame, ids } = threeSketches();
    const once = flipSketch(frame, ids[1]);
    expect(once.sketches[1]!.flipped).toBe(true);
    expect(flipSketch(once, ids[1]).sketches[1]!.flipped).toBe(false);
  });

  it('brings a sketch forward and sends it back, one place at a time', () => {
    const { frame, ids } = threeSketches();
    const [a, b, c] = ids;
    expect(order(layerSketch(frame, a, 1))).toEqual([b, a, c]);
    expect(order(layerSketch(frame, c, -1))).toEqual([a, c, b]);
    expect(layerSketch(frame, c, 1)).toBe(frame);
    expect(layerSketch(frame, a, -1)).toBe(frame);
    expect(
      layerSketch(frame, a, 1)
        .sketches.map((s) => s.layer)
        .sort(),
    ).toEqual([0, 1, 2]);
  });

  it('removes a sketch and renumbers the layers', () => {
    const { frame, ids } = threeSketches();
    const after = removeSketch(frame, ids[1]);
    expect(order(after)).toEqual([ids[0], ids[2]]);
    expect(after.sketches.map((s) => s.layer)).toEqual([0, 1]);
  });

  it('says where a sketch is across the frame, in thirds', () => {
    expect(across({ x: 0.1 })).toBe('left');
    expect(across({ x: 0.5 })).toBe('middle');
    expect(across({ x: 0.9 })).toBe('right');
  });

  it('never changes the frame it was given', () => {
    const { frame, ids } = threeSketches();
    const before = JSON.stringify(frame);
    nudgeSketch(frame, ids[0], 0.1, 0.1);
    resizeSketch(frame, ids[0], 2);
    layerSketch(frame, ids[0], 1);
    removeSketch(frame, ids[0]);
    expect(JSON.stringify(frame)).toBe(before);
  });
});
