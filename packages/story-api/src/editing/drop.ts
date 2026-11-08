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
import { labelFor } from './labels.ts';
import { word, type WordsOptions } from './words.ts';

/** A place in a list of statements: before the statement at `index`, or at the end. */
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
    const edit = {
      kind: 'move',
      node: candidate.existing,
      parent: place.parent,
      slot: place.slot,
      index: place.index,
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
  const before = new Set(checkProgram(program, options).map(key));
  const made = checkProgram(after, options).find((p) => !before.has(key(p)));
  if (made) return refuse(made.reason ?? word('drop.blocksOnly'));
  return { ok: true, edits: [edit], label: edit.label, program: after };
}
