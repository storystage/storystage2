/**
 * WP4.4: the picture fading to black. A black screen hangs just in front of the camera and is
 * drawn after everything else, as see-through as the fade says.
 */
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import type { Scene } from '@babylonjs/core/scene.js';

/** Further than the near clipping distance (0.125 m), and big enough for the widest lens. */
const DISTANCE = 0.2;
const SIZE = 10;
/** Drawn last, over the scene's own group (0). */
const ON_TOP = 3;

/** Builds the black screen, and gives back how to show a fade from 0 (clear) to 1 (black). */
export function buildFade(scene: Scene, camera: FreeCamera): (amount: number) => void {
  const veil = CreatePlane('fade', { size: SIZE }, scene);
  // A Babylon.js camera looks along its own -Z in a right-handed scene.
  veil.parent = camera;
  veil.position.z = -DISTANCE;
  veil.isPickable = false;
  veil.renderingGroupId = ON_TOP;
  const black = new StandardMaterial('fade', scene);
  black.diffuseColor = Color3.Black();
  black.specularColor = Color3.Black();
  black.disableLighting = true;
  black.fogEnabled = false;
  black.backFaceCulling = false;
  black.disableDepthWrite = true;
  veil.material = black;
  return (amount) => {
    veil.setEnabled(amount > 0);
    black.alpha = amount;
  };
}
