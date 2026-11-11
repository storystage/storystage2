/**
 * WP5.2: draws a backdrop the way Alice lights her scenes: an even ambient light, three lights
 * from above spaced a third of a turn apart, one from straight below, and exponential fog that
 * fades to the sky colour.
 */
import type { AssetContainer } from '@babylonjs/core/assetContainer.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { BackstageId } from '@storystage/story-api';
import type { Missing } from '../contract.ts';
import {
  ROOM,
  TEXTURE_SHADE,
  fogDensity,
  type Backdrop,
  type Colour,
  type Ground,
  type Lighting,
} from '../backdrops.ts';
import type { Sky } from '../timeline.ts';
import { color3, plainMaterial } from './materials.ts';
import type { ModelLibrary } from './models.ts';

const AMBIENT = 0.3;
const FROM_ABOVE = 0.533;
const FROM_BELOW = 1;
const TILT = Math.PI / 4;

/** The ground reaches past the far edge of the camera's view (256 m), so it has no visible end. */
const GROUND_SIZE = 600;
/**
 * A picture sky's radius on the stage: just inside the camera's far clip (256 m), so it's behind
 * everything there is to see. Its file's dome is 200 m across (spec 17 section 2), and is scaled.
 */
const DOME_RADIUS = 248;
/** The most a ground texture is filtered at a slant, so distant ground doesn't shimmer. */
const ANISOTROPY = 8;

/** A ground's texture from Backstage, and the size of one tile of it in metres. */
interface GroundTexture {
  readonly texture: Texture;
  readonly tile: number;
}

/** A picture sky on the stage, and the atmosphere colour its picture shows as it is. */
interface Dome {
  readonly material: StandardMaterial;
  readonly own: Colour;
}

/** What a backdrop has from Backstage: a ground's texture, a picture sky. */
export interface BackdropParts {
  readonly ground: GroundTexture | null;
  readonly dome: Dome | null;
}

const NO_PARTS: BackdropParts = { ground: null, dome: null };

/** The material a glTF file gave its first mesh, and the picture on it. */
function pictureOf(container: AssetContainer): BaseTexture | null {
  const mesh = container.meshes.find((m) => m.getTotalVertices() > 0);
  const material = mesh?.material as
    { albedoTexture?: BaseTexture | null; emissiveTexture?: BaseTexture | null } | null | undefined;
  return material?.albedoTexture ?? material?.emissiveTexture ?? container.textures[0] ?? null;
}

/**
 * How wide the file's meshes are, in metres, along X, in their own axes: the file has them
 * unmoved (spec 17 section 2). A file read but not placed has no places worked out yet.
 */
function widthOf(container: AssetContainer): number {
  let min = Infinity;
  let max = -Infinity;
  for (const mesh of container.meshes) {
    if (mesh.getTotalVertices() === 0) continue;
    mesh.refreshBoundingInfo({});
    const box = mesh.getBoundingInfo().boundingBox;
    min = Math.min(min, box.minimum.x);
    max = Math.max(max, box.maximum.x);
  }
  return max - min;
}

function groundTexture(container: AssetContainer): GroundTexture {
  // A glTF file's pictures are `Texture`s, which can repeat.
  const texture = pictureOf(container) as Texture | null;
  const tile = widthOf(container);
  if (!texture || !(tile > 0)) throw new Error('not a ground tile');
  texture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
  texture.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
  return { texture, tile };
}

/** The picture sky's dome, in the scene: unlit, without fog, kept on the camera. */
function addDome(container: AssetContainer, own: Colour, scene: Scene): Dome {
  const picture = pictureOf(container);
  const radius = widthOf(container) / 2;
  if (!picture || !(radius > 0)) throw new Error('not a sky dome');
  // Unlit, the plain material shows its picture times its emissive colour: the tint (`show`).
  const material = new StandardMaterial('sky', scene);
  material.disableLighting = true;
  material.diffuseTexture = picture;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.White();
  material.specularColor = Color3.Black();
  material.fogEnabled = false;
  material.backFaceCulling = false;
  const root = new TransformNode('sky', scene);
  const copy = container.instantiateModelsToScene((name) => `sky ${name}`, false, {
    doNotInstantiate: true,
  });
  for (const node of copy.rootNodes) node.parent = root;
  for (const mesh of root.getChildMeshes()) {
    mesh.material = material;
    mesh.isPickable = false;
  }
  root.scaling.setAll(DOME_RADIUS / radius);
  root.infiniteDistance = true;
  return { material, own };
}

/**
 * What a backdrop has from Backstage (spec 17 section 2). A ground with no item is drawn in its
 * colour, as it always was. A picture sky with no item, or an item that can't be read, is drawn
 * in its colour too, and goes in `missing`: the scene plays on.
 */
export async function loadBackdropParts(
  scene: Scene,
  backdrop: Backdrop,
  library: ModelLibrary,
  missing: Missing[],
): Promise<BackdropParts> {
  const part = async <T>(id: BackstageId, reportAbsent: boolean, use: (c: AssetContainer) => T) => {
    if (!(await library.has(id))) {
      if (reportAbsent) missing.push({ kind: 'backdrop', id });
      return null;
    }
    try {
      return use(await library.asset(id));
    } catch {
      missing.push({ kind: 'backdrop', id });
      return null;
    }
  };
  const { ids, ground, sky } = backdrop;
  const [tiled, dome] = await Promise.all([
    ground && ids.ground ? part(ids.ground, false, groundTexture) : null,
    sky.picture && ids.sky ? part(ids.sky, true, (c) => addDome(c, sky.atmosphere, scene)) : null,
  ]);
  return { ground: tiled, dome };
}

/** The ids a backdrop may have Backstage items for, to fetch ahead (`Stage.preload`). */
export function backdropItems(backdrop: Backdrop): BackstageId[] {
  const { ids, ground, sky } = backdrop;
  return [
    ...(ground && ids.ground ? [ids.ground] : []),
    ...(sky.picture && ids.sky ? [ids.sky] : []),
  ];
}

/** A picture sky tinted by the atmosphere colour a program set: new over its own, at most 1. */
function tint(now: Colour, own: Colour): Color3 {
  const by = (n: number, o: number) => (o > 0 ? Math.min(1, n / o) : 1);
  return new Color3(by(now.r, own.r), by(now.g, own.g), by(now.b, own.b));
}

function directional(name: string, direction: Vector3, power: number, s: Scene) {
  const light = new DirectionalLight(name, direction, s);
  light.specular = Color3.Black();
  light.intensity = power;
  return light;
}

/** The lights, and how to colour them: the ambient and the three above take one colour. */
function addLights(scene: Scene) {
  const ambient = new HemisphericLight('ambient', Vector3.Up(), scene);
  ambient.specular = Color3.Black();
  ambient.intensity = AMBIENT;
  const above = [0, 1 / 3, 2 / 3].map((turn) => {
    const yaw = turn * 2 * Math.PI;
    const direction = new Vector3(
      Math.sin(yaw) * Math.cos(TILT),
      -Math.sin(TILT),
      Math.cos(yaw) * Math.cos(TILT),
    );
    return directional(`above ${turn}`, direction, FROM_ABOVE, scene);
  });
  const below = directional('below', Vector3.Up(), FROM_BELOW, scene);
  return (lighting: Lighting) => {
    ambient.diffuse = color3(lighting.above);
    ambient.groundColor = color3(lighting.above);
    for (const light of above) light.diffuse = color3(lighting.above);
    below.diffuse = color3(lighting.below);
  };
}

function addGround(ground: Ground, scene: Scene, textured: GroundTexture | null) {
  const room = ground.room;
  const size = room ? ROOM.width : GROUND_SIZE;
  const floor = CreateGround('ground', { width: size, height: size }, scene);
  const material = plainMaterial('ground', ground.colour, scene);
  material.alpha = ground.opacity;
  if (textured) {
    // Lit by Alice's lights as a flat ground is, so its pixels show as they are.
    const { texture, tile } = textured;
    material.diffuseColor = new Color3(TEXTURE_SHADE, TEXTURE_SHADE, TEXTURE_SHADE);
    material.diffuseTexture = texture;
    texture.uScale = size / tile;
    texture.vScale = size / tile;
    const most = scene.getEngine().getCaps().maxAnisotropy || 1;
    texture.anisotropicFilteringLevel = Math.min(ANISOTROPY, most);
  }
  floor.material = material;
  floor.isPickable = false;
  if (!room) return;
  const { width, height, depth } = ROOM;
  const paint = plainMaterial('walls', room.walls, scene);
  const sides = [
    [0, depth / 2, 0],
    [0, -depth / 2, Math.PI],
    [width / 2, 0, Math.PI / 2],
    [-width / 2, 0, -Math.PI / 2],
  ] as const;
  for (const [x, z, turn] of sides) {
    const wall = CreatePlane('wall', { width, height, sideOrientation: Mesh.DOUBLESIDE }, scene);
    wall.position.set(x, height / 2, z);
    wall.rotation.y = turn;
    wall.material = paint;
    wall.isPickable = false;
  }
  const ceiling = CreateGround('ceiling', { width, height: depth }, scene);
  ceiling.position.y = height;
  ceiling.rotation.x = Math.PI;
  ceiling.material = plainMaterial('ceiling', room.ceiling, scene);
  ceiling.isPickable = false;
}

/** The sky, light and fog as a program has them (`Sky`, fog 0 to 1), applied to the scene. */
export type ShowSky = (sky: Sky) => void;

/** Builds the backdrop, and gives back how to change its sky, light and fog. */
export function buildBackdrop(
  scene: Scene,
  backdrop: Backdrop,
  parts: BackdropParts = NO_PARTS,
): ShowSky {
  const colourLights = addLights(scene);
  if (backdrop.ground) addGround(backdrop.ground, scene, parts.ground);
  const { dome } = parts;
  const show: ShowSky = (sky) => {
    const atmosphere = color3(sky.atmosphere);
    scene.clearColor = Color4.FromColor3(atmosphere, 1);
    scene.fogColor = atmosphere;
    const density = fogDensity(sky.fog);
    scene.fogDensity = density;
    scene.fogMode = density > 0 ? Scene.FOGMODE_EXP : Scene.FOGMODE_NONE;
    colourLights({ above: sky.fromAbove, below: sky.fromBelow });
    if (dome) dome.material.emissiveColor = tint(sky.atmosphere, dome.own);
  };
  // Until there's a timeline to ask, the backdrop's own sky.
  show({
    atmosphere: backdrop.sky.atmosphere,
    fromAbove: backdrop.lighting.above,
    fromBelow: backdrop.lighting.below,
    fog: Math.cbrt(backdrop.fogDensity),
  });
  return show;
}
