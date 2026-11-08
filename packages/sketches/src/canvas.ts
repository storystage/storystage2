/**
 * The frame canvas model (WP10.6; `docs/spec/07-ux.md` section 6.5). Owner: S5, within this
 * package. Pure functions from one frame to the next: adding, moving, resizing, flipping, layering
 * and removing the sketches on a storyboard frame.
 *
 * A sketch's `x` and `y` are its centre, as fractions of the frame from the top left (spec 03
 * section 6), so a frame doesn't depend on the size it's drawn at. `layer` orders them: higher is
 * in front. Every function keeps the layers numbered 0, 1, 2… in front-to-back order.
 */
import type { Facing } from '@storystage/backstage';
import type { Frame, PlacedSketch } from '@storystage/production';
import type { BackstageId, StandIn } from '@storystage/story-api';

/** The most sketches a frame holds (`07-ux.md` section 6.9). */
export const SKETCH_LIMIT = 30;

/** How small and how big a sketch can be, against its standard size. */
export const SCALE = { min: 0.1, max: 3, step: 1.1 } as const;

/** A keyboard nudge: 1% of the frame, or 10% with Shift (`07-ux.md` section 6.5). */
export const NUDGE = { small: 0.01, large: 0.1 } as const;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 10000) / 10000;

/** The sketches back to front. */
export const inLayerOrder = (frame: Frame): PlacedSketch[] =>
  [...frame.sketches].sort((a, b) => a.layer - b.layer);

/** Renumbers layers 0, 1, 2… in the order given (back to front). */
const withOrder = (frame: Frame, ordered: readonly PlacedSketch[]): Frame => ({
  ...frame,
  sketches: ordered.map((s, layer) => ({ ...s, layer })),
});

const update = (frame: Frame, id: string, change: (s: PlacedSketch) => PlacedSketch): Frame => ({
  ...frame,
  sketches: frame.sketches.map((s) => (s.id === id ? change(s) : s)),
});

/** The first of `k1`, `k2`, … that no sketch on the frame uses. */
function freeSketchId(frame: Frame): string {
  const taken = new Set(frame.sketches.map((s) => s.id));
  for (let n = 1; ; n++) if (!taken.has(`k${n}`)) return `k${n}`;
}

export interface NewSketch {
  readonly item: BackstageId | StandIn;
  readonly facing?: Facing;
  readonly pose?: string | null;
  /** Where its centre goes; the middle of the frame if left out. */
  readonly x?: number;
  readonly y?: number;
}

/**
 * Puts a sketch on the frame, in front of the others, at standard size. `null` when the frame
 * already holds `SKETCH_LIMIT` sketches.
 */
export function addSketch(frame: Frame, sketch: NewSketch): { frame: Frame; id: string } | null {
  if (frame.sketches.length >= SKETCH_LIMIT) return null;
  const id = freeSketchId(frame);
  const placed: PlacedSketch = {
    id,
    item: sketch.item,
    facing: sketch.facing ?? 'front',
    pose: sketch.pose ?? null,
    x: round(clamp(sketch.x ?? 0.5, 0, 1)),
    y: round(clamp(sketch.y ?? 0.5, 0, 1)),
    scale: 1,
    flipped: false,
    layer: 0,
  };
  return { frame: withOrder(frame, [...inLayerOrder(frame), placed]), id };
}

/** Moves a sketch's centre to (x, y), kept on the frame. */
export const moveSketch = (frame: Frame, id: string, x: number, y: number): Frame =>
  update(frame, id, (s) => ({ ...s, x: round(clamp(x, 0, 1)), y: round(clamp(y, 0, 1)) }));

/** Moves a sketch by (dx, dy), as fractions of the frame. */
export function nudgeSketch(frame: Frame, id: string, dx: number, dy: number): Frame {
  const s = frame.sketches.find((k) => k.id === id);
  return s ? moveSketch(frame, id, s.x + dx, s.y + dy) : frame;
}

/** Makes a sketch bigger (`steps` > 0) or smaller (`steps` < 0) by 10% a step, within `SCALE`. */
export const resizeSketch = (frame: Frame, id: string, steps: number): Frame =>
  update(frame, id, (s) => ({
    ...s,
    scale: round(clamp(s.scale * SCALE.step ** steps, SCALE.min, SCALE.max)),
  }));

/** Sets a sketch's size against its standard size, within `SCALE` (dragging a corner handle). */
export const scaleSketch = (frame: Frame, id: string, scale: number): Frame =>
  update(frame, id, (s) => ({ ...s, scale: round(clamp(scale, SCALE.min, SCALE.max)) }));

/** Turns a sketch to face the other way. */
export const flipSketch = (frame: Frame, id: string): Frame =>
  update(frame, id, (s) => ({ ...s, flipped: !s.flipped }));

/** Moves a sketch one place forward (+1) or back (−1) among the others. */
export function layerSketch(frame: Frame, id: string, by: 1 | -1): Frame {
  const ordered = inLayerOrder(frame);
  const at = ordered.findIndex((s) => s.id === id);
  const to = at + by;
  if (at === -1 || to < 0 || to >= ordered.length) return frame;
  [ordered[at], ordered[to]] = [ordered[to]!, ordered[at]!];
  return withOrder(frame, ordered);
}

/** Takes a sketch off the frame. */
export const removeSketch = (frame: Frame, id: string): Frame =>
  withOrder(
    frame,
    inLayerOrder(frame).filter((s) => s.id !== id),
  );

/** Where a sketch is across the frame, in thirds, for its accessible name: "left of centre". */
export function across(sketch: Pick<PlacedSketch, 'x'>): 'left' | 'middle' | 'right' {
  if (sketch.x < 1 / 3) return 'left';
  if (sketch.x > 2 / 3) return 'right';
  return 'middle';
}
