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
import { plainMaterial } from './materials.ts';
import type { ObjectView } from './view.ts';

const BODY = { width: 0.5, height: 1, depth: 0.5 } as const;
const NOSE = 0.15;
const PALE = { r: 0.82, g: 0.84, b: 0.88 };
const DARK = { r: 0.32, g: 0.36, b: 0.44 };

const BOX: Box = {
  min: { x: -BODY.width / 2, y: 0, z: -BODY.depth / 2 },
  max: { x: BODY.width / 2, y: BODY.height, z: BODY.depth / 2 },
};

/** The label needs a 2D canvas, which a headless stage doesn't have. */
function addLabel(text: string, root: TransformNode, scene: Scene): AbstractMesh | null {
  if (typeof document === 'undefined') return null;
  const size = { width: 512, height: 96 };
  const label = CreatePlane(`${root.name} label`, { width: 1, height: 96 / 512 }, scene);
  label.parent = root;
  label.position.y = BODY.height + 0.2;
  label.billboardMode = AbstractMesh.BILLBOARDMODE_Y;
  const texture = new DynamicTexture(`${root.name} label`, size, scene, false);
  texture.hasAlpha = true;
  texture.drawText(text, null, 68, 'bold 56px sans-serif', '#1f2733', '#ffffffd9', true);
  const material = plainMaterial(`${root.name} label`, PALE, scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.disableLighting = true;
  material.emissiveColor = material.diffuseColor;
  material.fogEnabled = false;
  label.material = material;
  return label;
}

export function buildStandIn(name: string, label: string, scene: Scene): ObjectView {
  const root = new TransformNode(name, scene);
  root.rotationQuaternion = Quaternion.Identity();
  const body = CreateBox(`${name} body`, BODY, scene);
  body.parent = root;
  body.position.y = BODY.height / 2;
  body.material = plainMaterial(`${name} body`, PALE, scene);
  const nose = CreateBox(`${name} nose`, { size: NOSE }, scene);
  nose.parent = root;
  nose.position.set(0, BODY.height * 0.75, BODY.depth / 2 + NOSE / 2);
  nose.material = plainMaterial(`${name} nose`, DARK, scene);
  const words = addLabel(label, root, scene);
  return { root, meshes: words ? [body, nose, words] : [body, nose], box: BOX };
}
