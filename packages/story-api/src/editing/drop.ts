/**
 * Spec 14, section 2.2: whether something may go somewhere, and the edits that put it there.
 * Both editors ask while dragging, so a place that refuses never lights up, and again on drop.
 *
 * It doesn't repeat S2's rules or the Story API's: it makes the edit, then asks `ast` and
 * `checkProgram`. It refuses only for a problem the drop itself would make, so something wrong
 * elsewhere in a program never stops a learner putting a block down.
 */
import { applyAll, EditRefused, isStatement } from '@storystage/ast';
import type {
  EditOperation,
  Expression,
  NodeId,
  Program,
  Statement,
  StatementSlot,
} from '@storystage/ast';
import { checkProgram, type ProgramCheckOptions } from '../catalog/program-check.ts';
import { indexOf, perProgram } from './cache.ts';
import { labelFor } from './labels.ts';
import { word, type WordsOptions } from './words.ts';

/**
 * A place in a list of statements: before the statement at `index`, or at the end. The list is
 * counted as it's drawn: when a statement moves within its own list, it still counts, so the
 * places just above and just below it both leave it where it is. (The AST's `move` counts after
 * the statement has left; `canDrop` turns one into the other.)
 */
export interface StatementPlace {
  readonly kind: 'statement';
  readonly parent: NodeId;
  readonly slot: StatementSlot;
  readonly index: number;
}

/** A value slot: a block's parameter or detail, or a slot holding one value (`condition`). */
export interface ValuePlace {
  readonly kind: 'value';
  readonly node: NodeId;
  readonly slot: string;
  readonly param?: string;
}

export type Place = StatementPlace | ValuePlace;

/** Something new (from the palette or the control bar), or a statement already in the program. */
export type Candidate = Statement | Expression | { readonly existing: NodeId };

export type DropResult =
  | {
      readonly ok: true;
      readonly edits: readonly EditOperation[];
      /** The undo label, also on each edit. */
      readonly label: string;
      /** The program after the drop. */
      readonly program: Program;
    }
  | { readonly ok: false; readonly reason: string };

export interface DropOptions extends WordsOptions, ProgramCheckOptions {}

const refuse = (reason: string): DropResult => ({ ok: false, reason });

function editFor(program: Program, place: Place, candidate: Candidate, options: DropOptions) {
  if ('existing' in candidate) {
    if (place.kind !== 'statement') return word('drop.valuesOnly');
    // Below its old place in the same list, one fewer comes before it once it has left.
    const from = indexOf(program).get(candidate.existing);
    const sameList = from?.parent === place.parent && from.slot === place.slot;
    const below = sameList && typeof from.key === 'number' && place.index > from.key;
    const edit = {
      kind: 'move',
      node: candidate.existing,
      parent: place.parent,
      slot: place.slot,
      index: below ? place.index - 1 : place.index,
    } as const;
    return { ...edit, label: labelFor(program, { ...edit, label: '' }, options) };
  }
  if (place.kind === 'statement') {
    if (!isStatement(candidate)) return word('drop.blocksOnly');
    const edit = {
      kind: 'insert',
      parent: place.parent,
      slot: place.slot,
      index: place.index,
      node: candidate,
    } as const;
    return { ...edit, label: labelFor(program, { ...edit, label: '' }, options) };
  }
  if (isStatement(candidate)) return word('drop.valuesOnly');
  const edit = {
    kind: 'setArgument',
    node: place.node,
    slot: place.slot,
    ...(place.param === undefined ? {} : { param: place.param }),
    value: candidate as Expression,
  } as const;
  return { ...edit, label: labelFor(program, { ...edit, label: '' }, options) };
}

const key = (p: { readonly node: NodeId | null; readonly message: string }) =>
  `${p.node}|${p.message}`;

/** The problems a program already has, worked out once for each program checked without options. */
const problemsIn = perProgram((program) => new Set(checkProgram(program).map(key)));

/** Any option given at all, so one added later can never be served from the cache. */
const hasOptions = (options: ProgramCheckOptions) =>
  Object.values(options).some((v) => v !== undefined);

/** The method or event handler a node is in, or `null` for one outside them (a field's value). */
/** What holds a value outside a statement: these are checked as a whole, with their values. */
const HOLDERS: ReadonlySet<string> = new Set(['field', 'parameter', 'listener', 'method']);

/**
 * What an edit at `place` can change the problems of (`checkProgram`'s `only`): the statement
 * put in or moved there, or the statement a value goes into (a value's fit is checked by the
 * statement it's in), or the field, parameter or event handler a value outside a statement goes
 * in. Each node is checked on its own against declared types, so nothing else can change; what a
 * statement leaving its old place could break (a variable used later) is the AST's rules, which
 * `applyAll` has already checked. `undefined`, the whole program, when it can't be told.
 */
function touched(
  program: Program,
  place: Place,
  candidate: Candidate,
): ReadonlySet<NodeId> | undefined {
  if (place.kind === 'statement') {
    const id = 'existing' in candidate ? candidate.existing : candidate.id;
    return new Set([id]);
  }
  const index = indexOf(program);
  for (
    let at = index.get(place.node);
    at;
    at = at.parent === null ? undefined : index.get(at.parent)
  )
    if (isStatement(at.node) || HOLDERS.has(at.node.kind)) return new Set([at.node.id]);
  return undefined;
}

/** Whether `candidate` may go at `place`, and if so, the edits and their label. */
export function canDrop(
  program: Program,
  place: Place,
  candidate: Candidate,
  options: DropOptions = {},
): DropResult {
  const edit = editFor(program, place, candidate, options);
  if (typeof edit === 'string') return refuse(edit);

  let after: Program;
  try {
    after = applyAll(program, [edit]).program;
  } catch (e) {
    if (e instanceof EditRefused) return refuse(e.reason);
    throw e;
  }
  const before = hasOptions(options)
    ? new Set(checkProgram(program, options).map(key))
    : problemsIn(program);
  // Only where the edit can make a problem: a full check of a method of 500 statements on every
  // edit, and on every place a move passes, was much of an edit's time with the CPU slowed (3h).
  const made = checkProgram(after, options, touched(program, place, candidate)).find(
    (p) => !before.has(key(p)),
  );
  if (made) return refuse(made.reason ?? word('drop.blocksOnly'));
  return { ok: true, edits: [edit], label: edit.label, program: after };
}
