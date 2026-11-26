import { describe, expect, it } from 'vitest';
import { indexProgram, type Expression, type ListenerDecl } from '@storystage/ast';
import { ProductionSession, exampleProduction, sceneId } from '@storystage/production';
import { findEvent } from '@storystage/story-api';
import { checkProgram } from '@storystage/story-api/program-check';
import { stepKeys, type PlanStep } from './plans.ts';
import { PrompterRunner } from './runner.ts';
import type { Json, JsonObject } from './transport.ts';

// Spec 02 section 6a, the Prompter's part (spec 04, section 6.10): a key event's when step says
// which keys it's for, and the plan check, the build and Plan only hold it to them.

const when = (action: string, keys?: string, extra: Partial<PlanStep> = {}): PlanStep => ({
  words: 'When a key is pressed…',
  kind: 'when',
  actor: 'scene',
  action,
  target: '',
  details: keys === undefined ? [] : [{ name: 'keys', value: keys }],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  holds: 0,
  why: 'To wait for a key.',
  ...extra,
});

function setUp() {
  const session = new ProductionSession<string>(exampleProduction(), {
    check: (p) => checkProgram(p),
  });
  const runner = new PrompterRunner({
    session,
    source: 'prompter',
    scene: () => sceneId('s2'),
    backstageClass: () => null,
  });
  const run = (name: string, input: object) =>
    runner.run(name as never, input as unknown as JsonObject);
  const scene = () => session.program().types.find((t) => t.name === 'Scene2')!;
  return { session, runner, run, scene };
}

const problems = (steps: PlanStep[]) =>
  setUp()
    .runner.checkSteps(steps, null)
    .map((p) => p.message);

describe('which keys a when step is for (spec 02, section 6a)', () => {
  it('reads a list of Key names, and a digit as its number key', () => {
    expect(stepKeys(when('keyPress'))).toBeNull();
    expect(stepKeys(when('keyPress', 'space'))).toEqual(['space']);
    expect(stepKeys(when('keyPress', 'w, up'))).toEqual(['w', 'up']);
    expect(stepKeys(when('numberKeyPress', '3'))).toEqual(['digit3']);
    expect(stepKeys(when('numberKeyPress', 'number 3, Number 4'))).toEqual(['digit3', 'digit4']);
    // By its name in any case, or by its own words (S6's review).
    expect(stepKeys(when('keyPress', 'Space, W, backspace'))).toEqual(['space', 'w', 'backSpace']);
    expect(stepKeys(when('arrowKeyPress', 'up arrow, Space bar'))).toEqual(['up', 'space']);
    const key = when('keyPress', undefined, { details: [{ name: 'key', value: 'space' }] });
    expect(stepKeys(key)).toEqual(['space']);
  });

  it("takes any key for keyPress, and only an event's own for the others", () => {
    expect(problems([when('keyPress', 'space')])).toEqual([]);
    expect(problems([when('keyPress', 'w, up')])).toEqual([]);
    expect(problems([when('keyPress')])).toEqual([]);
    expect(problems([when('arrowKeyPress', 'left')])).toEqual([]);
    expect(problems([when('numberKeyPress', '3, digit4')])).toEqual([]);
    expect(problems([when('arrowKeyPress', 'a')])).toEqual([
      "A arrowKeyPress event isn't for a: it's for up, down, left, right.",
    ]);
    expect(problems([when('numberKeyPress', 'space')])).toEqual([
      "A numberKeyPress event isn't for space: it's for digit0, digit1, digit2, digit3, digit4, digit5, digit6, digit7, digit8, digit9.",
    ]);
    expect(problems([when('arrowKeyPress', 'Left arrow')])).toEqual([]);
    expect(problems([when('keyPress', 'spacebar')])).toEqual([
      "spacebar isn't a key. Use a Key name, such as space or w.",
    ]);
  });

  it('refuses an empty list, a key twice, keys given twice, and keys on another event', () => {
    expect(problems([when('keyPress', '')])).toEqual([
      'Say which keys a keyPress event is for, or leave keys out for any key.',
    ]);
    expect(problems([when('keyPress', 'space, space')])).toEqual([
      'A keyPress event names space twice.',
    ]);
    // `key` is `keys` by another name (spec 04, section 6.10), so it's once, as either.
    const key = { name: 'key', value: 'space' };
    expect(problems([when('keyPress', undefined, { details: [key] })])).toEqual([]);
    expect(
      problems([when('keyPress', 'enter', { details: [key, { name: 'keys', value: 'enter' }] })]),
    ).toEqual(['A keyPress event says which keys once, as keys.']);
    expect(problems([when('clickOnObject', 'space', { actor: 'penguin' })])).toEqual([
      'A clickOnObject event has no keys setting.',
    ]);
  });
});

describe('building a key listener for its keys (spec 02, section 6a)', () => {
  /** Shows a plan, agrees to it, and builds its when step. */
  function build(step: PlanStep, event = step.action) {
    const set = setUp();
    set.runner.begin('When I press a key', {});
    expect(set.run('propose_plan', { steps: [step] })).toMatchObject({ ok: true });
    set.runner.end();
    const shown = set.runner.latestPlan()!;
    set.runner.begin('Build these steps.', { agreedPlan: shown as unknown as Json });
    const result = set.run('add_event_listener', {
      event,
      objects: [],
      other_objects: [],
      narration: 'It waits for a key.',
      plan_step: 1,
    });
    set.runner.end();
    return { ...set, result, listener: () => set.scene().listeners.at(-1)! };
  }
  const keysOf = (listener: ListenerDecl) => {
    const keys = listener.details['keys'];
    return keys?.kind === 'arrayOf'
      ? keys.items.map((k) => (k.kind === 'enum' ? `${k.type}.${k.value}` : k.kind))
      : null;
  };

  it('builds "When I press space" for space only, as a list of Key the check passes', () => {
    const { result, listener, session } = build(when('keyPress', 'space'));
    expect(result).toMatchObject({ ok: true });
    expect(listener().details['keys']).toMatchObject({ kind: 'arrayOf', of: { name: 'Key' } });
    expect(keysOf(listener())).toEqual(['Key.space']);
    expect(checkProgram(session.program())).toEqual([]);
  });

  it('builds several keys in order, and a digit as its number key', () => {
    expect(keysOf(build(when('keyPress', 'w, up')).listener())).toEqual(['Key.w', 'Key.up']);
    const number = build(when('numberKeyPress', '3'));
    expect(keysOf(number.listener())).toEqual(['Key.digit3']);
    expect(checkProgram(number.session.program())).toEqual([]);
  });

  it('builds a listener for any key when the step names none', () => {
    const { listener, session } = build(when('keyPress'));
    expect(keysOf(listener())).toBeNull();
    expect(checkProgram(session.program())).toEqual([]);
  });
});

describe('Plan only ticks a key step by its keys (spec 02, section 6a; spec 04, 6.6)', () => {
  /** Whether the learner's own listener ticks the step. */
  function ticks(step: PlanStep, keys: string[] | null, event = step.action): boolean {
    const { runner, run, session, scene } = setUp();
    runner.begin('When I press a key', {});
    expect(run('propose_plan', { steps: [step] })).toMatchObject({ ok: true });
    runner.end();
    const shown = runner.latestPlan()!;
    const before = new Set(indexProgram(session.program()).keys());
    // Node ids start with a letter (`NODE_ID_PATTERN`).
    const id = () => `k${Math.random().toString(36).slice(2, 8)}` as never;
    const items: Expression[] = (keys ?? []).map((value) => ({
      id: id(),
      kind: 'enum',
      type: 'Key',
      value,
    }));
    const listener: ListenerDecl = {
      id: id(),
      kind: 'listener',
      event,
      args: {},
      details:
        keys === null
          ? {}
          : { keys: { id: id(), kind: 'arrayOf', of: { kind: 'story', name: 'Key' }, items } },
      // What the event gives, as the editors declare it.
      params: findEvent(event)!.gives.map((g) => ({
        id: id(),
        kind: 'parameter',
        name: g.name,
        type: { kind: 'story', name: g.type },
        default: null,
      })),
      body: [],
    };
    const done = session.apply(
      [
        {
          kind: 'declare',
          label: 'Add',
          parent: scene().id,
          index: scene().listeners.length,
          node: listener,
        },
      ],
      'Add',
      'learner',
    );
    expect(done.ok).toBe(true);
    return runner.progress(shown.steps, null, before)[0]!;
  }

  it('ticks a listener for the same keys, in any order', () => {
    expect(ticks(when('keyPress', 'space'), ['space'])).toBe(true);
    expect(ticks(when('keyPress', 'w, up'), ['up', 'w'])).toBe(true);
    expect(ticks(when('numberKeyPress', '3'), ['digit3'])).toBe(true);
  });

  it('ticks no listener for other keys, more keys, or any key', () => {
    expect(ticks(when('keyPress', 'space'), ['enter'])).toBe(false);
    expect(ticks(when('keyPress', 'space'), ['space', 'enter'])).toBe(false);
    expect(ticks(when('keyPress', 'space'), null)).toBe(false);
  });

  it('asks no keys of a step that gives none (spec 04, section 6.10)', () => {
    expect(ticks(when('keyPress'), null)).toBe(true);
    expect(ticks(when('keyPress'), ['space'])).toBe(true);
  });

  it("builds and ticks a step's key as its keys", () => {
    const key = when('keyPress', undefined, { details: [{ name: 'key', value: 'space' }] });
    expect(ticks(key, ['space'])).toBe(true);
    expect(ticks(key, null)).toBe(false);
  });
});
