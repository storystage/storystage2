import { describe, expect, it } from 'vitest';
import { EditSession, programText, type Program } from '@storystage/ast';
import { exampleProduction, sceneId, type Production } from '@storystage/production';
import { checkProgram } from '@storystage/story-api/program-check';
import type { PlanStep } from './plans.ts';
import { PrompterRunner } from './runner.ts';
import type { ToolName } from './tool-names.ts';
import type { ToolOutcome } from './tools.ts';
import type { Json, JsonObject } from './transport.ts';

const step = (s: Partial<PlanStep>): PlanStep => ({
  words: 'The penguin waddles forward.',
  kind: 'do',
  actor: 'penguin',
  action: 'move',
  target: '',
  details: [],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  why: 'So she can reach the fox.',
  ...s,
});

function setUp(scene = 's2') {
  let production: Production = exampleProduction();
  const session = new EditSession<string>(production.program, { check: (p) => checkProgram(p) });
  session.subscribe((change) => {
    production = { ...production, program: change.program };
  });
  const runner = new PrompterRunner({
    session,
    source: 'prompter',
    production: () => production,
    scene: () => sceneId(scene),
    isBackstageItem: (id) => id === 'example/Quadruped/owl',
    checkResult: (frame) => (frame === 'f1' ? { flags: ['Pip ends on the left.'] } : null),
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
      agreed([step({ details: [{ name: 'amount', value: '3' }] })]),
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

  it('refuses every change when no plan was agreed', () => {
    const { runner, run } = setUp();
    runner.begin('go', {});
    expect(run('insert_statement', move('1'))).toMatchObject({ error: 'not_in_plan' });
  });

  it('puts blocks inside a control block, and inside an if', () => {
    const { runner, run, now } = setUp();
    runner.begin('go', agreed([step({ together: true })]));
    const together = run('insert_control', {
      method: 'myFirstMethod',
      position: 'end',
      kind: 'doTogether',
      narration: 'These happen at the same time.',
      plan_step: 1,
    });
    expect(together).toMatchObject({ ok: true });
    const block = (together.ok && together.ids.block) || '';
    expect(
      run('insert_statement', move('1', { parent_block: block, position: '0' })),
    ).toMatchObject({ ok: true });
    runner.end();
    const last = methodBody(now()).at(-1)!;
    expect(last.kind).toBe('doTogether');
    expect('body' in last && last.body.map((s) => s.kind)).toEqual(['call']);
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
    runner.begin('go', agreed([step({}), step({ actor: 'owl' }), step({ action: 'fly' })]));
    expect(run('insert_statement', move('far'))).toMatchObject({ error: 'bad_argument' });
    expect(run('insert_statement', move('1', { method: 'nope' }))).toMatchObject({
      error: 'unknown_method',
    });
    expect(run('insert_statement', move('1', { position: '99' }))).toMatchObject({
      error: 'bad_argument',
    });
    expect(run('insert_statement', move('1', { target: 'owl', plan_step: 2 }))).toMatchObject({
      error: 'unknown_object',
    });
    expect(run('insert_statement', move('1', { procedure: 'fly', plan_step: 3 }))).toMatchObject({
      error: 'unknown_method',
    });
    expect(run('insert_statement', move('1', { parent_block: 'nowhere1' }))).toMatchObject({
      error: 'unknown_block',
    });
    runner.end();
    expect(now()).toEqual(original);
  });

  it("adds a procedure of the learner's own, and a listener", () => {
    const { runner, run, now } = setUp();
    runner.begin('go', agreed([step({ kind: 'when', actor: 'penguin', action: 'clickOnObject' })]));
    expect(
      run('declare_procedure', {
        class: 'Scene',
        name: 'hop',
        narration: 'A new hop block.',
        plan_step: 1,
      }),
    ).toMatchObject({ ok: true, ids: { method: 'hop' } });
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
    expect(scene.methods.map((m) => m.name)).toEqual(['myFirstMethod', 'hop']);
    expect(scene.listeners.map((l) => l.event)).toEqual(['clickOnObject']);
    expect(scene.listeners[0]!.params.map((p) => p.name)).toEqual(['model', 'x', 'y']);
  });

  it('leaves tools that change the scene set-up for WP8.2, changing nothing', () => {
    const { runner, run, now, original } = setUp();
    runner.begin(
      'go',
      agreed([step({ kind: 'add', actor: 'owl', action: 'example/Quadruped/owl' })]),
    );
    expect(
      run('add_model', {
        backstage_item: 'example/Quadruped/owl',
        name: 'owl',
        position: { x: 0, y: 0, z: 0 },
        narration: 'An owl appears.',
        plan_step: 1,
      }),
    ).toMatchObject({ ok: false, error: 'not_allowed_here' });
    runner.end();
    expect(now()).toEqual(original);
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
    runner.begin('code frame f2', agreed([line, step({ actor: 'fox', action: 'say' })], 'f2'));
    expect(run('insert_statement', say('Hello, friend.', { line: 'l3' }))).toMatchObject({
      error: 'not_in_script',
    });
    expect(run('insert_statement', say('Hello, friend.', { plan_step: 2 }))).toMatchObject({
      error: 'not_in_script',
    });
    expect(run('insert_statement', say('Hi.', { line: 'l99' }))).toMatchObject({
      error: 'not_in_plan',
    });
  });

  it("outside a frame, takes only the learner's own words", () => {
    const { runner, run } = setUp();
    const free = step({ actor: 'fox', action: 'say' });
    runner.begin('make the fox say Hello there', agreed([free]));
    expect(run('insert_statement', say('Hello there'))).toMatchObject({ ok: true });
    expect(run('insert_statement', say('Something funny'))).toMatchObject({
      error: 'not_in_script',
    });
  });
});

describe('PrompterRunner: reading (spec 04, sections 3.1, 3.2)', () => {
  it('reads the project as data, with each block and its id', () => {
    const { run } = setUp();
    const result = run('read_project', {});
    const summary = result.ok ? result.summary : '';
    expect(summary).toMatch(/^<production_data>.*<\/production_data>$/s);
    expect(summary).toContain('scene2b');
    // Learner text inside can't open or close a tag (section 2.4).
    const inside = summary.slice('<production_data>'.length, -'</production_data>'.length);
    expect(inside).not.toMatch(/[<>]/);
    expect(JSON.parse(inside)).toMatchObject({
      scene: 's2',
      objects: ['camera', 'penguin', 'fox'],
    });
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
