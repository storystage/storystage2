/**
 * A list's items, one at a time, the same in both editors (`14-editors.md` section 2.3; the
 * owner's choice of 24 Nov 2026). A listener's list detail, which keys (`keys`, spec 02 section
 * 6a) or which objects (`setOfVisuals`), is filled one item at a time: its menu offers each item,
 * making a list of one (`cascadeFor`), "or ▾" after the last adds another (`addItemPlace`), and
 * each item's menu takes it out (`itemChange` with `null`). Taking the last one out takes the
 * detail out, so the editors never leave a listener with an empty list, which would never run.
 *
 * The AST sets a list as a whole, so each change makes the list again and puts it where it is,
 * through `canDrop`, as one step.
 */
import type { Expression, ListenerDecl, NodeId, Program } from '@storystage/ast';
import { indexOf } from './cache.ts';
import { canDrop, type DropOptions, type ValuePlace } from './drop.ts';
import { changeFor, type MenuChange } from './menu.ts';
import { describer, fill, word } from './words.ts';

type List = Expression & { kind: 'arrayOf' };

/** The listener and detail `list` is, when it's a listener's list detail ("which keys"). */
export function listDetailOf(
  program: Program,
  list: NodeId,
): { readonly listener: ListenerDecl; readonly detail: string } | null {
  const index = indexOf(program);
  const at = index.get(list);
  if (at?.node.kind !== 'arrayOf' || !at.parent || at.slot !== 'details') return null;
  if (typeof at.key !== 'string') return null;
  const holder = index.get(at.parent)?.node;
  return holder?.kind === 'listener' ? { listener: holder, detail: at.key } : null;
}

/** Where "or ▾" puts another item: one place past the list's last (`itemChange` adds there). */
export function addItemPlace(program: Program, list: NodeId): ValuePlace | null {
  const node = indexOf(program).get(list)?.node;
  if (node?.kind !== 'arrayOf') return null;
  return { kind: 'value', node: list, slot: 'items', param: String(node.items.length) };
}

const gone = (): MenuChange => ({ ok: false, reason: word('menu.gone') });

/**
 * Changes item `index` of `list` to `value`, adds `value` when `index` is the list's length, or
 * takes the item out when `value` is null. Taking out a listener detail's last item takes the
 * detail out. One step, labelled by the item ("Add up arrow to when W is pressed").
 */
export function itemChange(
  program: Program,
  list: NodeId,
  index: number,
  value: Expression | null,
  options: DropOptions = {},
): MenuChange {
  const where = indexOf(program).get(list);
  const node = where?.node as List | undefined;
  if (!where?.parent || node?.kind !== 'arrayOf') return gone();
  const end = node.items.length;
  if (!Number.isInteger(index) || index < 0 || index > (value ? end : end - 1)) return gone();

  const describe = describer(program, options);
  const owner = describe.ownerOf(list);
  const words = (e: Expression) => (owner ? describe.inside(e, owner, node.of) : describe(e));
  const detail = listDetailOf(program, list);
  const holder: ValuePlace = {
    kind: 'value',
    node: where.parent,
    slot: where.slot,
    ...(typeof where.key === 'string' ? { param: where.key } : {}),
  };
  const what = describe.short(detail?.listener ?? indexOf(program).get(where.parent)!.node);
  const old = node.items[index];

  let made: Expression | null;
  let label: string;
  if (value === null) {
    label = fill(word('label.removeItem'), { item: words(old!), what });
    made =
      detail && end === 1 ? null : { ...node, items: node.items.filter((_, j) => j !== index) };
  } else if (index === end) {
    label = fill(word('label.addItem'), { item: words(value), what });
    made = { ...node, items: [...node.items, value] };
  } else {
    label = fill(word('label.change'), { from: words(old!), to: words(value), what });
    made = { ...node, items: node.items.map((x, j) => (j === index ? value : x)) };
  }

  // The last of a listener's keys or objects: the detail goes, as "Take which keys out" does.
  const result =
    made === null
      ? changeFor(program, detail!.listener.id, { kind: 'removeDetail', detail: detail!.detail })
      : canDrop(program, holder, made, options);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, edits: result.edits.map((e) => ({ ...e, label })), label };
}
