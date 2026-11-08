/**
 * Putting in a new block (spec 14, 2.3 and 3a): it's shown at its place with `???` for each
 * value, the cascade asks for them in turn, and only when the last is chosen does it go to the
 * host, as one step. So Escape at any point changes nothing. Until then the block lives in a
 * preview program, never the host's.
 */
import { applyAll, EditRefused, idMinter } from '@storystage/ast';
import type {
  Expression,
  ListenerDecl,
  NodeId,
  Program,
  Statement,
  TypeRef,
} from '@storystage/ast';
import { findEvent } from '@storystage/story-api';
import {
  canDrop,
  describer,
  emptySlots,
  type Place,
  type StatementPlace,
  type ValuePlace,
} from '@storystage/story-api/editing';
import type { Change } from './actions.ts';
import { indexOf, place, whereIs } from './places.ts';
import { t } from './words.ts';

export interface Pending {
  /** The program before the block went in: what Escape leaves. */
  readonly base: Program;
  readonly at: Place;
  readonly node: Statement | Expression;
  readonly slots: readonly ValuePlace[];
  /** Which of `slots` is being asked for now. */
  readonly step: number;
  /** `base` with the block in, as far as it's been filled: what the editor shows meanwhile. */
  readonly preview: Program;
}

/** The node with one of its empty values filled. */
function filled(node: Statement | Expression, slot: ValuePlace, value: Expression) {
  const holder = node as unknown as Record<string, unknown>;
  if (slot.param === undefined) return { ...node, [slot.slot]: value } as typeof node;
  const values = holder[slot.slot] as Record<string, Expression>;
  return { ...node, [slot.slot]: { ...values, [slot.param]: value } } as typeof node;
}

/** Starts putting `node` at `at`: a change if nothing needs asking, else what to ask first. */
export function beginInsert(
  base: Program,
  at: Place,
  node: Statement | Expression,
): Pending | Change {
  const result = canDrop(base, at, node);
  if (!result.ok) return { ok: false, reason: result.reason };
  const slots = emptySlots(node);
  if (slots.length === 0)
    return { ok: true, edits: result.edits, label: result.label, focus: node.id };
  return { base, at, node, slots, step: 0, preview: result.program };
}

/** Fills the value being asked for: the next question, or the finished change. */
export function answerSlot(pending: Pending, value: Expression): Pending | Change {
  const node = filled(pending.node, pending.slots[pending.step]!, value);
  const result = canDrop(pending.base, pending.at, node);
  if (!result.ok) return { ok: false, reason: result.reason };
  const step = pending.step + 1;
  if (step < pending.slots.length) return { ...pending, node, step, preview: result.program };
  const focus = pending.at.kind === 'value' ? pending.at.node : node.id;
  return { ok: true, edits: result.edits, label: result.label, focus };
}

export const isPending = (x: Pending | Change): x is Pending => 'slots' in x;

/**
 * Where a new statement goes: after the statement in focus (or the row holding the pill in
 * focus), into the empty list in focus, or else at the end of the open method.
 */
export function insertionPlace(
  program: Program,
  method: NodeId,
  focus: string | null,
): StatementPlace {
  const index = indexOf(program);
  const end = () => {
    const owner = index.get(method)?.node as { body?: readonly unknown[] } | undefined;
    return place(method, 'body', owner?.body?.length ?? 0);
  };
  if (!focus) return end();
  const [first, slot] = focus.split('/');
  if (slot && slot !== 'detail' && (slot === 'body' || slot === 'then' || slot === 'else'))
    return place(first as NodeId, slot, 0);
  // A pill's or a button's row: walk up from the node to the statement that holds it.
  for (let at = index.get(first as NodeId); at; at = at.parent ? index.get(at.parent) : undefined) {
    const where = whereIs(program, at.node.id);
    if (where) return place(where.parent, where.slot, where.index + 1);
  }
  return end();
}

export interface Target {
  /** A key for the picker: the field's id, or `this`. */
  readonly key: string;
  readonly words: string;
  /** A fresh expression for it, with new ids each time. */
  readonly make: (mint: () => NodeId) => Expression;
}

const targetsKept = new WeakMap<Program, Map<NodeId, readonly Target[]>>();

/** What the palette can act on from a method of `type`: the type itself, then its objects. */
export function targets(program: Program, type: NodeId): readonly Target[] {
  let byType = targetsKept.get(program);
  if (!byType) {
    byType = new Map();
    targetsKept.set(program, byType);
  }
  const kept = byType.get(type);
  if (kept) return kept;
  const made = targetsOf(program, type);
  byType.set(type, made);
  return made;
}

function targetsOf(program: Program, type: NodeId): readonly Target[] {
  const describe = describer(program);
  const decl = indexOf(program).get(type)?.node;
  if (!decl || decl.kind !== 'type') return [];
  const self = (mint: () => NodeId): Expression => ({ id: mint(), kind: 'this' });
  const list: Target[] = [
    {
      key: 'this',
      words: describe.inside(
        self(() => 'zzzzzz' as NodeId),
        type,
      ),
      make: self,
    },
  ];
  for (const field of decl.fields) {
    if (!describe.types.classOf(field.type)) continue;
    list.push({
      key: field.id,
      words: field.name,
      make: (mint) => ({ id: mint(), kind: 'fieldRef', target: self(mint), field: field.id }),
    });
  }
  return list;
}

const story = (name: string): TypeRef =>
  name.endsWith('[]') ? { kind: 'array', of: story(name.slice(0, -2)) } : { kind: 'story', name };

/** A new event handler on `type`, with an empty value for each thing the event needs. */
export function addListener(program: Program, type: NodeId, event: string): Change {
  const found = findEvent(event);
  const decl = indexOf(program).get(type)?.node;
  if (!found || !decl || decl.kind !== 'type') return { ok: false, reason: t('gone') };
  const mint = idMinter(program);
  const node: ListenerDecl = {
    id: mint(),
    kind: 'listener',
    event,
    args: Object.fromEntries(
      found.args.map((a) => [a.name, { id: mint(), kind: 'none' } as Expression]),
    ),
    details: {},
    params: found.gives.map((g) => ({
      id: mint(),
      kind: 'parameter',
      name: g.name,
      type: story(g.type),
      default: null,
    })),
    body: [],
  };
  const label = t('added', { what: describer(program).inside(node, type) });
  const edit = {
    kind: 'declare',
    parent: type,
    index: decl.listeners.length,
    node,
    label,
  } as const;
  try {
    applyAll(program, [edit]);
  } catch (e) {
    if (e instanceof EditRefused) return { ok: false, reason: e.reason };
    throw e;
  }
  return { ok: true, edits: [edit], label, focus: node.id };
}
