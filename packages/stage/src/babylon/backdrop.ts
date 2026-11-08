/**
 * WP5.2: draws a backdrop the way Alice lights her scenes: an even ambient light, three lights
 * from above spaced a third of a turn apart, one from straight below, and exponential fog that
 * fades to the sky colour.
 */
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import { fogDensity, type Backdrop, type Ground, type Lighting } from '../backdrops.ts';
import type { Sky } from '../timeline.ts';
import { color3, plainMaterial } from './materials.ts';

const AMBIENT = 0.3;
const FROM_ABOVE = 0.533;
const FROM_BELOW = 1;
const TILT = Math.PI / 4;

/** The ground reaches past the far edge of the camera's view (256 m), so it has no visible end. */
const GROUND_SIZE = 600;
/** Alice's room, in metres. */
const ROOM = { width: 10, height: 3, depth: 10 } as const;

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

function addGround(ground: Ground, scene: Scene) {
  const room = ground.room;
  const size = room ? ROOM.width : GROUND_SIZE;
  const floor = CreateGround('ground', { width: size, height: size }, scene);
  const material = plainMaterial('ground', ground.colour, scene);
  material.alpha = ground.opacity;
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
export function buildBackdrop(scene: Scene, backdrop: Backdrop): ShowSky {
  const colourLights = addLights(scene);
  if (backdrop.ground) addGround(backdrop.ground, scene);
  const show: ShowSky = (sky) => {
    const atmosphere = color3(sky.atmosphere);
    scene.clearColor = Color4.FromColor3(atmosphere, 1);
    scene.fogColor = atmosphere;
    const density = fogDensity(sky.fog);
    scene.fogDensity = density;
    scene.fogMode = density > 0 ? Scene.FOGMODE_EXP : Scene.FOGMODE_NONE;
    colourLights({ above: sky.fromAbove, below: sky.fromBelow });
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
