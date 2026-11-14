/**
 * A scene's set-up, as the Production stage edits it (`07-ux.md` section 7.2): an object's place
 * in metres, its turn in turns (Alice's unit, spec 02 section 1) and its size. Pure functions from
 * one production to the next, for `studio.commit`; the program isn't touched.
 */
import type { Production, SceneId } from '@storystage/production';
import type { Quat, Transform } from '@storystage/story-api';

/** How far round an object faces, about the vertical: 0 to just under 1 turn. */
export function turnOf(rotation: Quat): number {
  const turns = (2 * Math.atan2(rotation.y, rotation.w)) / (2 * Math.PI);
  const wrapped = ((turns % 1) + 1) % 1;
  // Round away floating-point dust, so a quarter turn reads 0.25.
  return Math.round(wrapped * 1e6) / 1e6;
}

/** A rotation of `turns` about the vertical. */
export function rotationOf(turns: number): Quat {
  const half = turns * Math.PI;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

/** An object's size: its scale, which the Production stage keeps the same on every side. */
export const sizeOf = (t: Transform): number => Math.round(t.scale.x * 1e6) / 1e6;

export type SetupField = 'x' | 'y' | 'z' | 'turn' | 'size';

/** The limits a field keeps to, so a typed value can't throw an object out of the world. */
export const FIELD_LIMITS: Record<SetupField, { min: number; max: number; step: number }> = {
  x: { min: -100, max: 100, step: 0.1 },
  y: { min: -10, max: 50, step: 0.1 },
  z: { min: -100, max: 100, step: 0.1 },
  turn: { min: 0, max: 1, step: 0.125 },
  size: { min: 0.1, max: 10, step: 0.1 },
};

/** A transform with one field set, kept within its limits. */
export function withField(t: Transform, field: SetupField, value: number): Transform {
  const { min, max } = FIELD_LIMITS[field];
  const v = Math.min(max, Math.max(min, value));
  switch (field) {
    case 'x':
    case 'y':
    case 'z':
      return { ...t, position: { ...t.position, [field]: v } };
    case 'turn':
      return { ...t, rotation: rotationOf(v === 1 ? 0 : v) };
    case 'size':
      return { ...t, scale: { x: v, y: v, z: v } };
  }
}

/** The value a field shows for a transform. */
export function fieldOf(t: Transform, field: SetupField): number {
  switch (field) {
    case 'x':
    case 'y':
    case 'z':
      return Math.round(t.position[field] * 1000) / 1000;
    case 'turn':
      return turnOf(t.rotation);
    case 'size':
      return sizeOf(t);
  }
}

/** The production with one object of `scene` given `transform`. Unchanged if it isn't there. */
export function withObjectTransform(
  p: Production,
  scene: SceneId,
  object: string,
  transform: Transform,
): Production {
  return {
    ...p,
    scenes: p.scenes.map((s) =>
      s.id !== scene
        ? s
        : {
            ...s,
            setup: {
              ...s.setup,
              objects: s.setup.objects.map((o) => (o.id === object ? { ...o, transform } : o)),
            },
          },
    ),
  };
}

/** A vector turned by a rotation. */
function rotate(q: Quat, v: { x: number; y: number; z: number }) {
  // v' = q v q*, written out.
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

/** How far in front of the camera a new object lands, in metres. */
export const ADD_DISTANCE = 4;

/**
 * Where a new object goes when it's added from Backstage by Enter (07-ux section 7.2): on the
 * ground in front of the scene's camera, facing it. The `nth` new one is set a little to the side,
 * alternately left and right, so several added in a row don't stand inside each other.
 */
export function inFrontOfCamera(camera: Transform, nth = 0): Transform {
  // The camera looks along its +Z (spec 08 section 9.2); on the ground, only its heading counts.
  const ahead = rotate(camera.rotation, { x: 0, y: 0, z: 1 });
  const flat = Math.hypot(ahead.x, ahead.z) || 1;
  const fx = ahead.x / flat;
  const fz = ahead.z / flat;
  // Its right on the ground, for the step to the side.
  const side = nth === 0 ? 0 : Math.ceil(nth / 2) * (nth % 2 === 1 ? 1 : -1) * 1.2;
  const x = camera.position.x + fx * ADD_DISTANCE - fz * side;
  const z = camera.position.z + fz * ADD_DISTANCE + fx * side;
  // Facing the camera: the model's +Z turned towards it.
  const towards = Math.atan2(camera.position.x - x, camera.position.z - z);
  return {
    position: { x: Math.round(x * 1000) / 1000, y: 0, z: Math.round(z * 1000) / 1000 },
    rotation: { x: 0, y: Math.sin(towards / 2), z: 0, w: Math.cos(towards / 2) },
    scale: { x: 1, y: 1, z: 1 },
  };
}

/** The parts of a backdrop a Backstage item can set: its class says which (`Ground`, `Sky`…). */
export const BACKDROP_PARTS = ['ground', 'sky', 'lighting'] as const;
export type BackdropPart = (typeof BACKDROP_PARTS)[number];

/** Which part a backdrop item sets, from its class, or `null`. */
export function backdropPartOf(storyClass: string): BackdropPart | null {
  const part = storyClass.toLowerCase();
  return (BACKDROP_PARTS as readonly string[]).includes(part) ? (part as BackdropPart) : null;
}

/** The production with one scene's ground, sky or lighting set to a Backstage item. */
export function withBackdrop(
  p: Production,
  scene: SceneId,
  part: BackdropPart,
  id: string,
): Production {
  return {
    ...p,
    scenes: p.scenes.map((s) =>
      s.id !== scene
        ? s
        : { ...s, setup: { ...s.setup, backdrop: { ...s.setup.backdrop, [part]: id } } },
    ),
  };
}
