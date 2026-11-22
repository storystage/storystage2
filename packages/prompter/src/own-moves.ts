/**
 * The learner's own procedures and a character's own moves in a plan (`docs/spec/04-prompter.md`
 * section 6.9, decision 0074): what a name means for an actor, which of them a step can call,
 * which values fit their inputs, and what a call would reach. The plan check, the build, Plan
 * only's ticks, a step's words and the step editor's list all read it from here.
 */
import {
  walk,
  type Expression,
  type MethodDecl,
  type NodeId,
  type ParameterDecl,
  type Program,
  type TypeDecl,
  type TypeRef,
} from '@storystage/ast';
import { PLAN_LIMITS } from '@storystage/production';
import {
  TEXT_REFERENCES,
  classOfType,
  findEntry,
  isEnumName,
  type ApiClass,
  type TypeName,
} from '@storystage/story-api';
import { describer, isSceneScript } from '@storystage/story-api/editing';
import { plainText, toValue, type Converted, type SceneObjects } from './values.ts';

/** The code a plan is checked against: the program, and the scene the plan is for. */
export interface PlanCode {
  readonly program: Program;
  /** The scene's type: what `this` is, and where its objects' fields are. */
  readonly scene: TypeDecl;
  /** Whether the plan is for a frame, where words come only from the script (6.5). */
  readonly forFrame: boolean;
  /** An added model's type, as `add_model` would give it, or null if there's no such model. */
  readonly added: (item: string) => { readonly cls: ApiClass; readonly type: TypeRef } | null;
}

/** An input's kind, as far as a plan can fill it. `other` can't be filled. */
export type InputKind = 'value' | 'text' | 'object' | 'other';

export interface OwnInput {
  readonly id: NodeId;
  readonly name: string;
  readonly type: TypeRef;
  readonly kind: InputKind;
  /** The Story API's name for its type: a learner's class is the class it builds on. */
  readonly storyType: TypeName | null;
  readonly default: Expression | null;
}

export interface OwnMove {
  readonly method: MethodDecl;
  /** The class it's on: the scene's type, or a character's class. */
  readonly owner: NodeId;
  readonly inputs: readonly OwnInput[];
}

/** A program's types. The describer keeps them, worked out once for each program. */
export const typesIn = (program: Program) => describer(program).types;

const PLAIN: ReadonlySet<string> = new Set(['Number', 'WholeNumber', 'Boolean']);

function inputOf(program: Program, p: ParameterDecl): OwnInput {
  const types = typesIn(program);
  const storyType = p.type.kind === 'array' ? null : types.storyName(p.type);
  let kind: InputKind = 'other';
  if (storyType !== null && !TEXT_REFERENCES.includes(storyType)) {
    if (storyType === 'Text') kind = 'text';
    else if (PLAIN.has(storyType) || isEnumName(storyType)) kind = 'value';
    // A joint isn't an object in the scene, so a step has no name to give for one.
    else if (classOfType(storyType) !== null && classOfType(storyType) !== 'Joint') kind = 'object';
  }
  return { id: p.id, name: p.name, type: p.type, kind, storyType, default: p.default };
}

/**
 * What `name` means on an object of `type`, if it's one of the learner's: never when the Story
 * API has a procedure of that name there, and otherwise the nearest class's, as the palette's
 * "your own" finds them. It may still be one a step can't call (`unplannable`).
 */
export function ownMove(program: Program, type: TypeRef | null, name: string): OwnMove | null {
  if (type?.kind !== 'user') return null;
  const types = typesIn(program);
  const cls = types.classOf(type);
  if (cls && findEntry(cls, name)?.kind === 'procedure') return null;
  for (const owner of types.parentsOf(type.type)) {
    const method = owner.methods.find((m) => m.name === name);
    if (method)
      return { method, owner: owner.id, inputs: method.params.map((p) => inputOf(program, p)) };
  }
  return null;
}

/** Every name of a learner's an object of `type` has, nearest class first, each once. */
export function ownNames(program: Program, type: TypeRef | null): string[] {
  if (type?.kind !== 'user') return [];
  const owners = typesIn(program).parentsOf(type.type);
  return [...new Set(owners.flatMap((t) => t.methods.map((m) => m.name)))];
}

/** Why no step can call this, for the learner (6.3), or null if one can. */
export function unplannable(code: PlanCode, move: OwnMove): string | null {
  const { method, inputs } = move;
  const { name } = method;
  if (isSceneScript(code.program, method.id))
    return "When the scene starts can't be used as a block.";
  if (method.returns !== null) return `${name} gives an answer, so a step can't use it.`;
  if (inputs.some((i) => i.kind === 'other'))
    return `${name} needs an input you can fill only in the Code editor.`;
  if (
    inputs.length > PLAN_LIMITS.details ||
    name.length > PLAN_LIMITS.text ||
    inputs.some((i) => i.name.length > PLAN_LIMITS.detailName)
  )
    return `${name} has too much to fit in a step, so add it in the Code editor.`;
  if (code.forFrame && inputs.filter((i) => i.kind === 'text').length > 1)
    return `${name} has more than one text input, so add it in the Code editor.`;
  return null;
}

/**
 * An input's default as a step writes it, for a call on `actor`, or null if no step can. A
 * default runs inside the move, so `this` is the actor, and a field is an object of this scene
 * only in one of the scene's own procedures.
 */
export function defaultText(
  move: OwnMove,
  input: OwnInput,
  actor: string,
  scene: TypeDecl,
): string | null {
  const value = input.default;
  if (value === null) return null;
  if (value.kind === 'this') return actor;
  if (value.kind === 'fieldRef' && move.owner !== scene.id) return null;
  return plainText(value, new Map(scene.fields.map((f) => [f.id, f.name] as const)));
}

/**
 * The only input of a kind, which a step's target (an object) or line (text) fills; null if there
 * are none, or several.
 */
export function onlyInput(move: OwnMove, kind: 'object' | 'text'): OwnInput | null {
  const found = move.inputs.filter((i) => i.kind === kind);
  return found.length === 1 ? found[0]! : null;
}

/** What a move was when a plan was shown: which procedure, and its inputs by id, name and type. */
export interface Meant {
  readonly id: NodeId;
  readonly inputs: string;
}

export const meantBy = (move: OwnMove): Meant => ({
  id: move.method.id,
  inputs: JSON.stringify(move.inputs.map((i) => [i.id, i.name, i.type])),
});

export const sameMeant = (a: Meant, b: Meant) => a.id === b.id && a.inputs === b.inputs;

/** A value for an input, as text: a literal, or an object that fits by the program check's rule. */
export function inputValue(
  program: Program,
  input: OwnInput,
  value: string,
  scene: SceneObjects,
  mint: () => NodeId,
): Converted {
  if (input.kind === 'value' || input.kind === 'text')
    return toValue(value, input.storyType!, scene, mint);
  if (input.kind !== 'object') return { ok: false, message: "Its values can't be given as text." };
  const type = objectType(scene.type, value);
  if (!type) return { ok: false, message: `There's no ${value} in this scene.` };
  if (!typesIn(program).typeFits(type, input.type))
    return { ok: false, message: `${value} doesn't fit this input's type.` };
  const self: Expression = { id: mint(), kind: 'this' };
  const field = scene.type.fields.find((f) => f.name === value);
  return {
    ok: true,
    expression: field ? { id: mint(), kind: 'fieldRef', target: self, field: field.id } : self,
  };
}

/** An object's type by its name in the scene; `this` is the scene itself. */
export function objectType(scene: TypeDecl, name: string): TypeRef | null {
  if (name === 'this') return { kind: 'user', type: scene.id };
  return scene.fields.find((f) => f.name === name)?.type ?? null;
}

/**
 * Whether running `from` can reach `to`: through calls to procedures and functions wherever they
 * are, in statements, values at any depth, inputs' defaults and switched-off blocks.
 */
export function reaches(program: Program, from: NodeId, to: NodeId): boolean {
  const { methods } = typesIn(program);
  const seen = new Set<NodeId>();
  const next = [from];
  while (next.length > 0) {
    const id = next.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const method = methods.get(id)?.method;
    if (!method) continue;
    walk(method, (node) => {
      if ((node.kind === 'call' || node.kind === 'functionCall') && node.callee.kind === 'user')
        next.push(node.callee.method);
    });
  }
  return false;
}
