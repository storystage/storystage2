/**
 * A frame as the Storyboard draws it, read-only (`07-ux.md` section 6.5): its sketches on the
 * paper, placed, sized, layered and flipped as on the frame canvas, with nothing to choose or
 * drag. For anywhere a frame is shown but not edited, such as the Screening room's Compare (spec
 * 08, 11.2), which gets it through `drawFrame`. The frame canvas uses the same geometry, so the
 * two never drift apart.
 */
import type { Frame, FrameId, PlacedSketch, Production, SceneId } from '@storystage/production';
import { across, inLayerOrder } from '@storystage/sketches';
import type { CSSProperties, ReactNode } from 'react';
import { words } from '../strings.ts';
import { SketchArt, sketchAspect, sketchName } from './SketchArt.tsx';

/** A sketch at standard size is this tall, as a share of the frame's height. */
export const STANDARD_HEIGHT = 0.3;

/** A share of the frame as a CSS length, to 0.01%. */
const percent = (share: number) => `${Math.round(share * 10000) / 100}%`;

/** Where a sketch sits on the frame, and how big, in front of what. */
export function sketchStyle(s: PlacedSketch): CSSProperties {
  return {
    left: percent(s.x),
    top: percent(s.y),
    height: percent(STANDARD_HEIGHT * s.scale),
    aspectRatio: sketchAspect(s.item),
    zIndex: s.layer + 1,
  };
}

/** "Owl, on the left": a sketch's accessible name (`07-ux.md` section 6.5). */
export function describeSketch(s: PlacedSketch): string {
  const name = sketchName(s.item);
  const where = words.t(`storyboard.canvas.where.${across(s)}`);
  return words.t(s.flipped ? 'storyboard.canvas.sketchFlipped' : 'storyboard.canvas.sketch', {
    name,
    where,
  });
}

/** What the picture says to a screen reader: its sketches, back to front, or that it's empty. */
export function describeFrame(frame: Frame): string {
  const sketches = inLayerOrder(frame);
  return sketches.length === 0
    ? words.t('storyboard.picture.empty')
    : words.t('storyboard.picture.of', { sketches: sketches.map(describeSketch).join('; ') });
}

export function FramePicture({ frame, label }: { frame: Frame; label?: string }) {
  const sketches = inLayerOrder(frame);
  return (
    <div className="sb-picture" role="img" aria-label={label ?? describeFrame(frame)}>
      {sketches.map((s) => (
        <span key={s.id} className="sb-picture-sketch" style={sketchStyle(s)} aria-hidden="true">
          <span className="sb-sketch-art" data-flipped={s.flipped || undefined}>
            <SketchArt item={s.item} />
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The Screening room's `drawFrame(scene, frame)` for `production`: the frame drawn read-only at the
 * size of its box, or nothing for a frame the production doesn't have.
 */
export function frameDrawer(production: Production) {
  return (scene: SceneId, frame: FrameId): ReactNode => {
    const found = production.frames.find((f) => f.id === frame && f.scene === scene);
    return found ? <FramePicture frame={found} /> : null;
  };
}
