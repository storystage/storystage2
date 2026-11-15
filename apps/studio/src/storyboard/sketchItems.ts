/**
 * What can be sketched on a frame, and what's known without Backstage: a mark's or backdrop's
 * hand-made drawing and words, a stand-in's label, and a model's id.
 */
import type { BackstageId, StandIn } from '@storystage/story-api';
import { BACKDROP_SKETCHES, MARKS, type HandSketch } from '@storystage/sketches';
import { hasWord, words } from '../strings.ts';

export type SketchItem = BackstageId | StandIn;

const HAND_SKETCHES: ReadonlyMap<string, HandSketch> = new Map(
  [...MARKS, ...BACKDROP_SKETCHES].map((s) => [s.id, s]),
);

/** The hand-made sketch for a mark or a backdrop, if `item` is one. */
export const handSketch = (item: SketchItem): HandSketch | undefined =>
  typeof item === 'string' ? HAND_SKETCHES.get(item) : undefined;

/**
 * A sketch's name without Backstage: a mark's or backdrop's words, a stand-in's label, or the last
 * part of a model's Backstage id. With Backstage, `useSketches().name` gives a model's own name.
 */
export function sketchName(item: SketchItem): string {
  if (typeof item !== 'string') return item.standIn;
  const key = `storyboard.sketch.${item}`;
  if (hasWord(key)) return words.t(key);
  return item.split('/').at(-1) ?? item;
}

/** Width over height for a hand-made drawing or an outline, so the frame can size it. */
export function sketchAspect(item: SketchItem): number {
  const hand = handSketch(item);
  const box = hand && /viewBox="0 0 (\d+) (\d+)"/.exec(hand.svg);
  return box ? Number(box[1]) / Number(box[2]) : 0.6;
}
