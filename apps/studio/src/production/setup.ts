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
