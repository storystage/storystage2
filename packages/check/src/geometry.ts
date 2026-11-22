/**
 * Where things are on the picture (spec 08 section 9.2), by the stage's conventions as S3 gives
 * them: the camera looks along its +Z with +Y up, in a right-handed scene, so its +X is on the
 * picture's **left**; the lens is the vertical viewing angle in **turns**; the picture is 16:9;
 * nothing beyond 256 m is drawn; and a model faces its own +Z.
 */
import type { Quat, Transform, Vec3 } from '@storystage/story-api';

/** The stage's far clipping. */
export const FAR = 256;
/** The picture's shape. */
export const ASPECT = 16 / 9;

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** `v` turned by the unit quaternion `q`. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  // v + 2w(q × v) + 2 q × (q × v), with q's vector part.
  const cx = q.y * v.z - q.z * v.y;
  const cy = q.z * v.x - q.x * v.z;
  const cz = q.x * v.y - q.y * v.x;
  const ccx = q.y * cz - q.z * cy;
  const ccy = q.z * cx - q.x * cz;
  const ccz = q.x * cy - q.y * cx;
  return {
    x: v.x + 2 * (q.w * cx + ccx),
    y: v.y + 2 * (q.w * cy + ccy),
    z: v.z + 2 * (q.w * cz + ccz),
  };
}

const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** A point in the camera's own space: +Z ahead, +Y up, +X to the picture's left. */
export function inCamera(camera: Transform, point: Vec3): Vec3 {
  return rotate(conjugate(camera.rotation), sub(point, camera.position));
}

export interface OnPicture {
  /** From the picture's left, 0 to 1 inside it. */
  readonly x: number;
  /** From the picture's top, 0 to 1 inside it. */
  readonly y: number;
  /** How far ahead of the camera, in metres; 0 or less is behind it. */
  readonly depth: number;
  /** In front of the camera, nearer than `FAR`, and inside the picture. */
  readonly onScreen: boolean;
}

/** Where `point` lands on the picture, for a camera with this transform and lens (turns). */
export function project(camera: Transform, lens: number, point: Vec3): OnPicture {
  const c = inCamera(camera, point);
  const tanV = Math.tan((lens * 2 * Math.PI) / 2);
  const tanH = tanV * ASPECT;
  if (c.z <= 0) return { x: 0.5, y: 0.5, depth: c.z, onScreen: false };
  const x = 0.5 - c.x / c.z / tanH / 2;
  const y = 0.5 - c.y / c.z / tanV / 2;
  const onScreen = c.z <= FAR && x >= 0 && x <= 1 && y >= 0 && y <= 1;
  return { x, y, depth: c.z, onScreen };
}

export type View = 'front' | 'threeQuarter' | 'side' | 'back';

export interface Facing {
  readonly view: View;
  /** Which way the character faces across the picture: for a side or three-quarter view. */
  readonly towards: 'left' | 'right' | null;
}

const DEGREES = 180 / Math.PI;

/**
 * Which way a character faces, seen from the camera: front within 30°, three-quarter to 75°,
 * side to 120°, and back beyond (spec 08 section 9.4). Measured across the ground, so a camera
 * looking down doesn't make a character face away.
 */
export function facing(character: Transform, camera: Transform): Facing {
  const ahead = rotate(character.rotation, { x: 0, y: 0, z: 1 });
  const toCamera = sub(camera.position, character.position);
  const a = Math.hypot(ahead.x, ahead.z);
  const b = Math.hypot(toCamera.x, toCamera.z);
  if (a === 0 || b === 0) return { view: 'front', towards: null };
  const cos = (ahead.x * toCamera.x + ahead.z * toCamera.z) / (a * b);
  const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * DEGREES;
  const view: View =
    angle <= 30 ? 'front' : angle <= 75 ? 'threeQuarter' : angle <= 120 ? 'side' : 'back';
  if (view === 'front' || view === 'back') return { view, towards: null };
  // Across the picture: the camera's +X is its left.
  const across = rotate(conjugate(camera.rotation), ahead).x;
  return { view, towards: across >= 0 ? 'left' : 'right' };
}

/** The share of the picture's height a character `height` metres tall fills at `depth` metres. */
export function heightOnPicture(height: number, depth: number, lens: number): number {
  if (depth <= 0) return 0;
  const tanV = Math.tan((lens * 2 * Math.PI) / 2);
  return height / (2 * depth * tanV);
}
