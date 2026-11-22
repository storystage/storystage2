import { nodeId, type NodeId } from '@storystage/ast';
import type { MeasuredBlock, MeasuredScene } from '@storystage/playback';
import { frameId, sceneId, type Frame } from '@storystage/production';
import { micros } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { frameSpans } from './spans.ts';

const S = sceneId('s1');
const scene: MeasuredScene = {
  scene: S,
  transition: null,
  start: micros(10),
  length: micros(12),
  waits: false,
};

const frame = (id: string, order: number, seconds: number, links: NodeId[] = []): Frame => ({
  id: frameId(id),
  scene: S,
  order,
  caption: id,
  shot: 'wide',
  lengthSeconds: seconds,
  sketches: [],
  links,
});
const A = nodeId('blockA');
const B = nodeId('blockB');
const C = nodeId('blockC');
const ran = (node: NodeId, at: number): MeasuredBlock => ({ scene: S, node, at: micros(at) });

const seconds = (spans: ReturnType<typeof frameSpans>) =>
  [...spans].map(([id, s]) => [id, s.start / 1e6, s.end / 1e6]);

describe('frameSpans', () => {
  it('starts each frame when its linked blocks first run, and ends it where the next starts', () => {
    const spans = frameSpans(
      scene,
      [frame('f1', 0, 3, [A]), frame('f2', 1, 3, [B]), frame('f3', 2, 3, [C])],
      [ran(A, 10), ran(B, 14), ran(A, 15), ran(C, 19)],
    );
    expect(seconds(spans)).toEqual([
      ['f1', 10, 14],
      ['f2', 14, 19],
      ['f3', 19, 22],
    ]);
  });

  it('starts a frame with no linked block where the one before was planned to end', () => {
    const spans = frameSpans(
      scene,
      [frame('f1', 0, 3, [A]), frame('f2', 1, 4), frame('f3', 2, 2, [C])],
      [ran(A, 11), ran(C, 20)],
    );
    expect(seconds(spans)).toEqual([
      ['f1', 11, 14],
      ['f2', 14, 20],
      ['f3', 20, 22],
    ]);
  });

  it('starts the first frame with the scene when it has no linked block', () => {
    const spans = frameSpans(scene, [frame('f1', 0, 3), frame('f2', 1, 3)], []);
    expect(seconds(spans)).toEqual([
      ['f1', 10, 13],
      ['f2', 13, 22],
    ]);
  });

  it('keeps frames in storyboard order, whatever order they come in', () => {
    const spans = frameSpans(
      scene,
      [frame('f2', 1, 3, [B]), frame('f1', 0, 3, [A])],
      [ran(A, 10), ran(B, 12)],
    );
    expect([...spans.keys()]).toEqual(['f1', 'f2']);
  });

  it("ends a frame at its planned length when the next one's blocks ran before it", () => {
    const spans = frameSpans(
      scene,
      [frame('f1', 0, 3, [A]), frame('f2', 1, 3, [B])],
      [ran(B, 10), ran(A, 12)],
    );
    expect(seconds(spans)).toEqual([
      ['f1', 12, 15],
      ['f2', 15, 22],
    ]);
  });

  it('keeps every span inside the scene', () => {
    const spans = frameSpans(scene, [frame('f1', 0, 20), frame('f2', 1, 5)], []);
    expect(seconds(spans)).toEqual([
      ['f1', 10, 22],
      ['f2', 22, 22],
    ]);
  });

  it("ignores runs outside the scene's play", () => {
    const spans = frameSpans(scene, [frame('f1', 0, 3, [A])], [ran(A, 5), ran(A, 12), ran(A, 30)]);
    expect(seconds(spans)).toEqual([['f1', 12, 22]]);
  });
});
