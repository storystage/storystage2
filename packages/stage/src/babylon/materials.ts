/**
 * Every surface in a scene is plain and matt, as in Alice, so they all light the same way. It's
 * also the cheapest thing to draw on the reference devices.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Colour } from '../backdrops.ts';

/** The ambient light, three from above and one from below (`backdrop.ts`). */
const LIGHTS = 5;

export const color3 = ({ r, g, b }: Colour) => new Color3(r, g, b);

export function plainMaterial(name: string, colour: Colour, scene: Scene): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color3(colour);
  material.specularColor = Color3.Black();
  material.maxSimultaneousLights = LIGHTS;
  return material;
}
