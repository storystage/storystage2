/** What a running program holds in its variables (`docs/spec/18-runtime.md`). */
import type { NodeId } from '@storystage/ast';

/** An object in the scene, or the scene itself. `type` is its class, if it's a learner's own. */
export interface ObjectValue {
  readonly kind: 'object';
  readonly id: string;
  readonly type: NodeId | null;
}

export interface EnumValue {
  readonly kind: 'enum';
  readonly type: string;
  readonly value: string;
}

/**
 * One of an object's joints, from `getJoint` or `getJointChain` (spec 02, section 5). A joint
 * turns, rolls and points, but doesn't move (decision 0051), and can be a target.
 */
export interface JointValue {
  readonly kind: 'joint';
  /** The object it belongs to. */
  readonly object: string;
  readonly joint: string;
}

export type Value =
  number | string | boolean | null | ObjectValue | EnumValue | JointValue | Value[];

const isObjectValue = (v: Value): v is ObjectValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'object';

const isEnumValue = (v: Value): v is EnumValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'enum';

const isJointValue = (v: Value): v is JointValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'joint';

export { isObjectValue, isEnumValue, isJointValue };

/** Objects by identity, enums by value, lists by being the same list, the rest by value. */
export function sameValue(a: Value, b: Value): boolean {
  if (isObjectValue(a)) return isObjectValue(b) && a.id === b.id;
  if (isEnumValue(a)) return isEnumValue(b) && a.type === b.type && a.value === b.value;
  if (isJointValue(a)) return isJointValue(b) && a.object === b.object && a.joint === b.joint;
  return a === b;
}

/** A value as words, for joining text. */
export function valueText(v: Value): string {
  if (Array.isArray(v)) return v.map(valueText).join(', ');
  if (isObjectValue(v)) return v.id;
  if (isEnumValue(v)) return v.value;
  if (isJointValue(v)) return `${v.object} ${v.joint}`;
  return v === null ? 'nothing' : String(v);
}

/** The name of the object a call is on. */
export function objectName(v: Value): string {
  if (!isObjectValue(v)) throw new TypeError('Not an object.');
  return v.id;
}
