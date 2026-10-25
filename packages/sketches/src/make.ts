/**
 * Every sketch for one Backstage item, ready to write: the same steps in `tools/make-sketches`
 * and, in a Web Worker, for models imported into Backstage (3.11).
 */
import type { BackstageItem } from '@storystage/backstage';
import { sketchPlan, sketchTitle, type PlannedSketch } from './library.ts';
import { backdropSketchFor } from './marks.ts';
import type { SketchMesh } from './mesh.ts';
import { canPose, poseMesh, type Pose } from './pose.ts';
import { checkSketch, type SketchFlag } from './readability.ts';
import { renderSketch } from './render.ts';

export interface MadeSketch extends PlannedSketch {
  readonly svg: string;
  /** Reasons a person should look at it (the touch-up list); empty if it reads well. */
  readonly flags: readonly SketchFlag[];
}

type Item = Pick<BackstageItem, 'id' | 'section' | 'displayName' | 'themes'>;

/**
 * Backdrops get their hand-made sketch (`mesh` may be null). A Cast member that maps onto the
 * joint map is drawn standing and in each pose; anything else is drawn as modelled.
 */
export function makeItemSketches(
  item: Item,
  mesh: SketchMesh | null,
  options: { readonly size?: number } = {},
): MadeSketch[] {
  if (item.section === 'backdrops') {
    const hand = backdropSketchFor(item);
    const svg = hand.svg.replace('<svg ', `<svg data-backstage-id="${escAttr(item.id)}" `);
    return sketchPlan(item, false).map((p) => ({ ...p, svg, flags: [] }));
  }
  if (!mesh) throw new Error(`${item.id} needs a model to draw.`);
  const posable = item.section === 'cast' && canPose(mesh);
  const posed = new Map<Pose | null, SketchMesh>();
  const shape = (pose: Pose | null) => {
    let m = posed.get(pose);
    if (!m) {
      m = posable ? poseMesh(mesh, pose ?? 'stand') : mesh;
      posed.set(pose, m);
    }
    return m;
  };
  return sketchPlan(item, posable).map((p) => {
    const sketch = renderSketch(shape(p.pose), p.facing, {
      id: item.id,
      title: sketchTitle(item.displayName, p.facing, p.pose),
      pose: p.pose,
      ...(options.size === undefined ? {} : { size: options.size }),
    });
    return { ...p, svg: sketch.svg, flags: checkSketch(sketch) };
  });
}

const escAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
