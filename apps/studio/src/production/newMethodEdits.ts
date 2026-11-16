/**
 * **New** in the Code editor (`07-ux.md` section 7.3; WP7.2): a procedure, a function or an event
 * listener added to the scene, as one `declare` edit the host checks and keeps as one undo step.
 */
import {
  idMinter,
  type Declare,
  type Expression,
  type ListenerDecl,
  type MethodDecl,
  type NodeId,
  type ParameterDecl,
  type Program,
  type TypeRef,
} from '@storystage/ast';
import { EVENTS, findEvent } from '@storystage/story-api';
import { fill, freshName, word } from '@storystage/story-api/editing';

/** What a new function can give back, with the value its first `return` starts with. */
export const GIVES = ['Number', 'WholeNumber', 'Text', 'Boolean'] as const;
export type Gives = (typeof GIVES)[number];

/**
 * The events a new listener can wait for. Every scene already starts with its own script, so
 * "when the scene starts" isn't offered (as the Prompter's listeners leave it out).
 */
export const NEW_EVENTS: readonly string[] = EVENTS.map((e) => e.name).filter(
  (name) => name !== 'sceneStart',
);

/** An event's words, with "???" where it needs a value: "every ??? seconds". */
export const eventWords = (name: string): string => fill(word(`event.${name}`), {});

const NAME = /^\p{L}[\p{L}\p{N}_]*$/u;
const MAX_NAME = 60;

function typeOf(program: Program, type: NodeId) {
  return program.types.find((t) => t.id === type);
}

/** The names a new method on `type` mustn't take: its methods' and fields'. */
function takenOn(program: Program, type: NodeId): string[] {
  const decl = typeOf(program, type);
  return decl ? [...decl.methods.map((m) => m.name), ...decl.fields.map((f) => f.name)] : [];
}

/** A name not yet taken on `type`: `newProcedure`, then `newProcedure2`. */
export const suggestedName = (program: Program, type: NodeId, base: string): string =>
  freshName(base, takenOn(program, type));

export type NameProblem = 'empty' | 'shape' | 'long' | 'taken';

/** Why `name` can't be a new method's on `type`, or `null` if it can. */
export function nameProblem(program: Program, type: NodeId, name: string): NameProblem | null {
  if (name === '') return 'empty';
  if (name.length > MAX_NAME) return 'long';
  if (!NAME.test(name)) return 'shape';
  if (takenOn(program, type).includes(name)) return 'taken';
  return null;
}

function startingValue(gives: Gives, mint: () => NodeId): Expression {
  const id = mint();
  switch (gives) {
    case 'Number':
      return { id, kind: 'number', value: 0 };
    case 'WholeNumber':
      return { id, kind: 'wholeNumber', value: 0 };
    case 'Text':
      return { id, kind: 'text', value: '' };
    case 'Boolean':
      return { id, kind: 'boolean', value: true };
  }
}

export interface Declared {
  readonly edit: Declare;
  /** The new method's or listener's id, for its tab. */
  readonly id: NodeId;
}

/**
 * A new procedure (`gives` null) or function on `type`, after its other methods. A function
 * starts with `return` and a value of its type, so it gives something back from the start, as
 * Alice's do.
 */
export function newMethod(
  program: Program,
  type: NodeId,
  name: string,
  gives: Gives | null,
  label: string,
): Declared | null {
  const decl = typeOf(program, type);
  if (!decl) return null;
  const mint = idMinter(program);
  const id = mint();
  const node: MethodDecl = {
    id,
    kind: 'method',
    name,
    returns: gives === null ? null : { kind: 'story', name: gives },
    params: [],
    body: gives === null ? [] : [{ id: mint(), kind: 'return', value: startingValue(gives, mint) }],
  };
  return {
    id,
    edit: { kind: 'declare', parent: type, index: decl.methods.length, node, label },
  };
}

const story = (name: string): TypeRef =>
  name.endsWith('[]') ? { kind: 'array', of: story(name.slice(0, -2)) } : { kind: 'story', name };

/** A new listener on `type` for `event`, after its other listeners, as Tiles adds one. */
export function newListener(
  program: Program,
  type: NodeId,
  event: string,
  label: string,
): Declared | null {
  const found = findEvent(event);
  const decl = typeOf(program, type);
  if (!found || !decl) return null;
  const mint = idMinter(program);
  const id = mint();
  const node: ListenerDecl = {
    id,
    kind: 'listener',
    event,
    args: Object.fromEntries(
      found.args.map((a) => [a.name, { id: mint(), kind: 'none' } as Expression]),
    ),
    details: {},
    params: found.gives.map((g): ParameterDecl => ({
      id: mint(),
      kind: 'parameter',
      name: g.name,
      type: story(g.type),
      default: null,
    })),
    body: [],
  };
  return {
    id,
    edit: { kind: 'declare', parent: type, index: decl.listeners.length, node, label },
  };
}
