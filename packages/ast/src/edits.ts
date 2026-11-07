/**
 * Edit operations, the only way to change a program (`docs/spec/01-ast.md`, section 4). Each is
 * plain JSON, invertible and labelled. Each is validated as it's applied; a refusal carries a
 * reason in plain words.
 */
import type { NodeId } from './ids.ts';
import type { AstNode, Declaration, Expression, Program, Statement, TypeDecl } from './nodes.ts';
import { isStatement } from './nodes.ts';
import { nameOf, validateProgram, type Problem, type ValidateOptions } from './validate.ts';
import { indexProgram, shapeOf, walk, withChild, type Location } from './walk.ts';

export type StatementSlot = 'body' | 'then' | 'else';

interface Labelled {
  /** Plain words, also the undo label: "Add cat", "Make cat say Hello". */
  readonly label: string;
}

export interface Insert extends Labelled {
  readonly kind: 'insert';
  readonly parent: NodeId;
  readonly slot: StatementSlot;
  readonly index: number;
  readonly node: Statement;
}
export interface Remove extends Labelled {
  readonly kind: 'remove';
  readonly node: NodeId;
}
export interface Move extends Labelled {
  readonly kind: 'move';
  readonly node: NodeId;
  readonly parent: NodeId;
  readonly slot: StatementSlot;
  /** Where it ends up, counted after it has left its old place. */
  readonly index: number;
}
export interface SetArgument extends Labelled {
  readonly kind: 'setArgument';
  readonly node: NodeId;
  /** A slot holding one expression, or `args` or `details` with `param`. */
  readonly slot: string;
  readonly param?: string;
  readonly value: Expression | null;
}
export interface Declare extends Labelled {
  readonly kind: 'declare';
  /** `null` for a type, which the program holds. */
  readonly parent: NodeId | null;
  readonly index: number;
  readonly node: Declaration;
}
export interface Rename extends Labelled {
  readonly kind: 'rename';
  readonly node: NodeId;
  readonly name: string;
}
export interface SetEnabled extends Labelled {
  readonly kind: 'setEnabled';
  readonly node: NodeId;
  readonly enabled: boolean;
}
export interface SetComment extends Labelled {
  readonly kind: 'setComment';
  readonly node: NodeId;
  readonly text: string;
}

export type EditOperation =
  Insert | Remove | Move | SetArgument | Declare | Rename | SetEnabled | SetComment;

// ---- Refusals --------------------------------------------------------------------------------

export type RefusalCode =
  | 'gone'
  | 'name_taken'
  | 'bad_name'
  | 'in_use'
  | 'not_here'
  | 'into_itself'
  | 'too_big'
  | 'would_break';

const REASONS: Readonly<Record<RefusalCode, (name: string) => string>> = {
  gone: () => "That block isn't there any more.",
  name_taken: (name) => `There's already something called ${name} here. Try another name.`,
  bad_name: () => 'Names start with a letter and use only letters, numbers and _.',
  in_use: (name) => `${name} is still used in your code. Take those blocks out first.`,
  not_here: () => "That can't go here.",
  into_itself: () => "A block can't go inside itself.",
  too_big: () => "That's too big to fit in your program.",
  would_break: () => "That change would stop your program working, so it wasn't made.",
};

/** An edit that wasn't made. `reason` is in plain words for the learner. */
export class EditRefused extends Error {
  readonly code: RefusalCode;
  readonly reason: string;

  constructor(code: RefusalCode, name = 'That', reason?: string) {
    const text = reason ?? REASONS[code](name);
    super(text);
    this.name = 'EditRefused';
    this.code = code;
    this.reason = text;
  }
}

function refusalFor(
  edit: EditOperation,
  problems: readonly Problem[],
  before: Program,
): EditRefused {
  const problem = problems[0]!;
  if (problem.reason !== undefined)
    return new EditRefused('would_break', undefined, problem.reason);
  switch (problem.code) {
    case 'duplicate_name':
      return new EditRefused('name_taken', problem.name);
    case 'too_deep':
    case 'too_long':
      return new EditRefused('too_big');
    case 'missing_reference':
    case 'out_of_scope':
      if (edit.kind === 'remove') {
        const removed = indexProgram(before).get(edit.node)?.node;
        return new EditRefused('in_use', (removed && nameOf(removed)) ?? undefined);
      }
      return new EditRefused(problem.code === 'out_of_scope' ? 'not_here' : 'would_break');
    case 'bad_return':
    case 'bad_assign':
      return new EditRefused('not_here');
    default:
      return new EditRefused('would_break');
  }
}

// ---- Applying --------------------------------------------------------------------------------

type Index = ReadonlyMap<NodeId, Location>;

const STATEMENT_SLOTS: ReadonlySet<string> = new Set(['body', 'then', 'else']);
const NAME = /^\p{L}[\p{L}\p{N}_]*$/u;
const RENAMEABLE: ReadonlySet<string> = new Set([
  'type',
  'field',
  'method',
  'parameter',
  'local',
  'loopItem',
]);

const found = (index: Index, id: NodeId): Location => {
  const at = index.get(id);
  if (!at) throw new EditRefused('gone');
  return at;
};

const listAt = (node: AstNode, slot: string): readonly AstNode[] =>
  (node as unknown as Record<string, readonly AstNode[]>)[slot]!;

const isIndex = (index: unknown, length: number): index is number =>
  Number.isInteger(index) && (index as number) >= 0 && (index as number) <= length;

const inserted = <T>(list: readonly T[], at: number, item: T): T[] => [
  ...list.slice(0, at),
  item,
  ...list.slice(at),
];
const removed = <T>(list: readonly T[], at: number): T[] => [
  ...list.slice(0, at),
  ...list.slice(at + 1),
];

const without = <T extends object>(object: T, key: string): T =>
  Object.fromEntries(Object.entries(object).filter(([k]) => k !== key)) as T;

/** The program with the node at `id` replaced, copying only the path down to it. */
function update(
  program: Program,
  index: Index,
  id: NodeId,
  change: (node: AstNode) => AstNode,
): Program {
  const at = index.get(id)!;
  const next = change(at.node);
  if (at.parent === null) {
    const types = [...program.types];
    types[at.key as number] = next as TypeDecl;
    return { ...program, types };
  }
  return update(program, index, at.parent, (parent) => withChild(parent, at.slot, at.key, next));
}

function placeInList(
  program: Program,
  index: Index,
  parent: NodeId,
  slot: string,
  at: number,
  node: AstNode,
): Program {
  return update(program, index, parent, (p) => ({
    ...p,
    [slot]: inserted(listAt(p, slot), at, node),
  }));
}

function takeOut(program: Program, index: Index, at: Location): Program {
  if (at.parent === null) return { ...program, types: removed(program.types, at.key as number) };
  return update(program, index, at.parent, (p) => ({
    ...p,
    [at.slot]: removed(listAt(p, at.slot), at.key as number),
  }));
}

const checkStatementSlot = (parent: Location, slot: string) => {
  if (!STATEMENT_SLOTS.has(slot) || !shapeOf(parent.node.kind).lists?.includes(slot))
    throw new EditRefused('not_here');
};

function insert(program: Program, index: Index, edit: Insert) {
  const parent = found(index, edit.parent);
  checkStatementSlot(parent, edit.slot);
  if (typeof edit.node !== 'object' || edit.node === null || !isStatement(edit.node))
    throw new EditRefused('not_here');
  if (!isIndex(edit.index, listAt(parent.node, edit.slot).length))
    throw new EditRefused('not_here');
  const { label } = edit;
  return {
    program: placeInList(program, index, edit.parent, edit.slot, edit.index, edit.node),
    inverse: { kind: 'remove', label, node: edit.node.id } as EditOperation,
  };
}

function remove(program: Program, index: Index, edit: Remove) {
  const at = found(index, edit.node);
  const { label } = edit;
  const { node, parent } = at;
  if (isStatement(node))
    return {
      program: takeOut(program, index, at),
      inverse: {
        kind: 'insert',
        label,
        parent: parent!,
        slot: at.slot as StatementSlot,
        index: at.key as number,
        node,
      } as EditOperation,
    };
  if (!DECLARATION_HOMES.has(node.kind)) throw new EditRefused('not_here');
  return {
    program: takeOut(program, index, at),
    inverse: {
      kind: 'declare',
      label,
      parent,
      index: at.key as number,
      node: node as Declaration,
    } as EditOperation,
  };
}

function move(program: Program, index: Index, edit: Move) {
  const at = found(index, edit.node);
  const parent = found(index, edit.parent);
  if (!isStatement(at.node)) throw new EditRefused('not_here');
  checkStatementSlot(parent, edit.slot);
  walk(at.node, (inside) => {
    if (inside.id === edit.parent) throw new EditRefused('into_itself');
  });
  const out = takeOut(program, index, at);
  const afterIndex = indexProgram(out);
  const length = listAt(afterIndex.get(edit.parent)!.node, edit.slot).length;
  if (!isIndex(edit.index, length)) throw new EditRefused('not_here');
  const { label } = edit;
  return {
    program: placeInList(out, afterIndex, edit.parent, edit.slot, edit.index, at.node),
    inverse: {
      kind: 'move',
      label,
      node: edit.node,
      parent: at.parent!,
      slot: at.slot as StatementSlot,
      index: at.key as number,
    } as EditOperation,
  };
}

function setArgument(program: Program, index: Index, edit: SetArgument) {
  const { node } = found(index, edit.node);
  const { slot, param, value, label } = edit;
  const shape = shapeOf(node.kind);
  const fields = node as unknown as Record<string, unknown>;
  const back = (old: unknown) =>
    ({ ...edit, value: (old ?? null) as Expression | null, label }) as EditOperation;

  if (shape.maps?.includes(slot)) {
    if (typeof param !== 'string') throw new EditRefused('not_here');
    const map = fields[slot] as Record<string, Expression>;
    const old = Object.hasOwn(map, param) ? map[param] : null;
    const next = value === null ? without(map, param) : { ...map, [param]: value };
    return {
      program: update(program, index, edit.node, (n) => ({ ...n, [slot]: next })),
      inverse: back(old),
    };
  }
  if (!shape.singles?.includes(slot) || slot === 'item' || param !== undefined)
    throw new EditRefused('not_here');
  return {
    program: update(program, index, edit.node, (n) => ({ ...n, [slot]: value }) as AstNode),
    inverse: back(fields[slot]),
  };
}

/** Which kinds of parent hold each kind of declaration, and in which list. */
const DECLARATION_HOMES: ReadonlyMap<
  string,
  { parents: readonly (string | null)[]; slot: string }
> = new Map([
  ['type', { parents: [null], slot: 'types' }],
  ['field', { parents: ['type'], slot: 'fields' }],
  ['method', { parents: ['type'], slot: 'methods' }],
  ['listener', { parents: ['type'], slot: 'listeners' }],
  ['parameter', { parents: ['method', 'listener'], slot: 'params' }],
]);

function declare(program: Program, index: Index, edit: Declare) {
  const home =
    typeof edit.node === 'object' && edit.node !== null
      ? DECLARATION_HOMES.get(edit.node.kind)
      : undefined;
  if (!home) throw new EditRefused('not_here');
  const parent = edit.parent === null ? null : found(index, edit.parent);
  if (!home.parents.includes(parent?.node.kind ?? null)) throw new EditRefused('not_here');
  const list = parent ? listAt(parent.node, home.slot) : program.types;
  if (!isIndex(edit.index, list.length)) throw new EditRefused('not_here');
  const inverse = { kind: 'remove', label: edit.label, node: edit.node.id } as EditOperation;
  if (edit.parent === null)
    return {
      program: {
        ...program,
        types: inserted(program.types, edit.index, edit.node as TypeDecl),
      },
      inverse,
    };
  return {
    program: placeInList(program, index, edit.parent, home.slot, edit.index, edit.node),
    inverse,
  };
}

function rename(program: Program, index: Index, edit: Rename) {
  const { node } = found(index, edit.node);
  if (!RENAMEABLE.has(node.kind)) throw new EditRefused('not_here');
  if (typeof edit.name !== 'string' || !NAME.test(edit.name)) throw new EditRefused('bad_name');
  return {
    program: update(program, index, edit.node, (n) => ({ ...n, name: edit.name }) as AstNode),
    inverse: { ...edit, name: nameOf(node)! } as EditOperation,
  };
}

function setEnabled(program: Program, index: Index, edit: SetEnabled) {
  const { node } = found(index, edit.node);
  if (!isStatement(node)) throw new EditRefused('not_here');
  return {
    program: update(program, index, edit.node, (n) =>
      edit.enabled ? without(n, 'enabled') : ({ ...n, enabled: false } as AstNode),
    ),
    inverse: { ...edit, enabled: node.enabled !== false } as EditOperation,
  };
}

function setComment(program: Program, index: Index, edit: SetComment) {
  const { node } = found(index, edit.node);
  if (node.kind !== 'comment') throw new EditRefused('not_here');
  return {
    program: update(program, index, edit.node, (n) => ({ ...n, text: edit.text }) as AstNode),
    inverse: { ...edit, text: node.text } as EditOperation,
  };
}

function perform(program: Program, edit: EditOperation) {
  const index = indexProgram(program);
  switch (edit.kind) {
    case 'insert':
      return insert(program, index, edit);
    case 'remove':
      return remove(program, index, edit);
    case 'move':
      return move(program, index, edit);
    case 'setArgument':
      return setArgument(program, index, edit);
    case 'declare':
      return declare(program, index, edit);
    case 'rename':
      return rename(program, index, edit);
    case 'setEnabled':
      return setEnabled(program, index, edit);
    case 'setComment':
      return setComment(program, index, edit);
    default:
      throw new EditRefused('would_break');
  }
}

export interface Applied {
  readonly program: Program;
  readonly inverse: EditOperation;
}

/** Applies one edit and returns the new program with the edit that undoes it. */
export function applyEdit(
  program: Program,
  edit: EditOperation,
  options: ValidateOptions = {},
): Applied {
  const result = perform(program, edit);
  const problems = validateProgram(result.program, options);
  if (problems.length > 0) throw refusalFor(edit, problems, program);
  return result;
}

/** Applies several edits, all or nothing, and returns the inverses in the order they ran. */
export function applyAll(
  program: Program,
  edits: readonly EditOperation[],
  options: ValidateOptions = {},
): { readonly program: Program; readonly inverses: readonly EditOperation[] } {
  let current = program;
  const inverses: EditOperation[] = [];
  for (const edit of edits) {
    const applied = applyEdit(current, edit, options);
    current = applied.program;
    inverses.push(applied.inverse);
  }
  return { program: current, inverses };
}

/** Applies several edits, all or nothing. Throws `EditRefused` if any is refused. */
export const applyEdits = (program: Program, edits: readonly EditOperation[]): Program =>
  applyAll(program, edits).program;

// ---- Labels ----------------------------------------------------------------------------------

const BLOCK_WORDS: Readonly<Partial<Record<AstNode['kind'], string>>> = {
  doInOrder: 'do in order',
  doTogether: 'do together',
  count: 'count',
  while: 'while',
  forEach: 'for each',
  eachTogether: 'each together',
  if: 'if',
  assign: 'set',
  comment: 'comment',
  return: 'return',
  listener: 'when',
};

const SLOT_WORDS: Readonly<Record<string, string>> = {
  condition: 'condition',
  default: 'starting value',
  initial: 'starting value',
  items: 'list',
  target: 'who',
  times: 'times',
};

function spoken(expression: Expression | undefined, index: Index): string {
  switch (expression?.kind) {
    case 'this':
      return 'the scene';
    case 'fieldRef': {
      const field = index.get(expression.field)?.node;
      return (field && nameOf(field)) ?? 'it';
    }
    case 'variableRef': {
      const variable = index.get(expression.variable)?.node;
      return (variable && nameOf(variable)) ?? 'it';
    }
    case 'text':
      return expression.value;
    default:
      return 'it';
  }
}

function calleeName(statement: Statement & { kind: 'call' }, index: Index): string {
  if (statement.callee.kind === 'story') return statement.callee.name;
  const method = index.get(statement.callee.method)?.node;
  return (method && nameOf(method)) ?? 'it';
}

function spokenNode(node: AstNode | undefined, index: Index): string {
  if (!node) return 'it';
  if (node.kind === 'call') return `${spoken(node.target, index)} ${calleeName(node, index)}`;
  return nameOf(node) ?? BLOCK_WORDS[node.kind] ?? 'it';
}

function addedLabel(node: Statement, index: Index): string {
  if (node.kind !== 'call') return `Add ${spokenNode(node, index)}`;
  const words = node.args.text?.kind === 'text' ? ` ${node.args.text.value}` : '';
  return `Make ${spokenNode(node, index)}${words}`;
}

/** Plain words for an edit, naming what changed: "Add cat", "Make cat say Hello". */
export function defaultLabel(program: Program, edit: EditOperation): string {
  const index = indexProgram(program);
  const target = (id: NodeId) => spokenNode(index.get(id)?.node, index);
  switch (edit.kind) {
    case 'insert':
      return addedLabel(edit.node, index);
    case 'declare':
      return `Add ${spokenNode(edit.node, index)}`;
    case 'remove':
      return `Remove ${target(edit.node)}`;
    case 'move':
      return `Move ${target(edit.node)}`;
    case 'setArgument':
      return `Change ${edit.param ?? SLOT_WORDS[edit.slot] ?? 'value'}`;
    case 'rename':
      return `Rename ${target(edit.node)} to ${edit.name}`;
    case 'setEnabled':
      return `Switch ${edit.enabled ? 'on' : 'off'} ${target(edit.node)}`;
    case 'setComment':
      return 'Change comment';
  }
}
