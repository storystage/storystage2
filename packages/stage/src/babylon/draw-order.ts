import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';

/** Where an object stands, to draw it before the objects in front of it. */
export interface Standing {
  readonly origin: Vector3;
}

/**
 * The order see-through surfaces are drawn in, so a part-faded object fades as one solid shape.
 * - Objects are drawn back to front, by where each stands, so one is seen through another.
 * - Each object's surfaces are drawn together: first those drawn with a depth pre-pass while it's
 *   part faded (`ObjectView`'s fade), nearest first, so its nearer parts hide its farther ones: no
 *   far side, insides or clothes underneath showing through. Then its own see-through surfaces
 *   (hair, lashes, glass), back to front, over the body they belong to (S4's review of #667).
 * - Anything else see-through (not an object's) is drawn back to front, as Babylon.js does.
 *
 * Nearest first goes by each part's middle, so a large part behind a small one can still be drawn
 * first. Then it shows through as it did before this, no worse.
 */
export function drawObjectsWhole(
  scene: Scene,
  ownerOf: (mesh: AbstractMesh) => Standing | undefined,
): void {
  scene.setRenderingOrder(
    0,
    null,
    null,
    inDrawingOrder(() => scene.activeCamera?.globalPosition ?? Vector3.ZeroReadOnly, ownerOf),
  );
}

/** Compares two see-through surfaces: below zero draws `a` first (see `drawObjectsWhole`). */
export function inDrawingOrder(
  eye: () => Vector3,
  ownerOf: (mesh: AbstractMesh) => Standing | undefined,
): (a: SubMesh, b: SubMesh) => number {
  const far = (s: SubMesh) =>
    Vector3.Distance(s.getBoundingInfo().boundingSphere.centerWorld, eye());
  return (a, b) => {
    const order = a.getMesh().alphaIndex - b.getMesh().alphaIndex;
    if (order) return order;
    const ownerA = ownerOf(a.getMesh());
    const ownerB = ownerOf(b.getMesh());
    if (ownerA && ownerA === ownerB) {
      const solidA = a.getMaterial()?.needDepthPrePass === true;
      const solidB = b.getMaterial()?.needDepthPrePass === true;
      if (solidA !== solidB) return solidA ? -1 : 1;
      return solidA ? far(a) - far(b) : far(b) - far(a);
    }
    const away = (owner: Standing | undefined, s: SubMesh) =>
      owner ? Vector3.Distance(owner.origin, eye()) : far(s);
    return away(ownerB, b) - away(ownerA, a);
  };
}
