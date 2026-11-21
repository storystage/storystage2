import { describe, expect, it } from 'vitest';
import type { PlanStep } from './plans.ts';
import {
  PLAN_EDIT_WORDS,
  addRepeat,
  canRepeat,
  deleteStep,
  heldBy,
  moveStep,
  repeatFits,
  repeatStep,
  stepsInsideMax,
} from './repeats.ts';

const block = (words: string): PlanStep => ({
  words,
  kind: 'do',
  actor: 'penguin',
  action: 'move',
  target: '',
  details: [],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  holds: 0,
  why: '',
});
const when: PlanStep = { ...block('when'), kind: 'when', action: 'clickOnObject' };

/** The plan as letters: R2 for a repeat holding 2, a lower-case letter for a block. */
const show = (steps: readonly PlanStep[] | null) =>
  steps?.map((s) => (s.kind === 'repeat' ? `R${s.holds}` : s.words)).join(' ') ?? 'refused';

// 1. Repeat 3 times: 2. up 3. down 4. say
const hop = () => [repeatStep(3, 2), block('u'), block('d'), block('s')];

describe('which repeat holds a step (spec 04, section 6.8)', () => {
  it('knows each held step, how far a repeat can reach, and when Repeat… is offered', () => {
    expect(heldBy(hop())).toEqual([null, 0, 0, null]);
    expect(stepsInsideMax(hop())).toEqual([3, null, null, null]);
    expect(stepsInsideMax([repeatStep(2, 1), block('a'), when, block('b')])).toEqual([
      1,
      null,
      null,
      null,
    ]);
    expect(canRepeat(hop())).toBe(true);
    expect(canRepeat([repeatStep(2, 1), block('a')])).toBe(false);
    expect(canRepeat([block('a'), when])).toBe(false);
  });

  it('adds Repeat… before the last step, holding it', () => {
    expect(show(addRepeat([block('a'), block('b')]).steps)).toBe('a R1 b');
    expect(addRepeat([block('a'), when]).steps).toBeNull();
  });

  it("keeps a repeat's How many times and Steps inside within their limits", () => {
    const steps = hop();
    expect(repeatFits(steps, 0, { ...steps[0]!, holds: 3 })).toBe(true);
    expect(repeatFits(steps, 0, { ...steps[0]!, holds: 4 })).toBe(false);
    expect(repeatFits(steps, 0, { ...steps[0]!, holds: 0 })).toBe(false);
    expect(repeatFits(steps, 0, { ...steps[0]!, repeat: 1 })).toBe(false);
  });
});

describe('moving a step', () => {
  it('moves a repeat with the steps it holds', () => {
    expect(show(moveStep(hop(), 0, 1).steps)).toBe('s R2 u d');
  });

  it('takes a block inside when it lands between a repeat and its last held step', () => {
    expect(show(moveStep(hop(), 3, 2).steps)).toBe('R3 u s d');
    // Just after the last held step, it stays outside.
    expect(show(moveStep([block('x'), ...hop()], 0, 3).steps)).toBe('R2 u d x s');
  });

  it('lets a held step out of its repeat, and keeps one reordered within it inside', () => {
    expect(show(moveStep(hop(), 1, 3).steps)).toBe('R1 d s u');
    expect(show(moveStep(hop(), 1, 2).steps)).toBe('R2 d u s');
  });

  it('removes a repeat whose only step leaves it, and says so', () => {
    const edit = moveStep([repeatStep(2, 1), block('a'), block('b')], 1, 2);
    expect(show(edit.steps)).toBe('b a');
    expect(edit.words).toBe(PLAN_EDIT_WORDS.repeatGone);
  });

  it("refuses a step that can't be held, or another repeat, inside a repeat", () => {
    for (const steps of [
      [...hop(), when],
      [...hop(), repeatStep(2, 1), block('x')],
    ]) {
      const edit = moveStep(steps, 4, 2);
      expect(edit.steps).toBeNull();
      expect(edit.words).toBe(PLAN_EDIT_WORDS.cantHold);
    }
  });

  it('changes nothing for a move to where the step already is', () => {
    expect(moveStep(hop(), 3, 3).steps).toBeNull();
  });
});

describe('deleting a step', () => {
  it("keeps a repeat's steps when the repeat goes", () => {
    expect(show(deleteStep(hop(), 0).steps)).toBe('u d s');
  });

  it('leaves the repeat one fewer, and removes it when it holds nothing, saying so', () => {
    expect(show(deleteStep(hop(), 1).steps)).toBe('R1 d s');
    const edit = deleteStep([repeatStep(2, 1), block('a'), block('b')], 1);
    expect(show(edit.steps)).toBe('b');
    expect(edit.words).toBe(PLAN_EDIT_WORDS.repeatGone);
  });
});
