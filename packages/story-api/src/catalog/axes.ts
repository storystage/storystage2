/**
 * WP4.1: what each direction means, in an object's own axes. Spec 02, section 1.
 *
 * Alice's forward is -Z; a glTF model faces +Z (`vocabulary.ts`). A learner's "left" and
 * "forward" mean the same on both, so the axes here aren't Alice's: `move left` is +X here and
 * -X in Alice, and `turn forward` and `roll` change sign too. `turn left` happens not to.
 */
import type { Vec3 } from '../vocabulary.ts';
import type { ENUMS } from './types.ts';

const axis = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** The way a `move` goes, for `translate`. */
export const MOVE_AXES: Readonly<Record<(typeof ENUMS.MoveDirection)[number], Vec3>> = {
  left: axis(1, 0, 0),
  right: axis(-1, 0, 0),
  up: axis(0, 1, 0),
  down: axis(0, -1, 0),
  forward: axis(0, 0, 1),
  backward: axis(0, 0, -1),
};

/** The right-hand axis of a `turn`, for `rotate`. */
export const TURN_AXES: Readonly<Record<(typeof ENUMS.TurnDirection)[number], Vec3>> = {
  left: axis(0, 1, 0),
  right: axis(0, -1, 0),
  forward: axis(1, 0, 0),
  backward: axis(-1, 0, 0),
};

/** The right-hand axis of a `roll`, for `rotate`. */
export const ROLL_AXES: Readonly<Record<(typeof ENUMS.RollDirection)[number], Vec3>> = {
  left: axis(0, 0, -1),
  right: axis(0, 0, 1),
};
