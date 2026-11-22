import { handSketch, type SketchItem } from './sketchItems.ts';
import { useSketches, type Look } from './sketchSource.tsx';

export { sketchAspect, sketchName, type SketchItem } from './sketchItems.ts';

const STANDING_FRONT: Look = { facing: 'front', pose: null };

/**
 * A sketch, black lines on white (decision 0014). Marks and backdrop sketches are the hand-made
 * drawings from `@storystage/sketches`; a model is its own sketch from Backstage for `look`
 * (WP10.9), drawn as an image; a stand-in, or a model with no sketch to draw, is a labelled
 * outline (spec 03 section 1.3).
 */
export function SketchArt({ item, look = STANDING_FRONT }: { item: SketchItem; look?: Look }) {
  const sketches = useSketches();
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
  const url = sketches.url(item, look);
  if (url)
    return (
      <span className="sb-art sb-art-model" aria-hidden="true">
        <img src={url} alt="" draggable={false} />
      </span>
    );
  return (
    <span className="sb-art sb-art-outline" aria-hidden="true">
      <span>{sketches.name(item)}</span>
    </span>
  );
}
