/**
 * Where statements are, and every place one could go in a method, in reading order: the stops
 * for moving a statement by keyboard (spec 14, 3d) and the drop line's targets (3c).
 */
import { indexProgram, type Location } from '@storystage/ast';
import type { AstNode, NodeId, Program, Statement, StatementSlot } from '@storystage/ast';
import type { StatementPlace } from '@storystage/story-api/editing';

export interface Where {
  readonly parent: NodeId;
  readonly slot: StatementSlot;
  readonly index: number;
}

const SLOTS: readonly StatementSlot[] = ['body', 'then', 'else'];

/** The statement lists a node holds, in the order they're drawn. */
export function listsOf(
  node: AstNode,
): readonly { slot: StatementSlot; list: readonly Statement[] }[] {
  const holder = node as unknown as Record<string, unknown>;
  return SLOTS.filter((slot) => Array.isArray(holder[slot])).map((slot) => ({
    slot,
    list: holder[slot] as readonly Statement[],
  }));
}

const indexes = new WeakMap<Program, ReadonlyMap<NodeId, Location>>();

/**
 * Where every node in a program is, worked out once for each program: a program is immutable,
 * and a long method asks this for every row and every keystroke (spec 14, 3h).
 */
export function indexOf(program: Program): ReadonlyMap<NodeId, Location> {
  let index = indexes.get(program);
  if (!index) {
    index = indexProgram(program);
    indexes.set(program, index);
  }
  return index;
}

/** The list a statement is in, and its place there. */
export function whereIs(program: Program, id: NodeId): Where | null {
  const at = indexOf(program).get(id);
  if (!at?.parent || typeof at.key !== 'number' || !SLOTS.includes(at.slot as StatementSlot))
    return null;
  return { parent: at.parent, slot: at.slot as StatementSlot, index: at.key };
}

export const place = (parent: NodeId, slot: StatementSlot, index: number): StatementPlace => ({
  kind: 'statement',
  parent,
  slot,
  index,
});

export const placeKey = (p: StatementPlace) => `${p.parent}/${p.slot}/${p.index}`;

/** Every place in a method or listener, in reading order: before each statement, then the end. */
export function placesIn(program: Program, method: NodeId): readonly StatementPlace[] {
  const owner = indexOf(program).get(method)?.node;
  if (!owner) return [];
  const places: StatementPlace[] = [];
  const visit = (parent: AstNode) => {
    for (const { slot, list } of listsOf(parent)) {
      list.forEach((s, i) => {
        places.push(place(parent.id, slot, i));
        visit(s);
      });
      places.push(place(parent.id, slot, list.length));
    }
  };
  if (owner.kind === 'method' || owner.kind === 'listener') {
    const body = owner.body;
    body.forEach((s, i) => {
      places.push(place(owner.id, 'body', i));
      visit(s);
    });
    places.push(place(owner.id, 'body', body.length));
  }
  return places;
}

/** Whether `place` is where the statement `id` already is, before or just after itself. */
export function isWhereItIs(program: Program, id: NodeId, p: StatementPlace): boolean {
  const where = whereIs(program, id);
  return (
    !!where &&
    where.parent === p.parent &&
    where.slot === p.slot &&
    (p.index === where.index || p.index === where.index + 1)
  );
}
