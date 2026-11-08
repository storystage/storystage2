/**
 * The tile editor's edits (spec 14, 3c–3e): each is the shared model's (`canDrop`, `labelFor`),
 * so a refusal and a label read the same in both editors. Nothing here touches the host: the
 * editor sends a change with `host.apply`, which validates it again.
 */
import {
  applyAll,
  copyNode,
  EditRefused,
  idMinter,
  indexProgram,
  isStatement,
} from '@storystage/ast';
import type { EditOperation, Expression, NodeId, Program, Statement } from '@storystage/ast';
import {
  canDrop,
  labelFor,
  type StatementPlace,
  type ValuePlace,
} from '@storystage/story-api/editing';
import { place, whereIs } from './places.ts';
import { t } from './words.ts';

export type Change =
  | {
      readonly ok: true;
      readonly edits: readonly EditOperation[];
      readonly label: string;
      /** Where keyboard focus goes once the change has been made. */
      readonly focus?: NodeId;
    }
  | { readonly ok: false; readonly reason: string };

const refused = (reason: string): Change => ({ ok: false, reason });

/** An edit before it has its label: `Omit` taken over each kind, not the union. */
type Unlabelled = {
  [K in EditOperation['kind']]: Omit<Extract<EditOperation, { kind: K }>, 'label'>;
}[EditOperation['kind']];

/** One edit, checked by S2's rules, with its label. */
function single(program: Program, edit: Unlabelled, focus?: NodeId): Change {
  const labelled = {
    ...edit,
    label: labelFor(program, { ...edit, label: '' } as EditOperation),
  } as EditOperation;
  try {
    applyAll(program, [labelled]);
  } catch (e) {
    if (e instanceof EditRefused) return refused(e.reason);
    throw e;
  }
  return { ok: true, edits: [labelled], label: labelled.label, ...(focus ? { focus } : {}) };
}

const statementOf = (program: Program, id: NodeId): Statement | undefined => {
  const node = indexProgram(program).get(id)?.node;
  return node && isStatement(node) ? node : undefined;
};

const gone = () => refused(t('gone'));

/** Where focus goes after a statement is taken out: the next one, else the one before, else its list. */
function after(program: Program, id: NodeId): NodeId | undefined {
  const where = whereIs(program, id);
  if (!where) return undefined;
  const holder = indexProgram(program).get(where.parent)?.node as unknown as Record<
    string,
    Statement[]
  >;
  const list = holder[where.slot] ?? [];
  return (list[where.index + 1] ?? list[where.index - 1])?.id ?? where.parent;
}

export const removeStatement = (program: Program, id: NodeId): Change =>
  single(program, { kind: 'remove', node: id }, after(program, id));

export function toggleEnabled(program: Program, id: NodeId): Change {
  const node = statementOf(program, id);
  if (!node) return gone();
  return single(program, { kind: 'setEnabled', node: id, enabled: node.enabled === false }, id);
}

/** Puts a statement, new or already there, at a place. */
export function putAt(
  program: Program,
  at: StatementPlace,
  candidate: Statement | { existing: NodeId },
): Change {
  const result = canDrop(program, at, candidate);
  if (!result.ok) return refused(result.reason);
  const focus = 'existing' in candidate ? candidate.existing : candidate.id;
  return { ok: true, edits: result.edits, label: result.label, focus };
}

/** A copy of a statement, with new ids, ready to put somewhere. */
export function copyOf(program: Program, statement: Statement): Statement {
  return copyNode(statement, idMinter(program));
}

export function duplicate(program: Program, id: NodeId): Change {
  const node = statementOf(program, id);
  const where = whereIs(program, id);
  if (!node || !where) return gone();
  return putAt(program, place(where.parent, where.slot, where.index + 1), copyOf(program, node));
}

/** Moves a statement one place up or down within its list. */
export function moveBy(program: Program, id: NodeId, delta: -1 | 1): Change {
  const where = whereIs(program, id);
  if (!where) return gone();
  const holder = indexProgram(program).get(where.parent)?.node as unknown as Record<
    string,
    Statement[]
  >;
  const length = holder[where.slot]?.length ?? 0;
  const index = where.index + delta;
  if (index < 0) return refused(t('top'));
  if (index >= length) return refused(t('bottom'));
  return single(
    program,
    { kind: 'move', node: id, parent: where.parent, slot: where.slot, index },
    id,
  );
}

/** Puts a value in a slot: a block's parameter or detail, or a condition, count or list. */
export function setValue(program: Program, at: ValuePlace, value: Expression): Change {
  const result = canDrop(program, at, value);
  if (!result.ok) return refused(result.reason);
  return { ok: true, edits: result.edits, label: result.label, focus: at.node };
}

/** Takes a detail out of a block ("add detail" in reverse). */
export const removeDetail = (program: Program, node: NodeId, detail: string): Change =>
  single(program, { kind: 'setArgument', node, slot: 'details', param: detail, value: null }, node);
