import { describe, expect, it } from 'vitest';
import { indexProgram, type ListenerDecl, type Statement } from '@storystage/ast';
import { ProductionSession, exampleProduction, sceneId } from '@storystage/production';
import { checkProgram } from '@storystage/story-api/program-check';
import { PrompterPanel } from './panel.ts';
import type { PlanStep } from './plans.ts';
import { PrompterRunner } from './runner.ts';
import { PrompterSession } from './session.ts';
import { chainOf, eventOf, holderOf, stepBefore } from './shape.ts';
import { buildSystem } from './system-prompt.ts';
import { testReply, type TestBlock } from './testing.ts';
import { TOOLS } from './tools.ts';
import { scriptedTransport, type Json, type JsonObject, type PrompterEvent } from './transport.ts';

const moving = [
  { name: 'direction', value: 'forward' },
  { name: 'amount', value: '1' },
];
const step = (s: Partial<PlanStep> = {}): PlanStep => ({
  words: 'The penguin moves.',
  kind: 'do',
  actor: 'penguin',
  action: 'move',
  target: '',
  details: moving,
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  holds: 0,
  why: 'To go.',
  ...s,
});
const when = (action: string, s: Partial<PlanStep> = {}) =>
  step({ words: 'When something happens…', kind: 'when', action, details: [], ...s });
const repeat = (times: number, holds: number) =>
  step({
    words: `Repeat ${times} times:`,
    kind: 'repeat',
    actor: '',
    action: '',
    details: [],
    repeat: times,
    holds,
  });

function setUp(steps: PlanStep[], frame: string | null = null) {
  const session = new ProductionSession<string>(exampleProduction(), {
    check: (p) => checkProgram(p),
  });
  const runner = new PrompterRunner({
    session,
    source: 'prompter',
    scene: () => sceneId('s2'),
    backstageClass: (id) => (id === 'example/Prop/rock' ? 'Prop' : null),
  });
  runner.begin('go', { agreedPlan: { plan: 'p1', frame, steps } as unknown as Json });
  const run = (name: string, input: object) =>
    runner.run(name as never, input as unknown as JsonObject);
  const move = (plan_step: number, extra: object = {}) =>
    run('insert_statement', {
      method: 'myFirstMethod',
      position: 'end',
      target: 'penguin',
      procedure: 'move',
      arguments: moving,
      narration: 'It moves.',
      plan_step,
      ...extra,
    });
  const control = (kind: string, plan_step: number, extra: object = {}) =>
    run('insert_control', {
      method: 'myFirstMethod',
      position: 'end',
      kind,
      narration: 'A block.',
      plan_step,
      ...extra,
    });
  const listen = (plan_step: number, objects: string[] = ['penguin']) =>
    run('add_event_listener', {
      event: 'clickOnObject',
      objects,
      other_objects: [],
      narration: 'It waits for a click.',
      plan_step,
    });
  const script = () => session.program().types.find((t) => t.name === 'Scene2')!.methods[0]!.body;
  return { session, runner, run, move, control, listen, script };
}
const id = (result: { ok: boolean; ids?: Record<string, string> }) =>
  (result.ok && result.ids?.block) || '';

describe('shape.ts: where each step goes (spec 04, section 6.10)', () => {
  const plan = [
    step(),
    step({ together: true }),
    repeat(2, 1),
    step(),
    step({ repeat: 3 }),
    when('clickOnObject'),
    step(),
    step(),
  ];

  it('gives each step its chain of blocks', () => {
    expect(plan.map((_, i) => chainOf(plan, i))).toEqual([
      ['doTogether', 'block'],
      ['block'],
      ['count'],
      ['block'],
      ['count', 'block'],
      [],
      ['block'],
      ['block'],
    ]);
  });

  it('gives each its holder, and the step it follows there', () => {
    expect(plan.map((_, i) => holderOf(plan, i))).toEqual([
      { kind: 'script' },
      { kind: 'group', of: 0 },
      { kind: 'script' },
      { kind: 'repeat', of: 2 },
      { kind: 'script' },
      { kind: 'script' },
      { kind: 'event', of: 5 },
      { kind: 'event', of: 5 },
    ]);
    expect(plan.map((_, i) => stepBefore(plan, i))).toEqual([null, 0, 0, null, 2, 4, null, 6]);
    expect(eventOf(plan, 7)).toBe(5);
  });

  it("gives a group of three one do together, its first step's (board-07)", () => {
    const three = [step(), step({ together: true }), step({ together: true })];
    expect(three.map((_, i) => chainOf(three, i))).toEqual([
      ['doTogether', 'block'],
      ['block'],
      ['block'],
    ]);
    expect(three.map((_, i) => holderOf(three, i))).toEqual([
      { kind: 'script' },
      { kind: 'group', of: 0 },
      { kind: 'group', of: 0 },
    ]);
    expect(three.map((_, i) => stepBefore(three, i))).toEqual([null, 0, 1]);
  });

  it('gives a repeat that starts a group its do together', () => {
    const grouped = [repeat(2, 1), step(), step({ together: true })];
    expect(chainOf(grouped, 0)).toEqual(['doTogether', 'count']);
    expect(holderOf(grouped, 2)).toEqual({ kind: 'group', of: 0 });
  });
});

describe('the build is the plan in shape (spec 04, section 6.10)', () => {
  it('builds side by side, in order, in the script', () => {
    const { move, script } = setUp([step({ words: 'One.' }), step({ words: 'Two.' })]);
    expect(move(1)).toMatchObject({ ok: true });
    expect(move(2)).toMatchObject({ ok: true });
    expect(script().map((s) => (s.kind === 'comment' ? s.text : s.kind))).toEqual([
      'call',
      'One.',
      'call',
      'Two.',
      'call',
    ]);
  });

  it('takes the first block anywhere in the script, and the next straight after it', () => {
    const { move } = setUp([step(), step()]);
    expect(move(1, { position: '0' })).toMatchObject({ ok: true });
    expect(move(2)).toMatchObject({ ok: false, error: 'not_in_plan' });
    expect(move(2, { position: '2' })).toMatchObject({ ok: true });
  });

  // The nine cases the probes of 22 Nov let through.
  it('refuses a step built twice', () => {
    const { move } = setUp([step()]);
    move(1);
    expect(move(1)).toMatchObject({ error: 'not_in_plan' });
  });

  it('refuses a step built before the one it follows', () => {
    const { move } = setUp([step(), step()]);
    const out = move(2);
    expect(out).toMatchObject({ error: 'not_in_plan' });
    expect(out.ok || out.message).toMatch(/step 1 comes before step 2/);
  });

  it('refuses a step put above the one it follows', () => {
    const { move } = setUp([step(), step()]);
    move(1);
    const out = move(2, { position: '0' });
    expect(out.ok || out.message).toMatch(/at position \d+ in myFirstMethod/);
  });

  it("refuses a step put in a do together it doesn't run in", () => {
    const { move, control } = setUp([step(), step({ together: true }), step()]);
    const group = id(control('doTogether', 1));
    move(1, { parent_block: group });
    move(2, { parent_block: group });
    expect(move(3, { parent_block: group })).toMatchObject({ error: 'not_in_plan' });
    expect(move(3)).toMatchObject({ ok: true });
  });

  it('refuses a step that runs together, built apart', () => {
    const { move } = setUp([step(), step({ together: true })]);
    expect(move(1)).toMatchObject({ error: 'not_in_plan' });
  });

  it('refuses a step that repeats, built once', () => {
    const { move, control } = setUp([step({ repeat: 3 })]);
    expect(move(1)).toMatchObject({ error: 'not_in_plan' });
    const count = id(control('count', 1, { count: 3 }));
    expect(move(1, { parent_block: count })).toMatchObject({ ok: true });
  });

  it("refuses a when step's block outside its event", () => {
    const { move, listen } = setUp([when('clickOnObject'), step()]);
    const listener = id(listen(1));
    expect(move(2)).toMatchObject({ error: 'not_in_plan' });
    expect(move(2, { parent_block: listener })).toMatchObject({ ok: true });
  });

  it('refuses a listener added twice', () => {
    const { listen } = setUp([when('clickOnObject')]);
    listen(1);
    expect(listen(1)).toMatchObject({ error: 'not_in_plan' });
  });

  it('refuses a model added twice', () => {
    const { run } = setUp([
      step({ kind: 'add', actor: 'rock', action: 'example/Prop/rock', details: [] }),
    ]);
    const add = () =>
      run('add_model', {
        backstage_item: 'example/Prop/rock',
        name: 'rock',
        position: { x: 0, y: 0, z: 0 },
        narration: 'A rock.',
        plan_step: 1,
      });
    expect(add()).toMatchObject({ ok: true });
    expect(add()).toMatchObject({ error: 'not_in_plan' });
  });

  it('refuses a do in order, which no step needs', () => {
    const { control } = setUp([step({ repeat: 2 })]);
    expect(control('doInOrder', 1)).toMatchObject({ error: 'not_in_plan' });
  });

  it("refuses another of the scene's methods", () => {
    const p = exampleProduction();
    const types = p.program.types.map((t) =>
      t.name === 'Scene2'
        ? {
            ...t,
            methods: [
              ...t.methods,
              {
                id: 'dancemove' as never,
                kind: 'method' as const,
                name: 'dance',
                returns: null,
                params: [],
                body: [],
              },
            ],
          }
        : t,
    );
    const session = new ProductionSession<string>({ ...p, program: { ...p.program, types } });
    const runner = new PrompterRunner({
      session,
      source: 'prompter',
      scene: () => sceneId('s2'),
      backstageClass: () => null,
    });
    runner.begin('go', { agreedPlan: { plan: 'p1', frame: null, steps: [step()] } as never });
    expect(
      runner.run('insert_statement', {
        method: 'dance',
        position: 'end',
        target: 'penguin',
        procedure: 'move',
        arguments: moving,
        narration: 'x',
        plan_step: 1,
      } as never),
    ).toMatchObject({ error: 'not_in_plan' });
  });

  it('builds a repeat that runs together with a step after it', () => {
    const { move, control } = setUp([repeat(2, 1), step(), step({ actor: 'fox', together: true })]);
    const group = id(control('doTogether', 1));
    const count = id(control('count', 1, { count: 2, parent_block: group }));
    expect(move(2, { parent_block: count })).toMatchObject({ ok: true });
    expect(move(3, { parent_block: group, target: 'fox' })).toMatchObject({ ok: true });
  });

  it("puts a frame's first block where code_frame said", () => {
    const line = step({ actor: 'fox', action: 'say', details: [], line: 'l3' });
    const { run, script } = setUp([line], 'f2');
    expect(run('code_frame', { frame: 'f2' })).toMatchObject({ ok: true });
    const say = (position: string) =>
      run('insert_statement', {
        method: 'myFirstMethod',
        position,
        target: 'fox',
        procedure: 'say',
        arguments: [{ name: 'text', value: "Don't be scared. I'm lost too." }],
        line: 'l3',
        narration: 'The fox says its line.',
        plan_step: 1,
      });
    expect(say('0')).toMatchObject({ error: 'not_in_plan' });
    expect(say('end')).toMatchObject({ ok: true });
    expect(script().length).toBe(3);
  });

  it("links a frame's blocks in its new listener", () => {
    const { run, listen, session } = setUp([when('clickOnObject'), step()], 'f2');
    run('code_frame', { frame: 'f2' });
    const listener = id(listen(1));
    const built = run('insert_statement', {
      method: 'myFirstMethod',
      parent_block: listener,
      position: 'end',
      target: 'penguin',
      procedure: 'move',
      arguments: moving,
      narration: 'It moves.',
      plan_step: 2,
    });
    expect(built).toMatchObject({ ok: true });
    const links = session.production().frames.find((f) => f.id === 'f2')!.links;
    expect(links).toContain(id(built));
    expect(links).not.toContain(listener);
  });
});

describe('a build that leaves a step out (spec 04, section 6.10)', () => {
  it('ends as a step that failed, naming it', async () => {
    const steps = [step(), step({ words: 'The penguin moves again.' })];
    const use = (name: string, input: unknown): TestBlock => ({
      type: 'tool_use',
      id: `t${name}`,
      name,
      input,
    });
    const replies: PrompterEvent[][] = [
      testReply([use('propose_plan', { steps })]),
      testReply([{ type: 'text', text: 'A plan.' }]),
      testReply([
        use('insert_statement', {
          method: 'myFirstMethod',
          position: 'end',
          target: 'penguin',
          procedure: 'move',
          arguments: moving,
          narration: 'It moves.',
          plan_step: 1,
        }),
      ]),
      testReply([{ type: 'text', text: 'All built.' }]),
    ];
    const scripted = scriptedTransport(() => replies.shift() ?? []);
    const transport = {
      status: async () => ({ available: true }) as const,
      send: scripted.send.bind(scripted),
    };
    const production = new ProductionSession<string>(exampleProduction(), {});
    const runner = new PrompterRunner({
      session: production,
      source: 'prompter',
      scene: () => sceneId('s2'),
      backstageClass: () => null,
    });
    let n = 0;
    const prompter = new PrompterSession({
      transport,
      system: buildSystem({ storyApi: 'class Scene', backstage: 'Cast: cat' }),
      tools: TOOLS as unknown as Json[],
      runner,
      newId: () => `r${++n}`,
    });
    const panel = new PrompterPanel({
      prompter,
      runner,
      transport,
      production,
      source: 'prompter',
      level: () => 'full' as const,
      scene: () => sceneId('s2'),
    });
    panel.setMode('buildIt');
    await panel.ask('move twice');
    await panel.build();
    expect(panel.state.phase).toBe('problem');
    expect(panel.state.message?.text).toBe("The Prompter couldn't finish step 2 of the plan.");
    expect(panel.state.canUndo).toBe(true);
    expect(runner.unfinished()).toBe(2);
  });
});

describe('the plan check and events (spec 04, section 6.10)', () => {
  const check = (steps: PlanStep[]) => {
    const { runner } = setUp([]);
    return runner.checkSteps(steps, null).map((p) => p.message);
  };

  it('refuses a set-up step after a when step', () => {
    const add = step({ kind: 'add', actor: 'rock', action: 'example/Prop/rock', details: [] });
    expect(check([when('clickOnObject'), add])).toEqual([
      'Steps that set up the scene go before any when step.',
    ]);
    expect(check([add, when('clickOnObject')])).toEqual([]);
  });

  it("takes an event's own settings, and refuses another", () => {
    const set = (name: string, value: string) => [
      when('clickOnObject', { details: [{ name, value }] }),
    ];
    expect(check(set('multipleEventPolicy', 'combine'))).toEqual([]);
    expect(check(set('heldKeyPolicy', 'fireOnce'))).toEqual([
      'A clickOnObject event has no heldKeyPolicy setting.',
    ]);
    expect(check(set('multipleEventPolicy', 'sometimes'))).toEqual([
      "A clickOnObject event's multipleEventPolicy can't be sometimes.",
    ]);
  });

  it("passes a key event's key, which builds nothing until spec 02 section 6a is built", () => {
    expect(
      check([when('keyPress', { actor: 'scene', details: [{ name: 'key', value: 'space' }] })]),
    ).toEqual([]);
    expect(check([when('clickOnObject', { details: [{ name: 'key', value: 'space' }] })])).toEqual([
      'A clickOnObject event has no key setting.',
    ]);
  });

  it("builds an event's settings as the listener's details", () => {
    const { listen, session } = setUp([
      when('clickOnObject', { details: [{ name: 'multipleEventPolicy', value: 'combine' }] }),
    ]);
    expect(listen(1)).toMatchObject({ ok: true });
    const listener = session.program().types.find((t) => t.name === 'Scene2')!.listeners[0]!;
    expect(listener.details.multipleEventPolicy).toMatchObject({ kind: 'enum', value: 'combine' });
    expect(checkProgram(session.program())).toEqual([]);
  });
});

describe('Plan only and the shape (spec 04, section 6.10)', () => {
  /** The ticks for a plan, after the learner's own edits to the program. */
  function ticks(steps: PlanStep[], build: (s: ReturnType<typeof setUp>) => void): boolean[] {
    const set = setUp([]);
    set.runner.run('propose_plan' as never, { steps } as never);
    const shown = set.runner.latestPlan()!;
    const before = new Set(indexProgram(set.session.program()).keys());
    build(set);
    return set.runner.progress(shown.steps, null, before);
  }
  const learner = (s: ReturnType<typeof setUp>, parent: string, slot: 'body', node: Statement) => {
    const index = indexProgram(s.session.program());
    const at =
      (index.get(parent as never)?.node as { body?: unknown[] } | undefined)?.body?.length ?? 0;
    const done = s.session.apply(
      [{ kind: 'insert', label: 'Add', parent: parent as never, slot, index: at, node }],
      'Add',
      'learner',
    );
    expect(done.ok).toBe(true);
  };
  const scene2 = (s: ReturnType<typeof setUp>) =>
    s.session.program().types.find((t) => t.name === 'Scene2')!;
  const listenerFor = (s: ReturnType<typeof setUp>, name: string | null) => {
    const field = name ? scene2(s).fields.find((f) => f.name === name)! : null;
    const listener: ListenerDecl = {
      id: `lis${Math.random().toString(36).slice(2, 8)}` as never,
      kind: 'listener' as const,
      event: 'clickOnObject',
      args: {},
      details: field
        ? {
            setOfVisuals: {
              id: `set${Math.random().toString(36).slice(2, 8)}` as never,
              kind: 'arrayOf' as const,
              of: { kind: 'story' as const, name: 'Thing' },
              items: [
                {
                  id: `ref${Math.random().toString(36).slice(2, 8)}` as never,
                  kind: 'fieldRef' as const,
                  target: {
                    id: `ths${Math.random().toString(36).slice(2, 8)}` as never,
                    kind: 'this' as const,
                  },
                  field: field.id,
                },
              ],
            },
          }
        : {},
      params: [],
      body: [],
    };
    const type = scene2(s);
    const done = s.session.apply(
      [
        {
          kind: 'declare',
          label: 'Add',
          parent: type.id,
          index: type.listeners.length,
          node: listener,
        },
      ],
      'Add',
      'learner',
    );
    expect(done.ok).toBe(true);
    return listener.id as string;
  };
  const moveNode = (s: ReturnType<typeof setUp>): Statement => {
    const field = scene2(s).fields.find((f) => f.name === 'penguin')!;
    const rand = () => Math.random().toString(36).slice(2, 8);
    return {
      id: `mv${rand()}` as never,
      kind: 'call',
      target: {
        id: `t${rand()}` as never,
        kind: 'fieldRef',
        target: { id: `h${rand()}` as never, kind: 'this' },
        field: field.id,
      },
      callee: { kind: 'story', name: 'move' },
      args: {
        direction: {
          id: `d${rand()}` as never,
          kind: 'enum',
          type: 'MoveDirection',
          value: 'forward',
        },
        amount: { id: `a${rand()}` as never, kind: 'number', value: 1 },
      },
      details: {},
    };
  };

  it('ticks a when step for the listener it describes, not any of its kind', () => {
    const plan = [when('clickOnObject')];
    expect(ticks(plan, (s) => listenerFor(s, 'fox'))).toEqual([false]);
    expect(ticks(plan, (s) => listenerFor(s, 'penguin'))).toEqual([true]);
  });

  it("ticks a step in an event only for a block in that event's listener", () => {
    const plan = [when('clickOnObject'), step()];
    expect(
      ticks(plan, (s) => {
        listenerFor(s, 'penguin');
        learner(s, scene2(s).methods[0]!.id, 'body', moveNode(s));
      }),
    ).toEqual([true, false]);
    expect(
      ticks(plan, (s) => {
        const listener = listenerFor(s, 'penguin');
        learner(s, listener, 'body', moveNode(s));
      }),
    ).toEqual([true, true]);
  });

  it('ticks a step before any when step only for a block in the script', () => {
    const plan = [step(), when('clickOnObject')];
    expect(
      ticks(plan, (s) => {
        const listener = listenerFor(s, 'penguin');
        learner(s, listener, 'body', moveNode(s));
      }),
    ).toEqual([false, true]);
  });

  it("reads a setting the step doesn't give as not asked, and one a listener leaves out as its default", () => {
    const ignore = [
      when('clickOnObject', { details: [{ name: 'multipleEventPolicy', value: 'ignore' }] }),
    ];
    const combine = [
      when('clickOnObject', { details: [{ name: 'multipleEventPolicy', value: 'combine' }] }),
    ];
    expect(ticks(ignore, (s) => listenerFor(s, 'penguin'))).toEqual([true]);
    expect(ticks(combine, (s) => listenerFor(s, 'penguin'))).toEqual([false]);
  });
});
