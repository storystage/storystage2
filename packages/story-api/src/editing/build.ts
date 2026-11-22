/**
 * New blocks, as the palette and the control bar make them (spec 14, sections 2.1 and 3a). Every
 * value starts empty (`none`), and the cascade asks for each one (section 2.3).
 */
import type {
  Args,
  Callee,
  Expression,
  NodeId,
  Program,
  Statement,
  TypeRef,
} from '@storystage/ast';
import { findEntry } from '../catalog/catalog.ts';
import { storyType, type ProgramTypes } from '../catalog/program-types.ts';
import { typesOf } from './cache.ts';

const none = (mint: () => NodeId): Expression => ({ id: mint(), kind: 'none' });

/** A block called on `target`: a statement, or a value when `isFunction`. */
export function newCall(
  program: Program,
  target: Expression,
  callee: Callee,
  isFunction: boolean,
  mint: () => NodeId,
  types: ProgramTypes = typesOf(program),
  self?: NodeId,
): (Statement & { kind: 'call' }) | (Expression & { kind: 'functionCall' }) {
  const args: Record<string, Expression> = {};
  if (callee.kind === 'user') {
    const method = types.methods.get(callee.method)?.method;
    for (const p of method?.params ?? []) if (p.default === null) args[p.id] = none(mint);
  } else {
    const selfType = self ? ({ kind: 'user', type: self } as const) : storyType('Scene');
    const cls = types.classOf(types.typeOf(target, selfType));
    const entry = cls && findEntry(cls, callee.name);
    for (const p of entry?.params ?? []) args[p.name] = none(mint);
  }
  const kind: 'call' | 'functionCall' = isFunction ? 'functionCall' : 'call';
  return {
    id: mint(),
    kind,
    target,
    callee,
    args: args as Args,
    details: {},
  };
}

/** The control bar's tiles that need nothing but empty slots (spec 14, section 3a). */
export const CONTROL_KINDS = [
  'doInOrder',
  'doTogether',
  'count',
  'while',
  'if',
  'forEach',
  'eachTogether',
  'comment',
] as const;
export type ControlKind = (typeof CONTROL_KINDS)[number];

/** A control statement, empty inside. A loop's item is a `Thing` called `item` until renamed. */
export function newControl(kind: ControlKind, mint: () => NodeId): Statement {
  const id = mint();
  switch (kind) {
    case 'doInOrder':
    case 'doTogether':
      return { id, kind, body: [] };
    case 'count':
      return { id, kind, times: none(mint), body: [] };
    case 'while':
      return { id, kind, condition: none(mint), body: [] };
    case 'if':
      return { id, kind, condition: none(mint), then: [], else: [] };
    case 'forEach':
    case 'eachTogether':
      return {
        id,
        kind,
        item: { id: mint(), kind: 'loopItem', name: 'item', type: storyType('Thing') },
        items: none(mint),
        body: [],
      };
    case 'comment':
      return { id, kind, text: '' };
  }
}

/**
 * The control bar's **variable** tile, once the learner has named it and chosen its type (spec
 * 14, 2.3): it starts empty, and the cascade asks what it starts as.
 */
export function newLocal(name: string, type: TypeRef, mint: () => NodeId): Statement {
  return { id: mint(), kind: 'local', name, type, value: none(mint) };
}

/**
 * The control bar's **assign** tile, once the learner has chosen which variable it sets: the
 * cascade then asks for its new value, of that variable's type.
 */
export function newAssign(variable: NodeId, mint: () => NodeId): Statement {
  return {
    id: mint(),
    kind: 'assign',
    target: { id: mint(), kind: 'variableRef', variable },
    value: none(mint),
  };
}

/** The types the variable tile offers, in the order it lists them (spec 14, 2.3). */
export const VARIABLE_TYPES = ['Number', 'WholeNumber', 'Text', 'Boolean', 'Thing'] as const;
