/**
 * Repeating several steps (`docs/spec/04-prompter.md` section 6.8): a `repeat` step holds the
 * `holds` steps right after it, as a count block holds the blocks under it. These are the rules
 * every edit keeps, worked out on the steps alone, so the panel (S5 draws it) and its tests read
 * the same answers: which repeat holds a step, how far a repeat can reach, and what a move or a
 * delete does to `holds`.
 */
import { PLAN_LIMITS } from '@storystage/production';
import type { PlanStep } from './plans.ts';

/** The words the panel says when an edit is refused, or changes more than it was asked to. */
export const PLAN_EDIT_WORDS = {
  cantHold: 'A repeat can only hold steps that are blocks.',
  repeatGone: "The repeat had no steps left, so it's gone too.",
} as const;

/** What a plan edit did: whether it changed the plan, and any words to announce. */
export interface PlanEdit {
  readonly ok: boolean;
  readonly words?: string;
}

/** `addRepeat`'s answer: also where the new repeat step is, to open Change step on it. */
export type AddRepeat = PlanEdit & { readonly index?: number };

/** What an edit gives back: the new steps, or none when it's refused. */
export interface StepsEdit {
  readonly steps: PlanStep[] | null;
  readonly words?: string;
}

/** A step that can go inside a repeat: a block step (only blocks go in a count). */
export const holdable = (step: PlanStep): boolean => step.kind === 'do';

/** For each step, the index of the `repeat` step that holds it, or null. */
export function heldBy(steps: readonly PlanStep[]): (number | null)[] {
  const held: (number | null)[] = steps.map(() => null);
  steps.forEach((s, i) => {
    if (s.kind !== 'repeat') return;
    for (let j = i + 1; j <= i + s.holds && j < steps.length; j++) held[j] ??= i;
  });
  return held;
}

/**
 * For a `repeat` step, the most its Steps inside can be: the run of block steps right after it.
 * Null for any other step.
 */
export function stepsInsideMax(steps: readonly PlanStep[]): (number | null)[] {
  return steps.map((s, i) => {
    if (s.kind !== 'repeat') return null;
    let n = 0;
    while (i + 1 + n < steps.length && holdable(steps[i + 1 + n]!)) n++;
    return n;
  });
}

/** Whether Add a step › Repeat… is offered: the last step is a block that no repeat holds. */
export function canRepeat(steps: readonly PlanStep[]): boolean {
  const last = steps.length - 1;
  return (
    last >= 0 &&
    holdable(steps[last]!) &&
    heldBy(steps)[last] === null &&
    steps.length < PLAN_LIMITS.steps
  );
}

/** A `repeat` step holding the given number of steps, with no words yet. */
export function repeatStep(times = 2, holds = 1): PlanStep {
  return {
    words: '',
    kind: 'repeat',
    actor: '',
    action: '',
    target: '',
    details: [],
    line: '',
    sketch: '',
    together: false,
    repeat: times,
    holds,
    why: '',
  };
}

/** Repeat…: "Repeat 2 times:" put before the last step, holding it. */
export function addRepeat(steps: readonly PlanStep[]): StepsEdit {
  if (!canRepeat(steps)) return { steps: null };
  const next = [...steps];
  next.splice(next.length - 1, 0, repeatStep());
  return { steps: next };
}

/** The repeat whose held steps sit at `at` in `steps` (between it and its last), or null. */
function rangeAt(steps: readonly PlanStep[], at: number): number | null {
  for (let r = 0; r < steps.length; r++) {
    const s = steps[r]!;
    if (s.kind === 'repeat' && r < at && at <= r + s.holds) return r;
  }
  return null;
}

const withHolds = (steps: PlanStep[], at: number, holds: number) => {
  steps[at] = { ...steps[at]!, holds };
};

/**
 * Moves a step to `to`, its place in the plan after the move. A repeat moves with the steps it
 * holds. A block step dropped between a repeat and its last held step goes inside; a held step
 * moved out leaves. A step that can't be held, or a repeat, can't be dropped inside a repeat.
 */
export function moveStep(steps: readonly PlanStep[], from: number, to: number): StepsEdit {
  const moving = steps[from];
  if (moving === undefined || to < 0) return { steps: null };
  const held = heldBy(steps);
  const size = moving.kind === 'repeat' ? 1 + moving.holds : 1;
  const group = steps.slice(from, from + size);
  const rest = [...steps.slice(0, from), ...steps.slice(from + size)];
  let words: string | undefined;

  // A held step's repeat comes before it, so it keeps its place in `rest`.
  const holder = moving.kind === 'repeat' ? null : held[from]!;
  if (holder !== null) {
    const left = rest[holder]!.holds - 1;
    // Moved within its own repeat, to anywhere from its first place to its last: still inside.
    if (to > holder && to <= holder + left + 1) {
      rest.splice(to, 0, ...group);
      return changed(steps, rest) ? { steps: rest } : { steps: null };
    }
    // Moved out: the repeat holds one fewer, and goes if it holds nothing then.
    if (left === 0) {
      rest.splice(holder, 1);
      words = PLAN_EDIT_WORDS.repeatGone;
      if (holder < to) to--;
    } else withHolds(rest, holder, left);
  }
  if (to > rest.length) return { steps: null };

  const inside = rangeAt(rest, to);
  if (inside !== null) {
    if (moving.kind === 'repeat' || !holdable(moving))
      return { steps: null, words: PLAN_EDIT_WORDS.cantHold };
    withHolds(rest, inside, rest[inside]!.holds + 1);
  }
  rest.splice(to, 0, ...group);
  if (!changed(steps, rest)) return { steps: null };
  return words ? { steps: rest, words } : { steps: rest };
}

/** Whether an edit changed anything: another length, or any step in another place or form. */
const changed = (before: readonly PlanStep[], after: readonly PlanStep[]) =>
  before.length !== after.length || after.some((s, i) => s !== before[i]);

/**
 * Deletes a step. A repeat's held steps stay, no longer held. A held step leaves its repeat one
 * fewer, and the repeat goes too when it holds nothing then.
 */
export function deleteStep(steps: readonly PlanStep[], index: number): StepsEdit {
  if (steps[index] === undefined) return { steps: null };
  const holder = steps[index]!.kind === 'repeat' ? null : heldBy(steps)[index]!;
  const next = steps.filter((_, i) => i !== index);
  if (holder === null) return { steps: next };
  const left = next[holder]!.holds - 1;
  if (left > 0) {
    withHolds(next, holder, left);
    return { steps: next };
  }
  next.splice(holder, 1);
  return { steps: next, words: PLAN_EDIT_WORDS.repeatGone };
}

/** Whether a repeat's How many times and Steps inside are within their limits. */
export function repeatFits(steps: readonly PlanStep[], index: number, step: PlanStep): boolean {
  if (step.kind !== 'repeat') return true;
  const most = stepsInsideMax(steps)[index] ?? 0;
  return (
    Number.isInteger(step.repeat) &&
    step.repeat >= 2 &&
    step.repeat <= PLAN_LIMITS.repeat &&
    Number.isInteger(step.holds) &&
    step.holds >= 1 &&
    step.holds <= most
  );
}
