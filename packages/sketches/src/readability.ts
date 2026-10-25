/**
 * Flags sketches a person should look at, for the touch-up list (WP10.5). A flagged sketch is
 * still written; a hand-drawn replacement can be named in `touch-up.json`.
 */
import type { Sketch } from './render.ts';

export type SketchIssue = 'empty' | 'thin' | 'busy';

export interface SketchFlag {
  readonly issue: SketchIssue;
  readonly reason: string;
}

/** Below this many SVG units across, a sketch is a sliver (a sign seen edge-on). */
const THIN = 12;
/** Above this much line per unit of the sketch's outline box, it is a tangle. */
const BUSY = 14;

export function checkSketch(sketch: Pick<Sketch, 'width' | 'height' | 'metrics'>): SketchFlag[] {
  const { width, height, metrics } = sketch;
  if (metrics.outlineLength === 0 || metrics.fillRatio < 0.01)
    return [{ issue: 'empty', reason: 'Nothing shows from this side.' }];
  const flags: SketchFlag[] = [];
  const across = Math.min(width, height) - 8;
  if (across < THIN)
    flags.push({ issue: 'thin', reason: `Only ${Math.max(0, across)} units across: hard to see.` });
  const perimeter = 2 * (width + height);
  const density = (metrics.outlineLength + metrics.detailLength) / perimeter;
  if (density > BUSY)
    flags.push({
      issue: 'busy',
      reason: `${Math.round(density)} times its outline in lines: too many small lines to read.`,
    });
  return flags;
}
