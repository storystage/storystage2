/**
 * A learner's procedure or function taking inputs (decision 0074, workplan 7.14; spec 14,
 * section 3a). Learners call them inputs, with "parameter" in brackets where they're first
 * offered (the owner, 21 Nov 2026); the code and the Story API call them parameters, as Alice
 * does. Each function here gives the edits for one undo step and applies nothing, so New can put
 * a method and its inputs in one step.
 */
import {
  idMinter,
  walk,
  walkProgram,
  type EditOperation,
  type Expression,
  type MethodDecl,
  type NodeId,
  type ParameterDecl,
  type Program,
  type TypeDecl,
  type TypeRef,
} from '@storystage/ast';
import { indexOf } from './cache.ts';
import { isSceneScriptIn } from './scene-script.ts';
import { fill, splitWords, word } from './words.ts';

/** The types an input can have, as a function's "gives back" offers them. */
export const PARAMETER_TYPES: readonly TypeRef[] = ['Number', 'WholeNumber', 'Text', 'Boolean'].map(
  (name) => ({ kind: 'story', name }) as const,
);

const NAME = /^\p{L}[\p{L}\p{N}_]*$/u;
const MAX_NAME = 60;

export type ParameterProblem = 'empty' | 'shape' | 'long' | 'taken';

interface Found {
  readonly method: MethodDecl;
  readonly owner: TypeDecl;
}

/** The learner's method `id` and the type holding it, or `null` if it isn't one. */
function methodOf(program: Program, id: NodeId): Found | null {
  const at = indexOf(program).get(id);
  if (at?.node.kind !== 'method' || at.parent === null) return null;
  const owner = indexOf(program).get(at.parent)?.node;
  return owner?.kind === 'type' ? { method: at.node, owner } : null;
}

/** The parameter `id` and its method, or `null` if it isn't a method's. */
function parameterOf(
  program: Program,
  id: NodeId,
): (Found & { readonly parameter: ParameterDecl }) | null {
  const at = indexOf(program).get(id);
  if (at?.node.kind !== 'parameter' || at.parent === null) return null;
  const found = methodOf(program, at.parent);
  return found ? { ...found, parameter: at.node } : null;
}

/**
 * Whether `method` can take inputs: any of the learner's methods but a scene's script, which
 * runs when the scene starts, with nothing to give it.
 */
export function takesParameters(program: Program, method: NodeId): boolean {
  const found = methodOf(program, method);
  return found !== null && !isSceneScriptIn(found.owner, found.method);
}

/** The names inside `method` an input mustn't take: its inputs', locals' and loop items'. */
function namesIn(method: MethodDecl, except?: NodeId): string[] {
  const names: string[] = [];
  walk(method, (n) => {
    if (n.id === except) return;
    if (n.kind === 'parameter' || n.kind === 'local' || n.kind === 'loopItem') names.push(n.name);
  });
  return names;
}

/** Why `name` can't be an input of `method`, or `null` if it can. `except`: one being renamed. */
export function parameterNameProblem(
  program: Program,
  method: NodeId,
  name: string,
  except?: NodeId,
): ParameterProblem | null {
  if (name === '') return 'empty';
  if (name.length > MAX_NAME) return 'long';
  if (!NAME.test(name)) return 'shape';
  const found = methodOf(program, method);
  if (found && namesIn(found.method, except).includes(name)) return 'taken';
  return null;
}

/** The words for a problem with an input's name. */
export const parameterProblemWords = (problem: ParameterProblem): string =>
  word(`parameter.problem.${problem}`);

/** Every call to `method`, as a statement or a value, anywhere in the program. */
export function callsOf(program: Program, method: NodeId): readonly NodeId[] {
  const calls: NodeId[] = [];
  walkProgram(program, (n) => {
    if (
      (n.kind === 'call' || n.kind === 'functionCall') &&
      n.callee.kind === 'user' &&
      n.callee.method === method
    )
      calls.push(n.id);
  });
  return calls;
}

/** Every value that reads the input `parameter`. */
export function parameterUses(program: Program, parameter: NodeId): readonly NodeId[] {
  const uses: NodeId[] = [];
  walkProgram(program, (n) => {
    if (n.kind === 'variableRef' && n.variable === parameter) uses.push(n.id);
  });
  return uses;
}

/**
 * What a call already in the code gets for a new input: 1 for a number, as a move of 1 is seen,
 * empty text, true, and otherwise an empty value for the learner to fill.
 */
export function startingArgument(type: TypeRef, mint: () => NodeId): Expression {
  const id = mint();
  if (type.kind === 'story')
    switch (type.name) {
      case 'Number':
        return { id, kind: 'number', value: 1 };
      case 'WholeNumber':
        return { id, kind: 'wholeNumber', value: 1 };
      case 'Text':
        return { id, kind: 'text', value: '' };
      case 'Boolean':
        return { id, kind: 'boolean', value: true };
    }
  return { id, kind: 'none' };
}

export interface AddedParameter {
  readonly edits: readonly EditOperation[];
  /** The new input's id. */
  readonly id: NodeId;
}

/**
 * A new input `name` of `type`, after `method`'s others. Every call already in the code gets a
 * starting value for it, as Alice does, so the film still runs. `null` if the method can't take
 * inputs or the name won't do. `mint` lets New mint the method and its inputs from one minter.
 */
export function addParameter(
  program: Program,
  method: NodeId,
  name: string,
  type: TypeRef,
  label?: string,
  mint: () => NodeId = idMinter(program),
): AddedParameter | null {
  const found = methodOf(program, method);
  if (!found || !takesParameters(program, method)) return null;
  if (parameterNameProblem(program, method, name) !== null) return null;
  const said = label ?? fill(word('parameter.added'), { name, method: found.method.name });
  const id = mint();
  // Declared with a default first, so each step on the way is a whole program; the default goes
  // once every call has its own value, as the learner's inputs have none.
  const node: ParameterDecl = {
    id,
    kind: 'parameter',
    name,
    type,
    default: startingArgument(type, mint),
  };
  const edits: EditOperation[] = [
    { kind: 'declare', parent: method, index: found.method.params.length, node, label: said },
    ...callsOf(program, method).map((call): EditOperation => ({
      kind: 'setArgument',
      node: call,
      slot: 'args',
      param: id,
      value: startingArgument(type, mint),
      label: said,
    })),
    { kind: 'setArgument', node: id, slot: 'default', value: null, label: said },
  ];
  return { edits, id };
}

/** Renames the input `parameter`, or `null` if the name won't do. Its uses follow by id. */
export function renameParameter(
  program: Program,
  parameter: NodeId,
  name: string,
  label?: string,
): readonly EditOperation[] | null {
  const found = parameterOf(program, parameter);
  if (!found) return null;
  if (name === found.parameter.name) return [];
  if (parameterNameProblem(program, found.method.id, name, parameter) !== null) return null;
  const said = label ?? fill(word('parameter.renamed'), { old: found.parameter.name, name });
  return [{ kind: 'rename', node: parameter, name, label: said }];
}

export type RemovedParameter =
  | { readonly edits: readonly EditOperation[] }
  /** The method's code still reads it: these values, for the editor to show. */
  | { readonly usedBy: readonly NodeId[] };

/**
 * Takes the input `parameter` out of its method and its value out of every call. Refused while
 * the method's code reads it, with the values that do, as a variable in use is. `null` if it
 * isn't a method's input.
 */
export function removeParameter(
  program: Program,
  parameter: NodeId,
  label?: string,
  mint: () => NodeId = idMinter(program),
): RemovedParameter | null {
  const found = parameterOf(program, parameter);
  if (!found) return null;
  const usedBy = parameterUses(program, parameter);
  if (usedBy.length > 0) return { usedBy };
  const said =
    label ??
    fill(word('parameter.removed'), { name: found.parameter.name, method: found.method.name });
  // A default first, so the calls can let go of their values one by one.
  const edits: EditOperation[] = [
    {
      kind: 'setArgument',
      node: parameter,
      slot: 'default',
      value: startingArgument(found.parameter.type, mint),
      label: said,
    },
    ...callsOf(program, found.method.id).map((call): EditOperation => ({
      kind: 'setArgument',
      node: call,
      slot: 'args',
      param: parameter,
      value: null,
      label: said,
    })),
    { kind: 'remove', node: parameter, label: said },
  ];
  return { edits };
}

/** "steps: whole number", an input as the editors show it on its method. */
export function parameterWords(program: Program, parameter: ParameterDecl): string {
  return fill(word('parameter.shown'), {
    name: parameter.name,
    type: typeWords(program, parameter.type),
  });
}

/** "whole number", "penguin", "list": a type as an input's line shows it. */
function typeWords(program: Program, type: TypeRef): string {
  if (type.kind === 'array') return word('parameter.list');
  const name =
    type.kind === 'story' ? type.name : (program.types.find((t) => t.id === type.type)?.name ?? '');
  const key = `parameter.type.${name}`;
  const said = word(key);
  return said === key ? splitWords(name) : said;
}
