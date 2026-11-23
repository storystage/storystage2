/**
 * The build's shape (`docs/spec/04-prompter.md` section 6.10): where each agreed step's blocks go,
 * in what order, and what a step still needs. Pure: the runner keeps what has landed and asks.
 *
 * A step's blocks are a chain: the containers it needs, outermost first, then its own block. A
 * step that starts a group of steps that run together has a do together; one that repeats on its
 * own has a count; a repeat step (6.8) is only its count. Each goes first inside the one before,
 * and the first goes where the step's container leaves room: straight after the step before it
 * there, or first in it.
 */
import type { PlanStep } from './plans.ts';
import { heldBy } from './repeats.ts';

/** A block a step is made of, in the order it's built. */
export type Link = 'doTogether' | 'count' | 'block';

/** What holds a step's first block. */
export type Holder =
  | { readonly kind: 'script' }
  /** A when step's listener, by that step's index. */
  | { readonly kind: 'event'; readonly of: number }
  /** A repeat step's count, by its index. */
  | { readonly kind: 'repeat'; readonly of: number }
  /** The do together a group's first step built, by that step's index. */
  | { readonly kind: 'group'; readonly of: number };

const builds = (step: PlanStep) => step.kind === 'do' || step.kind === 'repeat';

/** The index of the step that starts the group step `i` runs together in (6.4). */
export function groupOf(steps: readonly PlanStep[], i: number): number {
  const held = heldBy(steps);
  let start = i;
  while (start > 0 && steps[start]!.together) {
    const holder = held[start - 1];
    start = holder !== null && holder !== undefined && holder !== held[i] ? holder : start - 1;
  }
  return start;
}

/**
 * Whether step `i` starts a group: it doesn't run together with the one before it, and the step
 * after it, at its own level, does. A group's later steps start none (board-07, first full run).
 */
export function startsGroup(steps: readonly PlanStep[], i: number): boolean {
  const held = heldBy(steps);
  const after = i + 1 + (steps[i]?.holds ?? 0);
  const next = steps[after];
  return (
    !steps[i]!.together &&
    next !== undefined &&
    next.together &&
    held[after] === held[i] &&
    builds(steps[i]!)
  );
}

/** The blocks step `i` is made of, outermost first. Empty for a step with no block. */
export function chainOf(steps: readonly PlanStep[], i: number): Link[] {
  const step = steps[i]!;
  if (step.kind === 'repeat')
    return [...(startsGroup(steps, i) ? (['doTogether'] as const) : []), 'count'];
  if (step.kind !== 'do') return [];
  return [
    ...(startsGroup(steps, i) ? (['doTogether'] as const) : []),
    ...(step.repeat > 1 ? (['count'] as const) : []),
    'block',
  ];
}

/** The when step whose event step `i` is in, or -1 for none: the script. */
export function eventOf(steps: readonly PlanStep[], i: number): number {
  for (let j = i - 1; j >= 0; j--) if (steps[j]!.kind === 'when') return j;
  return -1;
}

/** What holds step `i`'s first block. */
export function holderOf(steps: readonly PlanStep[], i: number): Holder {
  if (steps[i]!.together) {
    const start = groupOf(steps, i);
    if (start !== i) return { kind: 'group', of: start };
  }
  const held = heldBy(steps)[i];
  if (held !== null && held !== undefined) return { kind: 'repeat', of: held };
  const event = eventOf(steps, i);
  return event < 0 ? { kind: 'script' } : { kind: 'event', of: event };
}

const same = (a: Holder, b: Holder) =>
  a.kind === b.kind &&
  (a.kind === 'script' || (a as { of: number }).of === (b as { of: number }).of);

/**
 * The step before `i` in the same holder, whose node it goes straight after, or null when it's the
 * first there. In a group, the group's own first step comes first: its block is first in the do
 * together, after any count of its own.
 */
export function stepBefore(steps: readonly PlanStep[], i: number): number | null {
  const holder = holderOf(steps, i);
  for (let j = i - 1; j >= 0; j--) {
    if (!builds(steps[j]!)) continue;
    if (same(holderOf(steps, j), holder)) return j;
    if (holder.kind === 'group' && j === holder.of) return j;
  }
  return null;
}

/** The first step not yet landed, by index, or null when all have. */
export const firstUnlanded = (steps: readonly PlanStep[], landed: ReadonlySet<number>) => {
  const i = steps.findIndex((_, k) => !landed.has(k));
  return i < 0 ? null : i;
};
