/**
 * Turns a tool's text values into the program's values (`docs/spec/04-prompter.md` section 3:
 * every value is text, read by its type in the Story API catalog). Strict mode allows no union
 * types, so this is where "2.5", "left" and "cat" become a number, a direction and the cat.
 */
import type { Expression, FieldDecl, NodeId, TypeDecl } from '@storystage/ast';
import {
  TEXT_REFERENCES,
  classOfType,
  enumValues,
  isEnumName,
  isKindOf,
  type ApiClass,
  type TypeName,
} from '@storystage/story-api';

export type Converted =
  | { readonly ok: true; readonly expression: Expression }
  | { readonly ok: false; readonly message: string };

/** The scene's objects, for values that name one. */
export interface SceneObjects {
  readonly type: TypeDecl;
  /** An object's class, from its field's type. */
  readonly classOf: (field: FieldDecl) => ApiClass | null;
}

const NUMBER = /^-?\d+(\.\d+)?$/;
const WHOLE = /^-?\d+$/;

/** The object a name refers to: the scene itself, or one of its objects. */
export function objectRef(
  name: string,
  scene: SceneObjects,
  mint: () => NodeId,
): { readonly expression: Expression; readonly class: ApiClass } | null {
  if (name === 'this') return { expression: { id: mint(), kind: 'this' }, class: 'Scene' };
  const field = scene.type.fields.find((f) => f.name === name);
  const cls = field ? scene.classOf(field) : null;
  if (!field || !cls) return null;
  return {
    expression: {
      id: mint(),
      kind: 'fieldRef',
      target: { id: mint(), kind: 'this' },
      field: field.id,
    },
    class: cls,
  };
}

/** A value given as text, for a parameter or detail of the given type. */
export function toValue(
  value: string,
  type: TypeName,
  scene: SceneObjects,
  mint: () => NodeId,
): Converted {
  const ok = (expression: Expression): Converted => ({ ok: true, expression });
  const no = (message: string): Converted => ({ ok: false, message });

  if (type.endsWith('[]')) return no(`A list of ${type.slice(0, -2)} can't be given as text here.`);
  switch (type) {
    case 'Number':
      return NUMBER.test(value)
        ? ok({ id: mint(), kind: 'number', value: Number(value) })
        : no(`"${value}" should be a number, such as 2 or 0.5.`);
    case 'WholeNumber':
      return WHOLE.test(value)
        ? ok({ id: mint(), kind: 'wholeNumber', value: Number(value) })
        : no(`"${value}" should be a whole number, such as 3.`);
    case 'Text':
      return ok({ id: mint(), kind: 'text', value });
    case 'Boolean':
      return value === 'true' || value === 'false'
        ? ok({ id: mint(), kind: 'boolean', value: value === 'true' })
        : no(`"${value}" should be true or false.`);
    case 'JointId':
      return /^[a-z][a-zA-Z0-9]*$/.test(value)
        ? ok({ id: mint(), kind: 'enum', type: 'JointId', value })
        : no(`"${value}" isn't a joint name.`);
  }
  if (TEXT_REFERENCES.includes(type)) return ok({ id: mint(), kind: 'text', value });
  if (isEnumName(type))
    return enumValues(type).includes(value)
      ? ok({ id: mint(), kind: 'enum', type, value })
      : no(`"${value}" should be one of ${enumValues(type).join(', ')}.`);
  const wanted = classOfType(type);
  if (wanted) {
    const ref = objectRef(value, scene, mint);
    if (!ref) return no(`There's no ${value} in this scene.`);
    return isKindOf(ref.class, wanted)
      ? ok(ref.expression)
      : no(`${value} is a ${ref.class}, and this needs a ${wanted}.`);
  }
  return no(`Values of type ${type} can't be given as text.`);
}
