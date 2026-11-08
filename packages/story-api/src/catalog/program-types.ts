/**
 * What type every value in a program has, as far as the Story API can tell. `checkProgram` uses
 * it to refuse what doesn't fit, and the editing model (`../editing/`) to offer only what does,
 * so the two always agree. A type that can't be known is `null`, and fits anywhere.
 */
import { walk } from '@storystage/ast';
import type {
  Expression,
  FieldDecl,
  MethodDecl,
  NodeId,
  Program,
  TypeDecl,
  TypeRef,
} from '@storystage/ast';
import { classOfType, findEntry, fits, isStoryType } from './catalog.ts';
import type { ApiClass, TypeName } from './types.ts';

/** `null` is a type that can't be known, which always fits. */
export type Known = TypeRef | null;

export const storyType = (name: string): TypeRef => ({ kind: 'story', name });
export const NUMBER = storyType('Number');
export const WHOLE = storyType('WholeNumber');
export const BOOLEAN = storyType('Boolean');
export const TEXT = storyType('Text');

export interface ProgramTypes {
  readonly types: ReadonlyMap<NodeId, TypeDecl>;
  readonly fields: ReadonlyMap<NodeId, FieldDecl>;
  readonly methods: ReadonlyMap<NodeId, { readonly method: MethodDecl; readonly owner: TypeDecl }>;
  /** The declared type of every `local`, `parameter` and `loopItem`. */
  readonly variables: ReadonlyMap<NodeId, TypeRef>;
  /** A user type's chain of parents, itself first. */
  parentsOf(id: NodeId): readonly TypeDecl[];
  /** The Story API's name for a type: a learner's class is the story class it builds on. */
  storyName(type: TypeRef): TypeName | null;
  classOf(type: Known): ApiClass | null;
  typeFits(value: Known, wanted: TypeRef): boolean;
  /** A value's type, inside the type `self` (what `this` is). */
  typeOf(e: Expression, self: TypeRef): Known;
}

export function programTypes(program: Program): ProgramTypes {
  const types = new Map<NodeId, TypeDecl>(program.types.map((t) => [t.id, t]));
  const fields = new Map<NodeId, FieldDecl>();
  const methods = new Map<NodeId, { method: MethodDecl; owner: TypeDecl }>();
  const variables = new Map<NodeId, TypeRef>();
  for (const type of program.types) {
    for (const field of type.fields) fields.set(field.id, field);
    for (const method of type.methods) methods.set(method.id, { method, owner: type });
    walk(type, (node) => {
      if (node.kind === 'local' || node.kind === 'parameter' || node.kind === 'loopItem')
        variables.set(node.id, node.type);
    });
  }

  const parentsOf = (id: NodeId): readonly TypeDecl[] => {
    const chain: TypeDecl[] = [];
    for (let at = types.get(id); at && !chain.includes(at);) {
      chain.push(at);
      at = at.extends.kind === 'user' ? types.get(at.extends.type) : undefined;
    }
    return chain;
  };

  const storyName = (type: TypeRef): TypeName | null => {
    if (type.kind === 'story') return isStoryType(type.name) ? (type.name as TypeName) : null;
    if (type.kind === 'array') {
      const item = storyName(type.of);
      return item === null ? null : (`${item}[]` as TypeName);
    }
    const root = parentsOf(type.type).at(-1)?.extends;
    return root?.kind === 'story' ? storyName(root) : null;
  };

  const classOf = (type: Known): ApiClass | null => {
    const name = type === null ? null : storyName(type);
    return name === null ? null : classOfType(name);
  };

  function typeFits(value: Known, wanted: TypeRef): boolean {
    if (value === null) return true;
    if (wanted.kind === 'array')
      return value.kind === 'array' ? typeFits(value.of, wanted.of) : false;
    if (wanted.kind === 'user')
      return value.kind === 'user' && parentsOf(value.type).some((t) => t.id === wanted.type);
    const given = storyName(value);
    return given === null || !isStoryType(wanted.name) || fits(given, wanted.name as TypeName);
  }

  function typeOf(e: Expression, self: TypeRef): Known {
    switch (e.kind) {
      case 'number':
        return NUMBER;
      case 'wholeNumber':
        return WHOLE;
      case 'boolean':
      case 'compare':
      case 'logic':
      case 'not':
        return BOOLEAN;
      case 'text':
      case 'join':
        return TEXT;
      case 'enum':
        return storyType(e.type);
      case 'none':
        return null;
      case 'this':
        return self;
      case 'fieldRef':
        return fields.get(e.field)?.type ?? null;
      case 'variableRef':
        return variables.get(e.variable) ?? null;
      case 'arrayOf':
        return { kind: 'array', of: e.of };
      case 'arrayLength':
        return WHOLE;
      case 'arrayItem': {
        const array = typeOf(e.array, self);
        return array?.kind === 'array' ? array.of : null;
      }
      case 'arithmetic': {
        const left = typeOf(e.left, self);
        const right = typeOf(e.right, self);
        if (left === null || right === null) return null;
        const whole = storyName(left) === 'WholeNumber' && storyName(right) === 'WholeNumber';
        return whole && e.op !== 'divide' ? WHOLE : NUMBER;
      }
      case 'functionCall': {
        if (e.callee.kind === 'user') return methods.get(e.callee.method)?.method.returns ?? null;
        const cls = classOf(typeOf(e.target, self));
        const entry = cls && findEntry(cls, e.callee.name);
        return entry?.kind === 'function' ? storyType(entry.returns) : null;
      }
    }
  }

  return { types, fields, methods, variables, parentsOf, storyName, classOf, typeFits, typeOf };
}
