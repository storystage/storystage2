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

export type Value = number | string | boolean | null | ObjectValue | EnumValue | Value[];

const isObjectValue = (v: Value): v is ObjectValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'object';

const isEnumValue = (v: Value): v is EnumValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'enum';

export { isObjectValue, isEnumValue };

/** Objects by identity, enums by value, lists by being the same list, the rest by value. */
export function sameValue(a: Value, b: Value): boolean {
  if (isObjectValue(a)) return isObjectValue(b) && a.id === b.id;
  if (isEnumValue(a)) return isEnumValue(b) && a.type === b.type && a.value === b.value;
  return a === b;
}

/** A value as words, for joining text. */
export function valueText(v: Value): string {
  if (Array.isArray(v)) return v.map(valueText).join(', ');
  if (isObjectValue(v)) return v.id;
  if (isEnumValue(v)) return v.value;
  return v === null ? 'nothing' : String(v);
}

/** The name of the object a call is on. */
export function objectName(v: Value): string {
  if (!isObjectValue(v)) throw new TypeError('Not an object.');
  return v.id;
}
