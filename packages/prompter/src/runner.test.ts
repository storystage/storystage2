import { describe, expect, it } from 'vitest';
import { nodeId, programText, type Program } from '@storystage/ast';
import {
  ProductionSession,
  addObject,
  applyProgramEdits,
  checkReferences,
  exampleProduction,
  frameId,
  lineId,
  sceneId,
  type Production,
  type SceneId,
} from '@storystage/production';
import { classFor } from '@storystage/story-api/editing';
import { checkProgram } from '@storystage/story-api/program-check';
import type { PlanStep } from './plans.ts';
import { EXPLAINED, PrompterRunner, type RunnerSetup } from './runner.ts';
import type { ToolName } from './tool-names.ts';
import type { ToolOutcome } from './tools.ts';
import type { Json, JsonObject } from './transport.ts';

const step = (s: Partial<PlanStep>): PlanStep => ({
  words: 'The penguin waddles forward.',
  kind: 'do',
  actor: 'penguin',
  action: 'move',
  target: '',
  // A move's settings, for the default block; another block's step gives its own.
  details:
    s.action === undefined || s.action === 'move'
      ? [
          { name: 'direction', value: 'forward' },
          { name: 'amount', value: '1' },
        ]
      : [],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  holds: 0,
  why: 'So she can reach the fox.',
  ...s,
});

function setUp(
  scene = 's2',
  production: Production = exampleProduction(),
  extra: Partial<RunnerSetup> = {},
) {
  const session = new ProductionSession<string>(production, { check: (p) => checkProgram(p) });
  const runner = new PrompterRunner({
    session,
    source: 'prompter',
    scene: () => sceneId(scene),
    backstageClass: (id) => (id === 'example/Quadruped/owl' ? 'Quadruped' : null),
    checkResult: (frame) => (frame === 'f1' ? { flags: ['Pip ends on the left.'] } : null),
    ...extra,
  });
  const run = (name: ToolName, input: unknown): ToolOutcome =>
    runner.run(name, input as JsonObject);
  return { session, runner, run, original: production.program, now: () => session.program() };
}

const methodBody = (program: Program, scene = 2) =>
  program.types.find((t) => t.name === `Scene${scene}`)!.methods[0]!.body;

const move = (amount: string, extra: JsonObject = {}) => ({
  method: 'myFirstMethod',
  position: 'end',
  target: 'penguin',
  procedure: 'move',
  arguments: [
    { name: 'direction', value: 'forward' },
    { name: 'amount', value: amount },
  ],
  narration: 'The penguin waddles forward.',
  plan_step: 1,
  ...extra,
});

const agreed = (steps: PlanStep[], frame: string | null = null): { agreedPlan: Json } => ({
  agreedPlan: { plan: 'p1', frame, steps } as unknown as Json,
});

describe('PrompterRunner: plans (spec 04, sections 6.1 to 6.3)', () => {
  it('shows a plan that can be built, and keeps it', () => {
    const { run, runner } = setUp();
    const result = run('propose_plan', { steps: [step({})] });
    expect(result).toMatchObject({ ok: true, ids: { plan: 'p1' } });
    expect(runner.plan('p1')?.steps).toHaveLength(1);
  });

  it("refuses a plan with a step that can't be built, naming the step", () => {
    const { run } = setUp();
    const result = run('propose_plan', { steps: [step({}), step({ actor: 'owl' })] });
    expect(result).toMatchObject({ ok: false, error: 'bad_argument' });
    expect(result.ok || result.message).toMatch(/step 2: There's no owl in this scene yet/);
  });

  it('revises a plan in place, and refuses one it never showed', () => {
    const { run, runner } = setUp();
    run('propose_plan', { steps: [step({})] });
    expect(
      run('revise_plan', { plan: 'p1', steps: [step({}), step({ actor: 'fox' })] }),
    ).toMatchObject({
      ok: true,
      ids: { plan: 'p1' },
    });
    expect(runner.plan('p1')?.steps).toHaveLength(2);
    expect(run('revise_plan', { plan: 'p9', steps: [step({})] })).toMatchObject({ ok: false });
  });

  it('checks a frame plan against that frame', () => {
    const { run } = setUp();
    expect(run('propose_plan', { frame: 'f2', steps: [step({ sketch: 'k2' })] })).toMatchObject({
      ok: true,
    });
    expect(run('propose_plan', { frame: 'f2', steps: [step({ sketch: 'k1' })] })).toMatchObject({
      ok: false,
    });
    expect(run('propose_plan', { frame: 'f9', steps: [step({})] })).toMatchObject({
      error: 'unknown_frame',
    });
  });
});

describe('PrompterRunner: building (spec 04, sections 1.7, 6.4)', () => {
  it('builds a step as a block, with its words as a comment above it', () => {
    const { runner, run, now } = setUp();
    runner.begin(
      'make the penguin waddle',
      agreed([
        step({
          details: [
            { name: 'direction', value: 'forward' },
            { name: 'amount', value: '3' },
          ],
        }),
      ]),
    );
    expect(run('insert_statement', move('3'))).toMatchObject({
      ok: true,
      ids: { block: expect.any(String) },
    });
    runner.end();
    const body = methodBody(now());
    expect(body.slice(-2).map((s) => s.kind)).toEqual(['comment', 'call']);
    expect(body.at(-2)).toMatchObject({ kind: 'comment', text: 'The penguin waddles forward.' });
    expect(programText(now()).text).toMatch(/penguin\.move\(/);
  });

  it('makes a whole request one undo step, which Undo takes back', () => {
    const { runner, run, session, now, original } = setUp();
    runner.begin('go', agreed([step({}), step({ words: 'The fox follows.', actor: 'fox' })]));
    run('insert_statement', move('1'));
    run('insert_statement', move('1', { target: 'fox', plan_step: 2 }));
    runner.end();
    expect(session.history()).toHaveLength(1);
    expect(methodBody(now())).toHaveLength(5);
    session.undo();
    expect(now()).toEqual(original);
  });

  it("holds the build to the plan: what the learner changed is what's built", () => {
    const { runner, run, now, original } = setUp();
    runner.begin('go', agreed([step({ details: [{ name: 'amount', value: '3' }] })]));
    expect(run('insert_statement', move('2'))).toMatchObject({ ok: false, error: 'not_in_plan' });
    expect(run('insert_statement', move('3', { plan_step: 2 }))).toMatchObject({
      ok: false,
      error: 'not_in_plan',
    });
    runner.end();
    expect(now()).toEqual(original);
  });

  it("builds a list from its items, separated by commas: the camera's frame shot", () => {
    const { runner, run, now } = setUp();
    const shot = step({
      words: 'The camera shows the penguin and the fox.',
      actor: 'camera',
      action: 'frameShot',
      details: [
        { name: 'shot', value: 'medium' },
        { name: 'targets', value: 'penguin, fox' },
      ],
    });
    const frameShot = (targets: string) => ({
      method: 'myFirstMethod',
      position: 'end',
      target: 'camera',
      procedure: 'frameShot',
      arguments: [
        { name: 'shot', value: 'medium' },
        { name: 'targets', value: targets },
      ],
      narration: 'The camera shows the penguin and the fox.',
      plan_step: 1,
    });
    runner.begin('frame them', agreed([shot]));
    expect(run('insert_statement', frameShot('penguin, owl'))).toMatchObject({
      error: 'not_in_plan',
    });
    expect(run('insert_statement', frameShot('penguin,fox'))).toMatchObject({ ok: true });
    runner.end();
    const call = methodBody(now()).at(-1);
    expect(call).toMatchObject({
      kind: 'call',
      args: {
        targets: {
          kind: 'arrayOf',
          of: { kind: 'story', name: 'Thing' },
          items: [{ kind: 'fieldRef' }, { kind: 'fieldRef' }],
        },
      },
    });
    expect(programText(now()).text).toContain('camera.frameShot(');
  });

  it('refuses every change when no plan was agreed', () => {
    const { runner, run } = setUp();
    runner.begin('go', {});
    expect(run('insert_statement', move('1'))).toMatchObject({ error: 'not_in_plan' });
  });

  it('puts blocks inside a control block', () => {
    const { runner, run, now } = setUp();
    // A do together is for two steps or more (section 6.10).
    runner.begin('go', agreed([step({}), step({ together: true })]));
    const together = run('insert_control', {
      method: 'myFirstMethod',
      position: 'end',
      kind: 'doTogether',
      narration: 'These happen at the same time.',
      plan_step: 2,
    });
    expect(together).toMatchObject({ ok: true, step: 1 });
    const block = (together.ok && together.ids.block) || '';
    expect(
      run('insert_statement', move('1', { parent_block: block, position: '0' })),
    ).toMatchObject({ ok: true });
    expect(
      run('insert_statement', move('1', { parent_block: block, position: '1', plan_step: 2 })),
    ).toMatchObject({ ok: true });
    runner.end();
    const last = methodBody(now()).at(-1)!;
    expect(last.kind).toBe('doTogether');
    // Each step's words go above its first block, a step in a group's too (section 6.1).
    expect('body' in last && last.body.map((s) => s.kind)).toEqual(['call', 'comment', 'call']);
  });

  it('builds the do together with the first of two steps that run together (the first pilot)', () => {
    const { runner, run } = setUp();
    runner.begin('go', agreed([step({}), step({ together: true })]));
    expect(
      run('insert_control', {
        method: 'myFirstMethod',
        position: 'end',
        kind: 'doTogether',
        narration: 'These happen at the same time.',
        plan_step: 1,
      }),
    ).toMatchObject({ ok: true });
    runner.end();
  });

  it('gives a do together named for a later step to the step that starts its group (plan-06)', () => {
    const { runner, run, now } = setUp();
    const first = step({ words: 'The penguin goes.' });
    const second = step({ words: 'The fox goes too.', actor: 'fox', together: true });
    runner.begin('go', agreed([first, second]));
    const group = run('insert_control', {
      method: 'myFirstMethod',
      position: 'end',
      kind: 'doTogether',
      narration: 'These happen at the same time.',
      plan_step: 2,
    });
    const inside = { parent_block: (group.ok && group.ids.block) || '' };
    run('insert_statement', move('1', inside));
    run('insert_statement', move('1', { ...inside, target: 'fox', plan_step: 2 }));
    runner.end();
    const [above, block] = methodBody(now()).slice(-2);
    expect(above).toMatchObject({ kind: 'comment', text: first.words });
    expect(block).toMatchObject({
      kind: 'doTogether',
      body: [{ kind: 'call' }, { kind: 'comment', text: second.words }, { kind: 'call' }],
    });
    expect(group).toMatchObject({ ok: true, step: 1 });
  });

  it('builds a step at the same time as a whole repeat (section 6.8)', () => {
    const { runner, run, now } = setUp();
    const loop = step({
      words: 'Repeat 3 times:',
      kind: 'repeat',
      actor: '',
      action: '',
      details: [],
      repeat: 3,
      holds: 1,
    });
    const inLoop = step({ words: 'The penguin hops.' });
    const beside = step({ words: 'The fox goes too.', actor: 'fox', together: true });
    runner.begin('go', agreed([loop, inLoop, beside]));
    const control = (extra: JsonObject) => ({
      method: 'myFirstMethod',
      position: 'end',
      narration: 'A block.',
      ...extra,
    });
    const group = run('insert_control', control({ kind: 'doTogether', plan_step: 3 }));
    expect(group).toMatchObject({ ok: true, step: 1 });
    const inGroup = { parent_block: (group.ok && group.ids.block) || '' };
    const count = run(
      'insert_control',
      control({ kind: 'count', count: 3, plan_step: 1, ...inGroup }),
    );
    expect(count).toMatchObject({ ok: true });
    const inCount = { parent_block: (count.ok && count.ids.block) || '' };
    expect(run('insert_statement', move('1', { ...inCount, plan_step: 2 }))).toMatchObject({
      ok: true,
    });
    expect(
      run('insert_statement', move('1', { ...inGroup, target: 'fox', plan_step: 3 })),
    ).toMatchObject({ ok: true });
    runner.end();
    const [above, block] = methodBody(now()).slice(-2);
    expect(above).toMatchObject({ kind: 'comment', text: loop.words });
    expect(block).toMatchObject({ kind: 'doTogether' });
  });

  it('takes a do together named for the repeat itself, and not for its last step inside', () => {
    const { runner, run } = setUp();
    const loop = step({ kind: 'repeat', actor: '', action: '', details: [], repeat: 3, holds: 1 });
    const beside = step({ actor: 'fox', together: true });
    runner.begin('go', agreed([loop, step({}), beside]));
    const together = (plan_step: number) =>
      run('insert_control', {
        method: 'myFirstMethod',
        position: 'end',
        kind: 'doTogether',
        narration: 'These happen at the same time.',
        plan_step,
      });
    expect(together(2)).toMatchObject({ ok: false, error: 'not_in_plan' });
    expect(together(1)).toMatchObject({ ok: true });
    runner.end();
  });

  it('keeps a together inside a repeat with the step inside that starts it', () => {
    const { runner, run } = setUp();
    const loop = step({ kind: 'repeat', actor: '', action: '', details: [], repeat: 4, holds: 2 });
    runner.begin('go', agreed([loop, step({}), step({ actor: 'fox', together: true })]));
    const at = { method: 'myFirstMethod', position: 'end', narration: 'A block.' };
    const count = run('insert_control', { ...at, kind: 'count', count: 4, plan_step: 1 });
    const inside = { parent_block: (count.ok && count.ids.block) || '' };
    expect(
      run('insert_control', { ...at, ...inside, kind: 'doTogether', plan_step: 3 }),
    ).toMatchObject({ ok: true, step: 2 });
    runner.end();
  });

  it("gives an if's two halves as places to build", () => {
    const { runner, run } = setUp();
    runner.begin('go', agreed([step({ together: true })]));
    // An if isn't a supporting block for any step, so it is refused, as section 6.4 says.
    expect(
      run('insert_control', {
        method: 'myFirstMethod',
        position: 'end',
        kind: 'if',
        condition: {
          target: 'penguin',
          function: 'isFacing',
          arguments: [{ name: 'other', value: 'fox' }],
        },
        narration: 'If the penguin faces the fox.',
        plan_step: 1,
      }),
    ).toMatchObject({ error: 'not_in_plan' });
  });

  it('says what is wrong with a block it cannot build, and builds nothing', () => {
    const { runner, run, now, original } = setUp();
    const far = step({
      details: [
        { name: 'direction', value: 'forward' },
        { name: 'amount', value: 'far' },
      ],
    });
    // Each case its own one-step plan: a step after one that failed would be refused for its
    // order first (section 6.10).
    const fails = (s: PlanStep, call: JsonObject, error: string) => {
      runner.begin('go', agreed([s]));
      expect(run('insert_statement', call)).toMatchObject({ error });
      runner.end();
    };
    fails(far, move('far'), 'bad_argument');
    fails(step({}), move('1', { method: 'nope' }), 'unknown_method');
    fails(step({}), move('1', { position: '99' }), 'bad_argument');
    fails(step({ actor: 'owl' }), move('1', { target: 'owl' }), 'unknown_object');
    fails(step({ action: 'fly' }), move('1', { procedure: 'fly' }), 'unknown_method');
    fails(step({}), move('1', { parent_block: 'nowhere1' }), 'unknown_block');
    expect(now()).toEqual(original);
  });

  it('refuses a setting given twice, which would build a value the step does not have', () => {
    const { runner, run, now, original } = setUp();
    runner.begin('go', agreed([step({})]));
    const twice = [
      { name: 'direction', value: 'forward' },
      { name: 'amount', value: '1' },
      { name: 'amount', value: '99' },
    ];
    expect(run('insert_statement', move('1', { arguments: twice }))).toMatchObject({
      ok: false,
      error: 'not_in_plan',
    });
    expect(now()).toEqual(original);
  });

  it('adds a listener', () => {
    const { runner, run, now } = setUp();
    runner.begin('go', agreed([step({ kind: 'when', actor: 'penguin', action: 'clickOnObject' })]));
    expect(
      run('add_event_listener', {
        event: 'clickOnObject',
        objects: ['penguin'],
        other_objects: [],
        narration: 'Clicking will do something.',
        plan_step: 1,
      }),
    ).toMatchObject({ ok: true, ids: { block: expect.any(String) } });
    runner.end();
    const scene = now().types.find((t) => t.name === 'Scene2')!;
    expect(scene.listeners.map((l) => l.event)).toEqual(['clickOnObject']);
    expect(scene.listeners[0]!.params.map((p) => p.name)).toEqual(['model', 'x', 'y']);
  });

  it("puts a step's blocks in a listener it built, by the id it gave (the pilot's event-01)", () => {
    const { runner, run, now } = setUp();
    runner.begin(
      'go',
      agreed([
        step({ kind: 'when', actor: 'penguin', action: 'clickOnObject', target: '' }),
        step({ action: 'say', target: '', details: [{ name: 'text', value: 'ouch' }] }),
      ]),
    );
    const listener = run('add_event_listener', {
      event: 'clickOnObject',
      objects: ['penguin'],
      other_objects: [],
      narration: 'A new block waits for a click on the penguin.',
      plan_step: 1,
    });
    const block = (listener.ok && listener.ids.block) || '';
    expect(
      run('insert_statement', {
        method: 'myFirstMethod',
        parent_block: block,
        position: 'end',
        target: 'penguin',
        procedure: 'say',
        arguments: [{ name: 'text', value: 'ouch' }],
        narration: 'The penguin will say ouch when clicked.',
        plan_step: 2,
      }),
    ).toMatchObject({ ok: true });
    runner.end();
    const scene = now().types.find((t) => t.name === 'Scene2')!;
    expect(scene.listeners[0]!.body.map((s) => s.kind)).toEqual(['comment', 'call']);
  });
});

describe('PrompterRunner: the scene set-up (spec 04, section 3.1)', () => {
  const owl = (extra: JsonObject = {}) => ({
    backstage_item: 'example/Quadruped/owl',
    name: 'owl',
    position: { x: 1, y: 0, z: 2 },
    narration: 'An owl appears.',
    plan_step: 1,
    ...extra,
  });
  const addOwl = step({ kind: 'add', actor: 'owl', action: 'example/Quadruped/owl' });
  const change = (actor: string, action: string, value = '') =>
    step({ kind: 'change', actor, action, details: value ? [{ name: 'value', value }] : [] });
  const scene2 = (session: ProductionSession<string>) =>
    session.production().scenes.find((s) => s.id === 's2')!.setup;

  it('adds a model as a field and an object in one step, which Undo takes back', () => {
    const { runner, run, session } = setUp();
    const before = session.production();
    const details = [
      { name: 'turn_degrees', value: '90' },
      { name: 'scale', value: '2' },
    ];
    runner.begin('add an owl', agreed([step({ ...addOwl, details })]));
    expect(run('add_model', owl({ turn_degrees: 90, scale: 2 }))).toMatchObject({
      ok: true,
      ids: { name: 'owl' },
    });
    runner.end();
    const type = session.program().types.find((t) => t.name === 'Scene2')!;
    expect(type.fields.at(-1)).toMatchObject({
      kind: 'field',
      name: 'owl',
      type: { kind: 'story', name: 'Quadruped' },
      initial: null,
    });
    const object = scene2(session).objects.at(-1)!;
    expect(object).toMatchObject({ id: 'owl', model: 'example/Quadruped/owl', class: 'Quadruped' });
    expect(object.transform.position).toEqual({ x: 1, y: 0, z: 2 });
    expect(object.transform.scale).toEqual({ x: 2, y: 2, z: 2 });
    expect(object.transform.rotation.y).toBeCloseTo(Math.SQRT1_2);
    // Spec 03, section 2: every object has its field, and every field its object.
    expect(checkReferences(session.production())).toEqual([]);
    expect(session.history()).toHaveLength(1);
    session.undo();
    expect(session.production()).toEqual(before);
  });

  it('makes the name one the program accepts, and unique in the scene', () => {
    const { runner, run, session } = setUp();
    runner.begin(
      'add',
      agreed([step({ ...addOwl, actor: 'fox' }), step({ ...addOwl, actor: 'Barn owl' })]),
    );
    expect(run('add_model', owl({ name: 'fox' }))).toMatchObject({ ids: { name: 'fox2' } });
    expect(run('add_model', owl({ name: 'Barn owl', plan_step: 2 }))).toMatchObject({
      ids: { name: 'barnOwl' },
    });
    runner.end();
    expect(session.history()).toHaveLength(1);
    expect(checkReferences(session.production())).toEqual([]);
  });

  it("refuses a model that isn't in Backstage, and a bad scale, changing nothing", () => {
    const { runner, run, session } = setUp();
    const before = session.production();
    runner.begin('add', agreed([step({ ...addOwl, action: 'example/Quadruped/dragon' })]));
    expect(run('add_model', owl({ backstage_item: 'example/Quadruped/dragon' }))).toMatchObject({
      ok: false,
      error: 'unknown_object',
    });
    runner.end();
    runner.begin('add', agreed([step({ ...addOwl, details: [{ name: 'scale', value: '50' }] })]));
    expect(run('add_model', owl({ scale: 50 }))).toMatchObject({
      ok: false,
      error: 'bad_argument',
    });
    runner.end();
    expect(session.production()).toEqual(before);
  });

  it("makes it of its character's class, and still builds with it (decision 0074)", () => {
    const p = exampleProduction();
    const made = classFor(p.program, { name: 'Owl', storyClass: 'Quadruped' }, [])!;
    const applied = applyProgramEdits(p, [...made.edits]);
    if ('code' in applied) throw new Error(applied.code);
    const withClass = { ...p, program: applied.program };
    const asked: unknown[] = [];
    const { runner, run, session } = setUp('s2', withClass, {
      objectType: (_p, object) => {
        asked.push(object);
        return { kind: 'user', type: made.type };
      },
    });
    runner.begin('add an owl', agreed([addOwl, step({ actor: 'owl' })]));
    expect(run('add_model', owl({}))).toMatchObject({ ok: true });
    expect(run('insert_statement', move('1', { target: 'owl', plan_step: 2 }))).toMatchObject({
      ok: true,
    });
    runner.end();
    // Asked as the plan is read (section 6.9), and as the model is added: the same each time.
    expect(asked.length).toBeGreaterThan(0);
    for (const object of asked)
      expect(object).toEqual({ model: 'example/Quadruped/owl', class: 'Quadruped' });
    const scene = session.program().types.find((t) => t.name === 'Scene2')!;
    expect(scene.fields.at(-1)).toMatchObject({
      name: 'owl',
      type: { kind: 'user', type: made.type },
    });
    expect(checkReferences(session.production())).toEqual([]);
    expect(checkProgram(session.program())).toEqual([]);
  });

  it("adds one of the production's imported models", () => {
    const p = exampleProduction();
    const item = {
      id: 'class/Biped/robot',
      section: 'cast',
      class: 'Biped',
      displayName: 'Robot',
      themes: [],
      files: { model: 'robot.glb', thumbnail: 'robot.webp' },
    };
    const withImport = {
      ...p,
      manifest: { ...p.manifest, models: [{ folder: 'robot', item }] },
    } as unknown as Production;
    const { runner, run, session } = setUp('s2', withImport);
    runner.begin('add', agreed([step({ kind: 'add', actor: 'robot', action: item.id })]));
    expect(run('add_model', owl({ backstage_item: item.id, name: 'robot' }))).toMatchObject({
      ok: true,
    });
    runner.end();
    expect(scene2(session).objects.at(-1)).toMatchObject({ id: 'robot', class: 'Biped' });
  });

  it('changes how an object starts, checking each value', () => {
    const { runner, run, session } = setUp();
    runner.begin(
      'set',
      agreed([
        change('fox', 'position', '2, 0, -1'),
        change('fox', 'paint', 'red'),
        change('fox', 'opacity', '0.5'),
        change('camera', 'turn_degrees', '180'),
        change('fox', 'vehicle', 'penguin'),
      ]),
    );
    const set = (object: string, property: string, value: string, n: number) =>
      run('set_property', { object, property, value, narration: 'x', plan_step: n });
    expect(set('fox', 'position', '2, 0, -1', 1)).toMatchObject({ ok: true });
    expect(set('fox', 'paint', 'red', 2)).toMatchObject({ ok: true });
    expect(set('fox', 'opacity', '0.5', 3)).toMatchObject({ ok: true });
    expect(set('camera', 'turn_degrees', '180', 4)).toMatchObject({ ok: true });
    expect(set('fox', 'vehicle', 'penguin', 5)).toMatchObject({ ok: true });
    runner.end();
    const setup = scene2(session);
    const fox = setup.objects.find((o) => o.id === 'fox')!;
    expect(fox.transform.position).toEqual({ x: 2, y: 0, z: -1 });
    expect(fox).toMatchObject({ paint: 'red', opacity: 0.5, vehicle: 'penguin' });
    expect(setup.camera.transform.rotation.y).toBeCloseTo(1);
    expect(session.history()).toHaveLength(1);
    // Only the set-up changed.
    expect(session.program()).toEqual(exampleProduction().program);
  });

  it('refuses what an object or the camera cannot have, and a vehicle that carries itself', () => {
    const { runner, run } = setUp();
    // Each refusal its own plan, as a step after one that failed is refused for its order first.
    const set = (object: string, property: string, value: string) => {
      runner.begin('set', agreed([change(object, property, value)]));
      const result = run('set_property', { object, property, value, narration: 'x', plan_step: 1 });
      runner.end();
      return result;
    };
    expect(set('owl', 'scale', '2')).toMatchObject({ error: 'unknown_object' });
    expect(set('camera', 'paint', 'red')).toMatchObject({ error: 'bad_argument' });
    expect(set('fox', 'paint', 'tartan')).toMatchObject({ error: 'bad_argument' });
    expect(set('fox', 'opacity', '2')).toMatchObject({ error: 'bad_argument' });
    expect(set('penguin', 'vehicle', 'fox')).toMatchObject({ ok: true });
    expect(set('fox', 'vehicle', 'penguin')).toMatchObject({ error: 'bad_argument' });
  });

  it('answers not_allowed_here for stage_scene when the studio gives no staging step', () => {
    const { runner, run, now, original } = setUp();
    runner.begin('stage', agreed([step({ kind: 'stage', action: 's2' })]));
    expect(run('stage_scene', { scene: 's2', narration: 'x', plan_step: 1 })).toMatchObject({
      ok: false,
      error: 'not_allowed_here',
    });
    runner.end();
    expect(now()).toEqual(original);
  });
});

describe('PrompterRunner: stage_scene (spec 04, section 3.2)', () => {
  const stageStep = step({ kind: 'stage', action: 's2' });
  const stage = (n = 1) => ({ scene: 's2', narration: 'The forest is set.', plan_step: n });
  /** The studio's step, here adding an owl as Set the stage from the storyboard would. */
  const owlFromStoryboard =
    (calls: string[] = []) =>
    (p: Production, scene: SceneId, label: string) => {
      calls.push(`${scene}: ${label}`);
      const added = addObject(
        p,
        scene,
        {
          model: 'example/Quadruped/owl' as never,
          class: 'Quadruped',
          name: 'Owl',
          transform: {
            position: { x: 1, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
        label,
      );
      return added.ok
        ? { ok: true as const, step: added.step }
        : { ok: false as const, refusal: added.refusal };
    };

  it("runs the studio's own step as part of the request's one undo step", () => {
    const calls: string[] = [];
    const { runner, run, session } = setUp('s2', exampleProduction(), {
      stageFromStoryboard: owlFromStoryboard(calls),
    });
    const before = session.production();
    runner.begin('set the stage', agreed([stageStep]));
    expect(run('stage_scene', stage())).toMatchObject({
      ok: true,
      summary: 'Placed owl from the storyboard.',
    });
    runner.end();
    expect(calls).toEqual(['s2: Set up Forest, night from the storyboard']);
    expect(checkReferences(session.production())).toEqual([]);
    expect(session.history()).toHaveLength(1);
    session.undo();
    expect(session.production()).toEqual(before);
  });

  it('says when there is nothing to place, changing nothing', () => {
    const { runner, run, session } = setUp('s2', exampleProduction(), {
      stageFromStoryboard: (p, _scene, label) => ({
        ok: true,
        step: { label, production: p, edits: [], inverses: [] },
      }),
    });
    runner.begin('set the stage', agreed([stageStep]));
    expect(run('stage_scene', stage())).toMatchObject({
      ok: true,
      summary: expect.stringMatching(/^Nothing to place/),
    });
    runner.end();
    expect(session.history()).toHaveLength(0);
  });

  it("passes on the studio's refusal, and refuses a scene that doesn't exist", () => {
    const { runner, run } = setUp('s2', exampleProduction(), {
      stageFromStoryboard: () => ({ ok: false, refusal: { code: 'tooManyObjects', limit: 100 } }),
    });
    runner.begin('set the stage', agreed([stageStep]));
    expect(run('stage_scene', stage())).toMatchObject({ ok: false, error: 'limit_reached' });
    runner.end();
    runner.begin('set the stage', agreed([step({ kind: 'stage', action: 's9' })]));
    expect(run('stage_scene', { ...stage(), scene: 's9' })).toMatchObject({
      ok: false,
      error: 'unknown_object',
    });
    runner.end();
  });
});

describe('PrompterRunner: what characters say (spec 04, section 6.5)', () => {
  const say = (words: string, extra: JsonObject = {}) => ({
    method: 'myFirstMethod',
    position: 'end',
    target: 'fox',
    procedure: 'say',
    arguments: [{ name: 'text', value: words }],
    narration: 'The fox speaks.',
    plan_step: 1,
    ...extra,
  });
  const line = step({ words: 'The fox says its line.', actor: 'fox', action: 'say', line: 'l3' });

  it("takes a script line's exact words in a frame", () => {
    const { runner, run } = setUp();
    runner.begin('code frame f2', agreed([line], 'f2'));
    expect(
      run('insert_statement', say("Don't be scared. I'm lost too.", { line: 'l3' })),
    ).toMatchObject({ ok: true });
  });

  it('refuses other words, or none of the script, in a frame', () => {
    const { runner, run } = setUp();
    const said = [{ name: 'text', value: 'Hello, friend.' }];
    runner.begin('code frame f2', agreed([line], 'f2'));
    expect(run('insert_statement', say('Hello, friend.', { line: 'l3' }))).toMatchObject({
      error: 'not_in_script',
    });
    runner.end();
    runner.begin(
      'code frame f2',
      agreed([step({ actor: 'fox', action: 'say', details: said })], 'f2'),
    );
    expect(run('insert_statement', say('Hello, friend.'))).toMatchObject({
      error: 'not_in_script',
    });
    expect(run('insert_statement', say('Hi.', { line: 'l99' }))).toMatchObject({
      error: 'not_in_plan',
    });
  });

  it("shows no plan with words that aren't the learner's, outside a frame (the owner, 26 Nov 2026)", () => {
    const { runner, run } = setUp();
    const free = step({
      actor: 'fox',
      action: 'say',
      details: [{ name: 'text', value: 'Hello there' }],
    });
    // The Prompter's own words, so not the learner's.
    const funny = step({
      actor: 'fox',
      action: 'say',
      details: [{ name: 'text', value: 'Something funny' }],
    });
    runner.begin('make the fox say Hello there', {});
    const refused = run('propose_plan', { steps: [free, funny] });
    expect(refused).toMatchObject({ ok: false, error: 'bad_argument' });
    expect(refused.ok || refused.message).toContain(
      "step 2: Words in the film come from the script or the learner's own words. Ask the learner what they should be.",
    );
    expect(runner.plan('p1')).toBeUndefined();
    expect(run('propose_plan', { steps: [free] })).toMatchObject({ ok: true });
    runner.end();
    // The panel's build request is only its button's words (spec 04, section 4.5), and the
    // words of the request that made the plan still count.
    runner.begin('Build these steps.', agreed([free]));
    expect(run('insert_statement', say('Hello there'))).toMatchObject({ ok: true });
  });

  it('in a frame, shows no plan whose words are not its script line (the owner, 26 Nov 2026)', () => {
    const { runner, run } = setUp();
    runner.begin('code frame f2', {});
    const words = (s: Partial<PlanStep>) =>
      run('propose_plan', { frame: 'f2', steps: [step({ actor: 'fox', action: 'say', ...s })] });
    const free = words({ details: [{ name: 'text', value: 'code frame f2' }] });
    expect(free.ok || free.message).toContain(
      'step 1: In a storyboard frame, the words come from the script: give this step a script line, or change the line in the script first.',
    );
    const other = words({ line: 'l3', details: [{ name: 'text', value: 'Hello, friend.' }] });
    expect(other.ok || other.message).toContain(
      "step 1: The words must be the script line's own: \"Don't be scared. I'm lost too.\"",
    );
    expect(words({ line: 'l3' })).toMatchObject({ ok: true });
    expect(
      words({ line: 'l3', details: [{ name: 'text', value: "Don't be scared. I'm lost too." }] }),
    ).toMatchObject({ ok: true });
  });

  it("takes the words of a step the learner added to the plan themselves, and checks the Prompter's", () => {
    const { runner, run } = setUp();
    const shown = step({
      words: 'The fox says hello.',
      actor: 'fox',
      action: 'say',
      details: [{ name: 'text', value: 'hello' }],
    });
    runner.begin('make the fox say hello', {});
    expect(run('propose_plan', { steps: [shown] })).toMatchObject({ ok: true });
    runner.end();
    const added = step({
      words: 'The fox says Good morning.',
      actor: 'fox',
      action: 'say',
      details: [{ name: 'text', value: 'Good morning' }],
    });
    // The panel checks the learner's edits before Build: their own step's words are theirs.
    expect(runner.checkSteps([added, shown], null)).toEqual([]);
    // A step the Prompter showed, changed by the learner, is theirs too.
    const changed = { ...shown, details: [{ name: 'text', value: 'Good night' }] };
    expect(runner.checkSteps([changed], null)).toEqual([]);
    runner.begin('Build these steps.', agreed([added, shown]));
    expect(run('insert_statement', say('Good morning'))).toMatchObject({ ok: true });
    expect(run('insert_statement', say('hello', { plan_step: 2 }))).toMatchObject({ ok: true });
  });
});

describe('PrompterRunner: reading (spec 04, sections 3.1, 3.2)', () => {
  it('reads the production and the storyboard as a turn sends them, with block ids', () => {
    const { run } = setUp();
    const result = run('read_project', {});
    const summary = result.ok ? result.summary : '';
    const blocks =
      /^<production_data>(.*)<\/production_data>\n<storyboard_data>(.*)<\/storyboard_data>$/s.exec(
        summary,
      );
    expect(blocks).not.toBeNull();
    // Learner text inside can't open or close a tag (section 2.4).
    for (const inside of blocks!.slice(1)) expect(inside).not.toMatch(/[<>]/);
    const production = JSON.parse(blocks![1]!);
    expect(production).toMatchObject({
      scene: 's2',
      setup: { objects: [{ id: 'penguin' }, { id: 'fox' }] },
    });
    expect(production.program).toContain('# [scene2b]');
    expect(JSON.parse(blocks![2]!).frames).toHaveLength(3);
  });

  it("gives a frame's check result, or says it hasn't run", () => {
    const { run } = setUp();
    expect(run('check_frame', { frame: 'f1' })).toMatchObject({
      ok: true,
      summary: expect.stringContaining('Pip ends'),
    });
    expect(run('check_frame', { frame: 'f2' })).toMatchObject({
      ok: true,
      summary: expect.stringMatching(/hasn't been checked/),
    });
    expect(run('check_frame', { frame: 'f9' })).toMatchObject({ error: 'unknown_frame' });
  });

  it('gives the script facts for a scene or the whole production', () => {
    const { run } = setUp();
    const s1 = run('script_check', { scene: 's1' });
    expect(s1.ok && s1.summary).toContain('"linesOnNoFrame":["l2"]');
    expect(run('script_check', {})).toMatchObject({ ok: true });
    expect(run('script_check', { scene: 's9' })).toMatchObject({ ok: false });
  });

  it('starts a frame build only for the frame whose plan was agreed', () => {
    const { runner, run } = setUp();
    runner.begin('code frame f2', agreed([line()], 'f2'));
    expect(run('code_frame', { frame: 'f2' })).toMatchObject({
      ok: true,
      ids: { method: 'myFirstMethod' },
    });
    expect(run('code_frame', { frame: 'f1' })).toMatchObject({ error: 'no_agreed_plan' });
  });
});

function line(): PlanStep {
  return step({ words: 'The fox says its line.', actor: 'fox', action: 'say', line: 'l3' });
}

describe('PrompterRunner: keeping the plan with its frame (spec 04, section 6.7)', () => {
  it('keeps the agreed plan in the same undo step as the build, and Undo takes both back', () => {
    const kept: unknown[] = [];
    const { runner, run, session } = setUp('s2', exampleProduction(), {
      keepPlan: (p, plan) => {
        kept.push(plan);
        return {
          ...p,
          frames: p.frames.map((f) => (f.id === plan.frame ? { ...f, caption: 'kept' } : f)),
        };
      },
    });
    const original = session.production();
    const shown = line();
    runner.begin('code frame f2', {});
    run('propose_plan', { frame: 'f2', steps: [shown] });
    runner.end();
    const edited = { ...shown, words: 'The fox says its line, as I changed it.' };
    runner.begin('Build these steps.', agreed([edited], 'f2'));
    expect(
      run('insert_statement', {
        method: 'myFirstMethod',
        position: 'end',
        target: 'fox',
        procedure: 'say',
        arguments: [{ name: 'text', value: "Don't be scared. I'm lost too." }],
        line: 'l3',
        narration: 'The fox speaks.',
        plan_step: 1,
      }),
    ).toMatchObject({ ok: true });
    runner.end();
    expect(kept).toEqual([{ frame: 'f2', shown: [shown], agreed: [edited] }]);
    expect(session.production().frames.find((f) => f.id === 'f2')?.caption).toBe('kept');
    // One step: the build and the kept plan together.
    expect(session.history()).toHaveLength(1);
    session.undo();
    expect(session.production().frames).toEqual(original.frames);
  });

  it("keeps nothing, and records nothing, when keepPlan won't keep the plan; the build goes on", () => {
    for (const keepPlan of [
      (p: Production) => p,
      () => {
        throw new Error('That plan is too long to keep.');
      },
    ]) {
      const { runner, run, session } = setUp('s2', exampleProduction(), { keepPlan });
      runner.begin('code frame f2', {});
      run('propose_plan', { frame: 'f2', steps: [line()] });
      runner.end();
      runner.begin('Build these steps.', agreed([line()], 'f2'));
      expect(
        run('insert_statement', {
          method: 'myFirstMethod',
          position: 'end',
          target: 'fox',
          procedure: 'say',
          arguments: [{ name: 'text', value: "Don't be scared. I'm lost too." }],
          line: 'l3',
          narration: 'The fox speaks.',
          plan_step: 1,
        }),
      ).toMatchObject({ ok: true });
      runner.end();
      expect(session.history()).toHaveLength(1);
      expect(session.production().frames).toEqual(exampleProduction().frames);
    }
  });

  it('keeps nothing for a plan with no frame, or a build that changed nothing', () => {
    const kept: unknown[] = [];
    const { runner, run } = setUp('s2', exampleProduction(), {
      keepPlan: (p, plan) => (kept.push(plan), p),
    });
    runner.begin('go', agreed([step({})]));
    run('insert_statement', move('1'));
    runner.end();
    runner.begin('Build these steps.', agreed([line()], 'f2'));
    runner.end();
    expect(kept).toEqual([]);
  });
});

describe('PrompterRunner: coding a frame (spec 04, section 3.2; 10.8)', () => {
  const say = (extra: JsonObject = {}) => ({
    method: 'myFirstMethod',
    position: 'end',
    target: 'fox',
    procedure: 'say',
    arguments: [{ name: 'text', value: "Don't be scared. I'm lost too." }],
    line: 'l3',
    narration: 'The fox speaks.',
    plan_step: 1,
    ...extra,
  });
  const links = (session: ProductionSession<string>, frame = 'f2') =>
    session.production().frames.find((f) => f.id === frame)!.links;
  /** The example, with scene 2's frames given as [order, links]. */
  const framed = (frames: readonly (readonly [string, number, readonly string[]])[]) => {
    const p = exampleProduction();
    const f2 = p.frames.find((f) => f.id === 'f2')!;
    return {
      ...p,
      frames: [
        ...p.frames.filter((f) => f.scene !== f2.scene),
        ...frames.map(([id, order, l]) => ({
          ...f2,
          id: frameId(id),
          order,
          links: l.map((n) => nodeId(n)),
        })),
      ],
    };
  };

  it('says where to build: after the blocks the frame already links', () => {
    const { runner, run } = setUp();
    runner.begin('code frame f2', agreed([line()], 'f2'));
    const result = run('code_frame', { frame: 'f2' });
    expect(result).toMatchObject({ ok: true, ids: { method: 'myFirstMethod', position: '1' } });
    expect(result.ok && result.ids.parent_block).toBeUndefined();
  });

  it('puts a new frame after the frames before it, or before the frames after it', () => {
    const after = setUp(
      's2',
      framed([
        ['f2', 0, ['scene2b']],
        ['f4', 1, []],
      ]),
    );
    after.runner.begin('code frame f4', agreed([line()], 'f4'));
    expect(after.run('code_frame', { frame: 'f4' })).toMatchObject({ ids: { position: '1' } });

    const before = setUp(
      's2',
      framed([
        ['f2', 0, []],
        ['f4', 1, ['scene2b']],
      ]),
    );
    before.runner.begin('code frame f2', agreed([line()], 'f2'));
    expect(before.run('code_frame', { frame: 'f2' })).toMatchObject({ ids: { position: '0' } });

    const none = setUp('s2', framed([['f2', 0, []]]));
    none.runner.begin('code frame f2', agreed([line()], 'f2'));
    expect(none.run('code_frame', { frame: 'f2' })).toMatchObject({ ids: { position: 'end' } });
  });

  it('links the blocks built after it to the frame, in the one undo step', () => {
    const { runner, run, session } = setUp();
    const original = session.production();
    // A do together is for two steps or more (section 6.10): the line, said with a wave.
    const wave = step({ words: 'The fox waves.', actor: 'fox', action: 'move', together: true });
    runner.begin('code frame f2', agreed([line(), wave], 'f2'));
    run('code_frame', { frame: 'f2' });
    const together = run('insert_control', {
      method: 'myFirstMethod',
      position: 'end',
      kind: 'doTogether',
      narration: 'These happen at the same time.',
      plan_step: 2,
    });
    const block = (together.ok && together.ids.block) || '';
    expect(run('insert_statement', say({ parent_block: block, position: '0' }))).toMatchObject({
      ok: true,
    });
    expect(
      run('insert_statement', {
        ...move('1', { target: 'fox', parent_block: block, position: '1' }),
        plan_step: 2,
      }),
    ).toMatchObject({ ok: true });
    runner.end();
    const body = methodBody(session.program());
    const [comment, control] = body.slice(-2);
    expect(comment?.kind).toBe('comment');
    // The block inside the linked doTogether isn't linked again.
    expect(links(session)).toEqual(['scene2b', comment!.id, control!.id]);
    expect(session.history()).toHaveLength(1);
    session.undo();
    expect(session.production()).toEqual(original);
  });

  it('links nothing without code_frame', () => {
    const { runner, run, session } = setUp();
    runner.begin('make the fox speak', agreed([line()], 'f2'));
    expect(run('insert_statement', say())).toMatchObject({ ok: true });
    runner.end();
    expect(links(session)).toEqual(['scene2b']);
  });

  it('gives the check saved on the frame when the studio has no newer one, as data', () => {
    const p = exampleProduction();
    const saved = {
      ...p,
      frames: p.frames.map((f) =>
        f.id === 'f2'
          ? {
              ...f,
              check: {
                basis: 'b1',
                items: [
                  {
                    id: 'line:l3',
                    kind: 'line' as const,
                    outcome: 'flag' as const,
                    words: 'The fox <never> says its line.',
                    line: lineId('l3'),
                  },
                ],
                kept: [],
              },
            }
          : f,
      ),
    };
    const { run } = setUp('s2', saved, { checkResult: () => null });
    const result = run('check_frame', { frame: 'f2' });
    const summary = result.ok ? result.summary : '';
    expect(summary).toMatch(/^<check_result>.*"outcome":"flag".*<\/check_result>$/s);
    expect(summary).not.toContain('<never>');
  });
});

describe('find_models (spec 04, sections 2.7 and 3.1)', () => {
  const owl = {
    id: 'example/Flyer/owl',
    section: 'cast',
    class: 'Flyer',
    name: 'Owl',
    joints: 'J1',
    line: 'example/Flyer/owl: Owl, a brown owl 0.4 m, joints J1',
    short: 'example/Flyer/owl: Owl (J1)',
    words: ['owl', 'brown', 'flyer'],
  } as const;
  const catalogue = { header: '', joints: { J1: ['hips', 'head'] }, items: [owl] };

  it('gives the full lines and their joints, and changes nothing', () => {
    const { run, now, original } = setUp('s2', undefined, { catalogue });
    expect(run('find_models', { query: 'a brown owl', section: '' })).toEqual({
      ok: true,
      ids: {},
      summary: '1 shipped model matches, best first.',
      models: [owl.line],
      joints: { J1: ['hips', 'head'] },
    });
    expect(now()).toBe(original);
  });

  it('says when nothing matches, or the section has none', () => {
    const { run } = setUp('s2', undefined, { catalogue });
    for (const input of [
      { query: 'rocket', section: '' },
      { query: 'owl', section: 'props' },
    ])
      expect(run('find_models', input)).toMatchObject({
        ok: true,
        models: [],
        summary: 'No shipped model matches those words. The Backstage index lists every one.',
      });
  });

  it("searches this release's catalogue when it is given none", () => {
    const { run } = setUp();
    const found = run('find_models', { query: 'knight', section: 'cast' });
    const models = found.ok ? (found.models ?? []) : [];
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((l: string) => /^[a-z0-9-]+\/[A-Z]\w*\/\S+: /.test(l))).toBe(true);
  });
});

describe('explain (spec 04, section 3.1)', () => {
  it('tells Claude the answer is its reply, so it ends the turn without repeating it', () => {
    const { run } = setUp();
    expect(run('explain', { text: 'The move block moves the penguin.' })).toEqual({
      ok: true,
      ids: {},
      summary: EXPLAINED,
    });
    expect(EXPLAINED).toMatch(/End your turn now/);
  });
});

describe('building a repeat of several steps (spec 04, section 6.8)', () => {
  const loop = step({
    words: 'Repeat 3 times:',
    kind: 'repeat',
    actor: '',
    action: '',
    details: [],
    repeat: 3,
    holds: 2,
  });
  const up = (extra: JsonObject = {}) => move('1', { plan_step: 2, ...extra });
  const down = (extra: JsonObject = {}) => move('1', { plan_step: 3, ...extra });
  const count = () => ({
    method: 'myFirstMethod',
    position: 'end',
    kind: 'count',
    count: 3,
    narration: 'A repeat 3 times block appears.',
    plan_step: 1,
  });

  it("builds the repeat's count, then its steps inside it, each with its words above", () => {
    const { runner, run, now } = setUp();
    runner.begin('go', agreed([loop, step({}), step({})]));
    const made = run('insert_control', count());
    expect(made).toMatchObject({ ok: true });
    const block = (made.ok && made.ids.block) || '';
    expect(run('insert_statement', up({ parent_block: block }))).toMatchObject({ ok: true });
    expect(run('insert_statement', down({ parent_block: block }))).toMatchObject({ ok: true });
    runner.end();
    const body = methodBody(now());
    const last = body.at(-1)!;
    expect(body.at(-2)).toMatchObject({ kind: 'comment', text: 'Repeat 3 times:' });
    expect(last.kind).toBe('count');
    expect('body' in last && last.body.map((s) => s.kind)).toEqual([
      'comment',
      'call',
      'comment',
      'call',
    ]);
  });

  it('refuses a held step outside its count, or before the count is built, and says why', () => {
    const { runner, run } = setUp();
    runner.begin('go', agreed([loop, step({}), step({})]));
    expect(run('insert_statement', up())).toMatchObject({
      error: 'not_in_plan',
      message: expect.stringMatching(/inside step 1's repeat: build step 1's count block first/),
    });
    const made = run('insert_control', count());
    const block = (made.ok && made.ids.block) || '';
    expect(run('insert_statement', up())).toMatchObject({
      error: 'not_in_plan',
      message: expect.stringContaining(`give its count block, ${block}, as parent_block`),
    });
    runner.end();
  });
});
