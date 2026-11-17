import { describe, expect, it } from 'vitest';
import type { PlanStep, PlanWorld } from './plans.ts';
import { stepWords } from './step-words.ts';

const world: PlanWorld = {
  objects: new Map([
    ['this', 'Scene'],
    ['penguin', 'Flyer'],
    ['fox', 'Quadruped'],
  ]),
  lines: new Map([['l3', "Don't be scared. I'm lost too."]]),
  sketches: new Set(),
  scenes: new Set(['s1']),
  isBackstageItem: () => true,
};

const step = (s: Partial<PlanStep>): PlanStep => ({
  words: '',
  kind: 'do',
  actor: 'penguin',
  action: 'move',
  target: '',
  details: [],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  why: '',
  ...s,
});

describe('stepWords (spec 04, section 6.1, step 5)', () => {
  it("says a block's step in the block's own words, values and all", () => {
    const moves = step({
      details: [
        { name: 'direction', value: 'forward' },
        { name: 'amount', value: '3' },
      ],
    });
    expect(stepWords(moves, world)).toBe('Penguin move forward 3.');
  });

  it('follows the phrase with the details it leaves out', () => {
    const turns = step({
      action: 'turn',
      details: [
        { name: 'direction', value: 'left' },
        { name: 'amount', value: '0.25' },
        { name: 'duration', value: '2' },
      ],
    });
    expect(stepWords(turns, world)).toMatch(/^Penguin turn left 0\.25, how long 2\.$/);
  });

  it("uses a line's words exactly, and a new actor once the learner changes it", () => {
    const says = step({ actor: 'fox', action: 'say', line: 'l3' });
    expect(stepWords(says, world)).toBe("Fox say Don't be scared. I'm lost too.");
  });

  it('says how often and whether it runs with the step before', () => {
    const hops = step({
      details: [
        { name: 'direction', value: 'up' },
        { name: 'amount', value: '1' },
      ],
      repeat: 3,
      together: true,
    });
    expect(stepWords(hops, world)).toBe(
      'Penguin move up 1, 3 times, at the same time as the step before.',
    );
  });

  it('gives the other kinds short words of their own', () => {
    expect(stepWords(step({ kind: 'add', actor: 'owl', action: 'example/Flyer/owl' }), world)).toBe(
      'Add owl.',
    );
    expect(stepWords(step({ kind: 'when', action: 'clickOnObject' }), world)).toBe(
      'When an object is clicked.',
    );
    expect(stepWords(step({ kind: 'stage', actor: 'this', action: 's1' }), world)).toBe(
      'Set up the scene from the storyboard.',
    );
  });
});
