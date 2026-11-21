import { describe, expect, it } from 'vitest';
import type { NodeId, Statement, TypeDecl } from '@storystage/ast';
import type { SceneObjectSetup } from '@storystage/story-api';
import type { PlanStep } from './plans.ts';
import { stepsDone, type ProgressWorld } from './progress.ts';

const step = (s: Partial<PlanStep>): PlanStep => ({
  words: 'The penguin waddles forward.',
  kind: 'do',
  actor: 'penguin',
  action: 'move',
  target: '',
  details: [
    { name: 'direction', value: 'forward' },
    { name: 'amount', value: '1' },
  ],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  holds: 0,
  why: 'So she reaches the fox.',
  ...s,
});

let n = 0;
const id = () => `node${String(++n).padStart(4, '0')}` as NodeId;
const field = (name: string) =>
  ({
    id: `field${name}` as NodeId,
    kind: 'field',
    name,
    type: { kind: 'story', name: 'Flyer' },
  }) as never;
const move = (amount: number): Statement => ({
  id: id(),
  kind: 'call',
  target: {
    id: id(),
    kind: 'fieldRef',
    target: { id: id(), kind: 'this' },
    field: 'fieldpenguin' as NodeId,
  },
  callee: { kind: 'story', name: 'move' },
  args: {
    direction: { id: id(), kind: 'enum', type: 'MoveDirection', value: 'forward' },
    amount: { id: id(), kind: 'number', value: amount },
  },
  details: {},
});
const count = (times: number, body: Statement[]): Statement => ({
  id: id(),
  kind: 'count',
  times: { id: id(), kind: 'wholeNumber', value: times },
  body,
});
const together = (body: Statement[]): Statement => ({ id: id(), kind: 'doTogether', body });

function world(body: Statement[], more: Partial<ProgressWorld> = {}): ProgressWorld {
  const type = {
    id: 'scenetype' as NodeId,
    kind: 'type',
    name: 'Scene2',
    extends: { kind: 'story', name: 'Scene' },
    fields: [field('penguin')],
    methods: [
      {
        id: 'scenemethod' as NodeId,
        kind: 'method',
        name: 'myFirstMethod',
        returns: null,
        params: [],
        body,
      },
    ],
    listeners: [],
  } as unknown as TypeDecl;
  return {
    type,
    classOf: (name) => (name === 'penguin' ? 'Flyer' : name === 'this' ? 'Scene' : null),
    objects: [],
    lines: new Map(),
    counts: () => true,
    staged: false,
    ...more,
  };
}

describe('stepsDone (spec 04, section 6.6)', () => {
  it("ticks a step for a block that does what it says, values and all ('1' is 1.0)", () => {
    expect(stepsDone([step({})], world([move(1)]))).toEqual([true]);
    expect(stepsDone([step({})], world([move(2)]))).toEqual([false]);
  });

  it("wants a repeat's count and a together's do together", () => {
    const thrice = step({ repeat: 3 });
    expect(stepsDone([thrice], world([move(1)]))).toEqual([false]);
    expect(stepsDone([thrice], world([count(2, [move(1)])]))).toEqual([false]);
    expect(stepsDone([thrice], world([count(3, [move(1)])]))).toEqual([true]);
    const both = step({ together: true });
    expect(stepsDone([both], world([move(1)]))).toEqual([false]);
    expect(stepsDone([both], world([together([move(1)])]))).toEqual([true]);
  });

  it("counts only the learner's blocks for this plan", () => {
    const old = move(1);
    expect(stepsDone([step({})], world([old], { counts: (i) => i !== old.id }))).toEqual([false]);
  });

  it('ticks an add, a change and a when by the scene, and a stage by its set-up', () => {
    const penguin = {
      id: 'penguin',
      model: 'example/Flyer/penguin',
      class: 'Flyer',
      transform: {
        position: { x: 1, y: 0, z: 2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      paint: 'red',
    } as unknown as SceneObjectSetup;
    const here = world([], { objects: [penguin], staged: true });
    expect(
      stepsDone(
        [
          step({ kind: 'add', action: 'example/Flyer/penguin', details: [] }),
          step({ kind: 'add', action: 'example/Flyer/owl', details: [] }),
          step({ kind: 'change', action: 'paint', details: [{ name: 'paint', value: 'red' }] }),
          step({
            kind: 'change',
            action: 'position',
            details: [{ name: 'value', value: '1, 0, 2' }],
          }),
          step({ kind: 'change', action: 'opacity', details: [{ name: 'value', value: '0.5' }] }),
          step({ kind: 'when', action: 'clickOnObject', details: [] }),
          step({ kind: 'stage', actor: 'scene', action: 's2', details: [] }),
        ],
        here,
      ),
    ).toEqual([true, false, true, true, false, false, true]);
  });
});

describe('ticking a repeat of several steps (spec 04, section 6.8)', () => {
  const loop = step({
    words: 'Repeat 3 times:',
    kind: 'repeat',
    actor: '',
    action: '',
    details: [],
    repeat: 3,
    holds: 2,
  });

  it('ticks the repeat for a count with its times, and its steps only inside one', () => {
    const steps = [loop, step({}), step({})];
    expect(stepsDone(steps, world([count(3, [move(1), move(1)])]))).toEqual([true, true, true]);
    expect(stepsDone(steps, world([move(1), move(1), count(3, [])]))).toEqual([true, false, false]);
    expect(stepsDone(steps, world([count(2, [move(1), move(1)])]))).toEqual([false, false, false]);
  });
});
