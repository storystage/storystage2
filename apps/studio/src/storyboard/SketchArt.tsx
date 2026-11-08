import type { BackstageId, StandIn } from '@storystage/story-api';
import { BACKDROP_SKETCHES, MARKS, type HandSketch } from '@storystage/sketches';
import { hasWord, words } from '../strings.ts';

export type SketchItem = BackstageId | StandIn;

const HAND_SKETCHES: ReadonlyMap<string, HandSketch> = new Map(
  [...MARKS, ...BACKDROP_SKETCHES].map((s) => [s.id, s]),
);

/** The hand-made sketch for a mark or a backdrop, if `item` is one. */
const handSketch = (item: SketchItem): HandSketch | undefined =>
  typeof item === 'string' ? HAND_SKETCHES.get(item) : undefined;

/**
 * A sketch's name, as the learner sees it: a mark's or backdrop's words, a stand-in's label, or the
 * last part of a model's Backstage id until Backstage's catalogue gives its name (WP3c).
 */
export function sketchName(item: SketchItem): string {
  if (typeof item !== 'string') return item.standIn;
  const key = `storyboard.sketch.${item}`;
  if (hasWord(key)) return words.t(key);
  return item.split('/').at(-1) ?? item;
}

/** Width over height, so the frame can size a sketch before drawing it. */
export function sketchAspect(item: SketchItem): number {
  const hand = handSketch(item);
  const box = hand && /viewBox="0 0 (\d+) (\d+)"/.exec(hand.svg);
  return box ? Number(box[1]) / Number(box[2]) : 0.6;
}

/**
 * A sketch, black lines on white (decision 0014). Marks and backdrop sketches are the hand-made
 * drawings from `@storystage/sketches`; a stand-in, or a model whose sketches aren't loaded yet,
 * is a labelled outline (spec 03 section 1.3).
 */
export function SketchArt({ item }: { item: SketchItem }) {
  const hand = handSketch(item);
  if (hand)
    return (
      <span
        className="sb-art"
        aria-hidden="true"
        // These drawings are constants in @storystage/sketches, never learner or file content.
        dangerouslySetInnerHTML={{ __html: hand.svg }}
      />
    );
  return (
    <span className="sb-art sb-art-outline" aria-hidden="true">
      <span>{sketchName(item)}</span>
    </span>
  );
}
