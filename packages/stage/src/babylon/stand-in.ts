/**
 * A stand-in: a plain block with a label, for something that isn't in Backstage yet (WP10.9). It
 * has a nose, so you can see which way it faces, and it keeps its code when the real model
 * replaces it.
 */
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Box } from '../hull.ts';
import { STAND_IN_BOX } from '../timeline.ts';
import { plainMaterial } from './materials.ts';
import { ObjectView } from './view.ts';

const PALE = { r: 0.82, g: 0.84, b: 0.88 };
const DARK = { r: 0.32, g: 0.36, b: 0.44 };

/** The label needs a 2D canvas, which a headless stage doesn't have. */
function addLabel(text: string, name: string, scene: Scene): AbstractMesh | null {
  if (typeof document === 'undefined') return null;
  const size = { width: 512, height: 96 };
  const label = CreatePlane(`${name} label`, { width: 1, height: 96 / 512 }, scene);
  label.isPickable = false;
  label.billboardMode = AbstractMesh.BILLBOARDMODE_Y;
  const texture = new DynamicTexture(`${name} label`, size, scene, false);
  texture.hasAlpha = true;
  texture.drawText(text, null, 68, 'bold 56px sans-serif', '#1f2733', '#ffffffd9', true);
  const material = plainMaterial(`${name} label`, PALE, scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.backFaceCulling = false;
  material.disableLighting = true;
  material.emissiveColor = material.diffuseColor;
  material.fogEnabled = false;
  label.material = material;
  return label;
}

/** The block drawn is the box the timeline measures (`standInBox`), standing on its origin. */
export function buildStandIn(
  name: string,
  label: string,
  scene: Scene,
  box: Box = STAND_IN_BOX,
): ObjectView {
  const BODY = {
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
    depth: box.max.z - box.min.z,
  };
  // The nose shows which way it faces, in proportion: 15 cm on the usual half-metre block, no
  // more than 30 cm, and no taller than the block. Alice's flat terrain (49 m by 1 cm by 61 m)
  // would otherwise have a nose 15 m across.
  const NOSE = Math.min(0.3 * Math.min(BODY.width, BODY.depth), 0.6 * BODY.height, 0.3);
  const root = new TransformNode(name, scene);
  root.rotationQuaternion = Quaternion.Identity();
  const body = CreateBox(`${name} body`, BODY, scene);
  body.parent = root;
  body.position.y = BODY.height / 2;
  const surface = plainMaterial(`${name} body`, PALE, scene);
  body.material = surface;
  const nose = CreateBox(`${name} nose`, { size: NOSE }, scene);
  nose.parent = root;
  nose.position.set(0, BODY.height * 0.75, BODY.depth / 2 + NOSE / 2);
  nose.material = plainMaterial(`${name} nose`, DARK, scene);
  const words = addLabel(label, name, scene);
  return new ObjectView({
    root,
    meshes: words ? [body, nose, words] : [body, nose],
    box,
    paintable: [surface],
    label: words ? { mesh: words, above: BODY.height } : undefined,
  });
}
