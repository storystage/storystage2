import { describe, expect, it } from 'vitest';
import { checkPlan, mismatch, type PlanStep, type PlanWorld } from './plans.ts';

const step = (s: Partial<PlanStep>): PlanStep => ({
  words: 'The owl walks to the tree.',
  kind: 'do',
  actor: 'owl',
  action: 'moveTo',
  target: 'tree',
  details: [],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  why: 'Your sketch has the owl by the tree.',
  ...s,
});

const world: PlanWorld = {
  objects: new Map([
    ['this', 'Scene'],
    ['owl', 'Flyer'],
    ['cat', 'Quadruped'],
    ['tree', 'Prop'],
  ]),
  lines: new Map([['l4', 'Here is the key.']]),
  sketches: new Set(['k4']),
  scenes: new Set(['s1', 's2']),
  isBackstageItem: (id) => id === 'Quadruped/Fox/RedFox',
};

describe('checkPlan (spec 04, section 6.3)', () => {
  it("passes the workplan's frame 2.3 plan", () => {
    expect(
      checkPlan(
        [
          step({}),
          step({ words: 'The owl turns to face the cat.', action: 'turnToFace', target: 'cat' }),
          step({ words: "The owl says 'Here is the key.'", action: 'say', target: '', line: 'l4' }),
          step({
            words: 'The cat jumps.',
            actor: 'cat',
            action: 'move',
            target: '',
            together: true,
          }),
        ],
        world,
      ),
    ).toEqual([]);
  });

  it('says, on the step, when who does it is missing, in plain words', () => {
    expect(checkPlan([step({}), step({ actor: 'fox' })], world)).toEqual([
      {
        step: 2,
        message: "There's no fox in this scene yet. Add one first, or change who does this.",
      },
    ]);
  });

  it('lets a step use an object an earlier step adds, but not a later one', () => {
    const add = step({
      words: 'Add a fox.',
      kind: 'add',
      actor: 'fox',
      action: 'Quadruped/Fox/RedFox',
      target: '',
    });
    const use = step({ actor: 'fox', action: 'move', target: '' });
    expect(checkPlan([add, use], world)).toEqual([]);
    expect(checkPlan([use, add], world).map((p) => p.step)).toEqual([1]);
  });

  it('finds a block the actor does not have, and a setting the block does not have', () => {
    expect(checkPlan([step({ action: 'fly' })], world)[0]?.message).toBe(
      'The owl has no fly block.',
    );
    expect(
      checkPlan([step({ details: [{ name: 'colour', value: 'red' }] })], world)[0]?.message,
    ).toBe('A moveTo block has no colour setting.');
    expect(checkPlan([step({ details: [{ name: 'duration', value: '2' }] })], world)).toEqual([]);
  });

  it('finds a missing target, line or sketch', () => {
    expect(checkPlan([step({ target: 'moon' })], world)[0]?.message).toMatch(/no moon/);
    expect(checkPlan([step({ line: 'l9' })], world)[0]?.message).toMatch(/script/);
    expect(checkPlan([step({ sketch: 'k9' })], world)[0]?.message).toMatch(/sketch/);
  });

  it('checks adds, changes, events and staging', () => {
    const problems = checkPlan(
      [
        step({ kind: 'add', actor: 'dragon', action: 'Dragon/Red', target: '' }),
        step({ kind: 'add', actor: 'cat', action: 'Quadruped/Fox/RedFox', target: '' }),
        step({ kind: 'change', actor: 'cat', action: 'logline', target: '' }),
        step({ kind: 'when', actor: 'cat', action: 'mouse_click_on_object', target: '' }),
        step({ kind: 'stage', actor: 'scene', action: 's9', target: '' }),
      ],
      world,
    );
    expect(problems.map((p) => p.message)).toEqual([
      "Dragon/Red isn't in Backstage.",
      "There's already something called cat here.",
      "logline isn't something a step can set.",
      "There's no mouse_click_on_object event.",
      "There's no scene s9.",
    ]);
  });

  it('never uses the words rule 9 keeps from learners', () => {
    const all = checkPlan(
      [
        step({ actor: 'fox' }),
        step({ action: 'fly' }),
        step({ kind: 'when', action: 'x', target: '' }),
      ],
      world,
    );
    for (const { message } of all) expect(message).not.toMatch(/\b(AST|node|token|schema|API)\b/);
  });
});

describe('mismatch (spec 04, section 6.4)', () => {
  const walk = step({});

  it('accepts the call that does exactly the step', () => {
    expect(
      mismatch(
        'insert_statement',
        {
          target: 'owl',
          procedure: 'moveTo',
          arguments: [{ name: 'target', value: 'tree' }],
        },
        walk,
      ),
    ).toBeNull();
  });

  it('refuses a different actor, block or target', () => {
    for (const input of [
      { target: 'cat', procedure: 'moveTo', arguments: [{ name: 'target', value: 'tree' }] },
      { target: 'owl', procedure: 'move', arguments: [{ name: 'target', value: 'tree' }] },
      { target: 'owl', procedure: 'moveTo', arguments: [{ name: 'target', value: 'cat' }] },
    ])
      expect(mismatch('insert_statement', input, walk)).toMatch(/Build exactly the agreed step/);
  });

  it('holds a value the learner changed: 3 metres, not 2', () => {
    const edited = step({ action: 'move', target: '', details: [{ name: 'amount', value: '3' }] });
    const call = (amount: string) => ({
      target: 'owl',
      procedure: 'move',
      arguments: [
        { name: 'direction', value: 'forward' },
        { name: 'amount', value: amount },
      ],
    });
    expect(mismatch('insert_statement', call('3'), edited)).toBeNull();
    expect(mismatch('insert_statement', call('2'), edited)).not.toBeNull();
  });

  it('wants the line the step names, and no other', () => {
    const say = step({ action: 'say', target: '', line: 'l4' });
    const call = {
      target: 'owl',
      procedure: 'say',
      arguments: [{ name: 'text', value: 'Here is the key.' }],
    };
    expect(mismatch('insert_statement', { ...call, line: 'l4' }, say)).toBeNull();
    expect(mismatch('insert_statement', call, say)).not.toBeNull();
  });

  it('allows the blocks that hold a step together or repeat it, and nothing else', () => {
    const together = step({ together: true });
    const thrice = step({ repeat: 3 });
    expect(mismatch('insert_control', { kind: 'doTogether' }, together)).toBeNull();
    expect(mismatch('insert_control', { kind: 'count', count: 3 }, thrice)).toBeNull();
    expect(mismatch('insert_control', { kind: 'count', count: 2 }, thrice)).not.toBeNull();
    expect(mismatch('insert_control', { kind: 'doTogether' }, walk)).not.toBeNull();
    expect(mismatch('insert_control', { kind: 'while' }, together)).not.toBeNull();
  });

  it('matches adds, changes, events and staging to their steps', () => {
    const add = step({ kind: 'add', actor: 'fox', action: 'Quadruped/Fox/RedFox' });
    expect(
      mismatch('add_model', { name: 'fox', backstage_item: 'Quadruped/Fox/RedFox' }, add),
    ).toBeNull();
    expect(
      mismatch('add_model', { name: 'dog', backstage_item: 'Quadruped/Fox/RedFox' }, add),
    ).not.toBeNull();
    const fade = step({
      kind: 'change',
      actor: 'cat',
      action: 'opacity',
      details: [{ name: 'value', value: '0.5' }],
    });
    expect(
      mismatch('set_property', { object: 'cat', property: 'opacity', value: '0.5' }, fade),
    ).toBeNull();
    expect(
      mismatch('set_property', { object: 'cat', property: 'opacity', value: '1' }, fade),
    ).not.toBeNull();
    const click = step({ kind: 'when', action: 'clickOnObject' });
    expect(mismatch('add_event_listener', { event: 'clickOnObject' }, click)).toBeNull();
    expect(mismatch('add_event_listener', { event: 'keyPress' }, click)).not.toBeNull();
    expect(
      mismatch('stage_scene', { scene: 's2' }, step({ kind: 'stage', action: 's2' })),
    ).toBeNull();
    expect(
      mismatch('insert_statement', { target: 'owl', procedure: 'moveTo' }, click),
    ).not.toBeNull();
  });
});
