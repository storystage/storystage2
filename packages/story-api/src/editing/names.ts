/**
 * Names for the learner's variables (spec 14, section 2.3): what's in scope where a new block
 * would go, a fresh name that clashes with none of it, and new loops that take one, so a loop
 * inside a loop isn't refused for both items being called `item`.
 */
import { applyAll, EditRefused, nodeId } from '@storystage/ast';
import type { NodeId, Program, Statement, TypeRef } from '@storystage/ast';
import { scopeAt } from './cascade.ts';
import type { StatementPlace } from './drop.ts';

export interface NameInScope {
  readonly id: NodeId;
  readonly name: string;
  readonly type: TypeRef;
  /** Whether "set … to" may change it: not a loop's item or a constant. */
  readonly assignable: boolean;
}

/** An id no program has, for a statement that's put in only to look around it. */
const PROBE = nodeId('zprobe');

/**
 * The variables a statement at `at` would see: earlier locals in its lists, the items of the
 * loops around it, and its method's parameters, innermost first. Empty if `at` isn't a place.
 */
export function namesAt(program: Program, at: StatementPlace): readonly NameInScope[] {
  const probe: Statement = { id: PROBE, kind: 'comment', text: '' };
  let looked: Program;
  try {
    looked = applyAll(program, [
      { kind: 'insert', parent: at.parent, slot: at.slot, index: at.index, node: probe, label: '' },
    ]).program;
  } catch (e) {
    if (e instanceof EditRefused) return [];
    throw e;
  }
  return scopeAt(looked, PROBE);
}

/** `base` if nothing in `taken` has it, else `base2`, `base3` and so on. */
export function freshName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) if (!names.has(`${base}${n}`)) return `${base}${n}`;
}

/**
 * A new block made ready for `at`: a loop's item takes a name nothing in scope there has. Anything
 * else is returned as it is (a variable's name is the learner's, checked where it's asked for).
 */
export function readyFor<T extends Statement>(program: Program, at: StatementPlace, node: T): T {
  if (node.kind !== 'forEach' && node.kind !== 'eachTogether') return node;
  const taken = namesAt(program, at).map((v) => v.name);
  const name = freshName(node.item.name, taken);
  return name === node.item.name ? node : { ...node, item: { ...node.item, name } };
}
