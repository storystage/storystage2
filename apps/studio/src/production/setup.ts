/**
 * A scene's set-up, as the Production stage edits it (`07-ux.md` section 7.2): an object's place
 * in metres, its turn in turns (Alice's unit, spec 02 section 1) and its size. Pure functions from
 * one production to the next, for `studio.commit`; the program isn't touched.
 */
import type { Production, SceneId } from '@storystage/production';
import type { Quat, Transform, Vec3 } from '@storystage/story-api';
import { withSetup } from '@storystage/staging';

// Setting the stage needs these too, so they live with that (`@storystage/staging`).
export {
  BACKDROP_PARTS,
  backdropPartOf,
  withBackdrop,
  withCamera,
  type BackdropPart,
} from '@storystage/staging';

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

/**
 * Which way an arrow key goes along the ground as a camera sees it, as (x, z): Up away from the
 * camera, Right to its right. Null for any other key.
 */
function groundWay(key: string, camera: Transform): [number, number] | null {
  // The camera looks along its +Z (spec 08 section 9.2); its right on the ground is (-fz, fx).
  const ahead = rotate(camera.rotation, { x: 0, y: 0, z: 1 });
  const flat = Math.hypot(ahead.x, ahead.z) || 1;
  const fx = ahead.x / flat;
  const fz = ahead.z / flat;
  const ground: Record<string, [number, number]> = {
    ArrowUp: [fx, fz],
    ArrowDown: [-fx, -fz],
    ArrowRight: [-fz, fx],
    ArrowLeft: [fz, -fx],
  };
  return ground[key] ?? null;
}

/**
 * Where a key moves a hand or foot in Pose (0073; S3's `handlePlace` and `posedReaching`), or
 * `null` for a key that does nothing: the arrow keys along the ground as the view sees it, and
 * Page Up and Page Down up and down, 10 cm, or 1 m with Shift, as a picked-up object moves.
 */
export function nudgePlace(at: Vec3, key: string, shift: boolean, view: Transform): Vec3 | null {
  const step = shift ? NUDGE.large : NUDGE.small;
  const along = groundWay(key, view);
  if (along)
    return {
      x: toMillimetre(at.x + along[0] * step),
      y: at.y,
      z: toMillimetre(at.z + along[1] * step),
    };
  if (key === 'PageUp' || key === 'PageDown')
    return { ...at, y: toMillimetre(at.y + (key === 'PageUp' ? step : -step)) };
  return null;
}

/** How far one key moves a picked-up object, in metres: 10 cm, or 1 m with Shift. */
export const NUDGE = { small: 0.1, large: 1 } as const;

/** One key's change to a picked-up object, and what kind of change it was, for its step's name. */
export interface Nudge {
  readonly kind: 'move' | 'turn' | 'size';
  readonly transform: Transform;
}

const toMillimetre = (n: number) => Math.round(n * 1000) / 1000;

/**
 * What a key does to an object picked up in Objects in this scene (`07-ux.md` section 7.2), or
 * `null` for a key that does nothing. The arrow keys move it along the ground as the scene's camera
 * sees it (Up away from the camera, Right to its right), Page Up and Page Down raise and lower it,
 * [ and ] turn it an eighth, and + and − resize it by 10%, each within the fields' limits.
 */
export function nudgeObject(
  t: Transform,
  key: string,
  shift: boolean,
  camera: Transform,
): Nudge | null {
  const step = shift ? NUDGE.large : NUDGE.small;
  const along = groundWay(key, camera);
  if (along) {
    const x = withField(t, 'x', toMillimetre(t.position.x + along[0] * step));
    return {
      kind: 'move',
      transform: withField(x, 'z', toMillimetre(t.position.z + along[1] * step)),
    };
  }
  if (key === 'PageUp' || key === 'PageDown') {
    const by = key === 'PageUp' ? step : -step;
    return { kind: 'move', transform: withField(t, 'y', toMillimetre(t.position.y + by)) };
  }
  if (key === '[' || key === ']') {
    const turns = turnOf(t.rotation) + (key === ']' ? 0.125 : -0.125);
    const wrapped = Math.round((((turns % 1) + 1) % 1) * 1e6) / 1e6;
    return { kind: 'turn', transform: withField(t, 'turn', wrapped) };
  }
  if (key === '+' || key === '=' || key === '-' || key === '_') {
    const grow = key === '+' || key === '=' ? 1.1 : 1 / 1.1;
    return { kind: 'size', transform: withField(t, 'size', toMillimetre(sizeOf(t) * grow)) };
  }
  return null;
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
  return facingCamera(camera, { x, y: 0, z });
}

/**
 * Where a model dropped from Backstage goes: the point of the ground under the pointer (the
 * stage's `pick`), facing the camera, at its own size.
 */
export function facingCamera(camera: Transform, at: Vec3): Transform {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  // Facing the camera: the model's +Z turned towards it.
  const towards = Math.atan2(camera.position.x - at.x, camera.position.z - at.z);
  return {
    position: { x: round(at.x), y: round(at.y), z: round(at.z) },
    rotation: { x: 0, y: Math.sin(towards / 2), z: 0, w: Math.cos(towards / 2) },
    scale: { x: 1, y: 1, z: 1 },
  };
}

/** The production with one of the scene's markers moved. */
export function withMarker(
  p: Production,
  scene: SceneId,
  id: string,
  transform: Transform,
): Production {
  return withSetup(p, scene, (setup) => ({
    ...setup,
    markers: setup.markers.map((m) => (m.id === id ? { ...m, transform } : m)),
  }));
}

/**
 * The production with a marker added where the view is (`07-ux.md` section 7.2, Add a marker):
 * a camera marker, as it keeps the view's turn too. Named `marker1`, `marker2`, … as the first
 * free.
 */
export function addMarker(
  p: Production,
  scene: SceneId,
  transform: Transform,
): { production: Production; id: string } {
  const taken = new Set(p.scenes.find((s) => s.id === scene)?.setup.markers.map((m) => m.id));
  let n = 1;
  while (taken.has(`marker${n}`)) n++;
  const id = `marker${n}`;
  return {
    production: withSetup(p, scene, (setup) => ({
      ...setup,
      markers: [...setup.markers, { id, transform }],
    })),
    id,
  };
}

/** The production without one of the scene's markers. */
export const removeMarker = (p: Production, scene: SceneId, id: string): Production =>
  withSetup(p, scene, (setup) => ({
    ...setup,
    markers: setup.markers.filter((m) => m.id !== id),
  }));

/**
 * What a handle drag did, for its undo step's name: a move along the ground or up and down, a
 * turn, or a resize. The handles do one at a time; a move wins if more than one changed.
 */
export function dragKind(before: Transform, after: Transform): 'move' | 'turn' | 'size' {
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const moved = (['x', 'y', 'z'] as const).some(
    (k) => !close(before.position[k], after.position[k]),
  );
  if (moved) return 'move';
  if (!close(before.scale.x, after.scale.x)) return 'size';
  return 'turn';
}
