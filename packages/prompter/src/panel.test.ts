import { describe, expect, it } from 'vitest';
import { indexProgram, type NodeId } from '@storystage/ast';
import {
  ProductionSession,
  exampleProduction,
  frameId,
  sceneId,
  type FrameId,
} from '@storystage/production';
import { checkProgram } from '@storystage/story-api/program-check';
import type { PrompterLevel } from './levels.ts';
import { BUILD_REQUEST, PrompterPanel, createPrompterPanel } from './panel.ts';
import { releaseSystem, releaseTools } from './pins.ts';
import type { PlanStep } from './plans.ts';
import { PrompterRunner } from './runner.ts';
import { PrompterSession } from './session.ts';
import { buildSystem } from './system-prompt.ts';
import { testReply, type TestBlock } from './testing.ts';
import { TOOLS } from './tools.ts';
import {
  scriptedTransport,
  type Json,
  type PrompterEvent,
  type PrompterRequest,
  type PrompterTransport,
  type TransportStatus,
} from './transport.ts';

const step = (s: Partial<PlanStep> = {}): PlanStep => ({
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
  why: 'So she can reach the fox.',
  ...s,
});

const use = (id: string, name: string, input: unknown): TestBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const say = (text: string) => testReply([{ type: 'text', text }]);
const proposes = (steps: PlanStep[]) => testReply([use('t1', 'propose_plan', { steps })]);
const moves = testReply([
  use('t2', 'insert_statement', {
    method: 'myFirstMethod',
    position: 'end',
    target: 'penguin',
    procedure: 'move',
    arguments: [
      { name: 'direction', value: 'forward' },
      { name: 'amount', value: '1' },
    ],
    narration: 'The penguin waddles forward.',
    plan_step: 1,
  }),
]);

interface Options {
  readonly level?: PrompterLevel;
  readonly status?: TransportStatus;
  readonly inBuild?: boolean;
  /** Replaces a whole request's reply with one transport event. */
  readonly fail?: PrompterEvent;
  readonly checkResult?: (frame: FrameId) => Json | null;
}

function setUp(replies: PrompterEvent[][], options: Options = {}) {
  let next = 0;
  const scripted = scriptedTransport(() =>
    options.fail ? [options.fail] : (replies[next++] ?? say('No more.')),
  );
  const transport: PrompterTransport & { sent: PrompterRequest[] } = {
    sent: scripted.sent,
    status: async () => options.status ?? { available: true },
    send: (r, s) => scripted.send(r, s),
  };
  const production = new ProductionSession<string>(exampleProduction(), {
    check: (p) => checkProgram(p),
  });
  let level: PrompterLevel = options.level ?? 'full';
  const runner = new PrompterRunner({
    session: production,
    source: 'prompter',
    scene: () => sceneId('s2'),
    backstageClass: () => null,
  });
  let id = 0;
  const prompter = new PrompterSession({
    transport,
    system: buildSystem({ storyApi: 'class Scene', backstage: 'Cast: cat' }),
    tools: TOOLS as unknown as Json[],
    runner,
    newId: () => `r${++id}`,
  });
  const panel = new PrompterPanel({
    prompter,
    runner,
    transport,
    production,
    source: 'prompter',
    level: () => level,
    scene: () => sceneId('s2'),
    ...(options.inBuild === undefined ? {} : { inBuild: options.inBuild }),
    ...(options.checkResult ? { checkResult: options.checkResult } : {}),
  });
  return { panel, production, transport, setLevel: (l: PrompterLevel) => (level = l) };
}

/** Asks for a one-step plan in Show me how. */
async function planned(replies: PrompterEvent[][] = [], options: Options = {}) {
  const t = setUp([proposes([step()]), say("Here's the plan."), ...replies], options);
  await t.panel.refresh();
  t.panel.setMode('showMeHow');
  await t.panel.ask('Make the penguin walk to the fox.');
  return t;
}

describe('PrompterPanel: what it shows (spec 07, section 2.4)', () => {
  it('is absent from the browser version, off for the school, and waits for set-up', async () => {
    const browser = setUp([], { inBuild: false });
    await browser.panel.refresh();
    expect(browser.panel.state.phase).toBe('absent');

    const school = setUp([], { status: { available: false, reason: 'prompter_off' } });
    await school.panel.refresh();
    expect(school.panel.state.phase).toBe('off');

    const noKey = setUp([], { status: { available: false, reason: 'no_key' } });
    await noKey.panel.refresh();
    expect(noKey.panel.state.phase).toBe('notSetUp');
    await noKey.panel.ask('Hello');
    expect(noKey.transport.sent).toHaveLength(0);
  });

  it('offers only the modes the level allows', async () => {
    const { panel, setLevel } = setUp([], { level: 'explainOnly' });
    await panel.refresh();
    expect(panel.state.modes).toEqual(['explain', 'storyCoach', 'scriptCheck']);
    panel.setMode('buildIt');
    expect(panel.state.mode).toBe('explain');
    setLevel('off');
    await panel.refresh();
    expect(panel.state.phase).toBe('off');
  });

  it('shows what was asked and the reply, then is ready again', async () => {
    const { panel } = setUp([say('The penguin is called Pip.')]);
    await panel.refresh();
    await panel.ask("What's the penguin called?");
    expect(panel.state.phase).toBe('ready');
    expect(panel.state.entries).toEqual([
      { kind: 'asked', text: "What's the penguin called?" },
      { kind: 'reply', text: 'The penguin is called Pip.', done: true },
    ]);
  });

  it('grows one reply as it streams, and marks it done once, at the end', async () => {
    const { panel } = setUp([say('The penguin is called Pip.')]);
    await panel.refresh();
    const replies: { text: string; done: boolean }[] = [];
    panel.subscribe((s) => {
      const last = s.entries.at(-1);
      if (last?.kind === 'reply') replies.push({ text: last.text, done: last.done });
    });
    await panel.ask("What's the penguin called?");
    const done = replies.findIndex((r) => r.done);
    // It grew while not done, and never changed once it was.
    expect(done).toBeGreaterThan(1);
    expect(new Set(replies.slice(0, done).map((r) => r.text)).size).toBeGreaterThan(1);
    for (const r of replies.slice(done))
      expect(r).toEqual({ text: 'The penguin is called Pip.', done: true });
    expect(panel.state.entries.filter((e) => e.kind === 'reply')).toHaveLength(1);
  });

  it('sends the production and the storyboard as data with the request', async () => {
    const { panel, transport } = setUp([say('Yes.')]);
    await panel.refresh();
    await panel.ask('Is there a fox?');
    const turn = JSON.stringify(transport.sent[0]!.body.messages);
    expect(turn).toContain('<production_data>');
    expect(turn).toContain('<storyboard_data>');
  });
});

describe('PrompterPanel: plan before change (spec 04, sections 4.5 and 6)', () => {
  it('shows the plan, with Build these steps, and nothing built yet', async () => {
    const { panel, production } = await planned();
    expect(panel.state.phase).toBe('planned');
    expect(panel.state.plan).toMatchObject({ plan: 'p1', frame: null, problems: [] });
    expect(panel.state.plan!.steps).toEqual([step()]);
    expect(panel.state.canBuild).toBe(true);
    expect(production.history()).toHaveLength(0);
  });

  it("checks each edit, and holds Build back while a step can't be built", async () => {
    const { panel } = await planned();
    panel.changeStep(0, { actor: 'owl' });
    expect(panel.state.plan!.problems).toEqual([
      { step: 1, message: expect.stringMatching(/owl/) },
    ]);
    expect(panel.state.canBuild).toBe(false);
    panel.changeStep(0, { actor: 'penguin' });
    expect(panel.state.canBuild).toBe(true);
    panel.addStep(step({ words: 'The fox follows.', actor: 'fox' }));
    panel.moveStep(1, 0);
    expect(panel.state.plan!.steps.map((s) => s.actor)).toEqual(['fox', 'penguin']);
    panel.deleteStep(0);
    expect(panel.state.plan!.steps.map((s) => s.actor)).toEqual(['penguin']);
    // The Prompter's own version is kept beside the learner's (6.7).
    expect(panel.state.plan!.shown).toEqual([step()]);
  });

  it('builds the agreed plan as one step, which Undo this request takes back', async () => {
    const { panel, production, transport } = await planned([moves, say('Done.')]);
    const before = production.production();
    await panel.build();
    expect(JSON.stringify(transport.sent.at(-2)!.body.messages)).toContain('<agreed_plan>');
    expect(panel.state.phase).toBe('built');
    expect(panel.state.entries).toContainEqual({ kind: 'asked', text: BUILD_REQUEST });
    const change = panel.state.entries.find((e) => e.kind === 'change');
    expect(change).toMatchObject({ text: 'The penguin waddles forward.', step: 1 });
    // The blocks that landed, for highlighting: the step's comment and its move block.
    const index = indexProgram(production.program());
    const kinds = (change as { nodes: readonly NodeId[] }).nodes.map(
      (id) => index.get(id)?.node.kind,
    );
    expect(kinds).toContain('comment');
    expect(kinds).toContain('call');
    expect(production.history()).toHaveLength(1);
    expect(panel.state.canUndo).toBe(true);
    panel.undoRequest();
    expect(production.production()).toEqual(before);
    expect(panel.state).toMatchObject({ phase: 'ready', canUndo: false });
  });

  it('builds what a character says from the request that made the plan (section 6.5)', async () => {
    const hello = step({
      words: 'The penguin says Hello.',
      action: 'say',
      details: [{ name: 'text', value: 'Hello' }],
    });
    const says = testReply([
      use('t2', 'insert_statement', {
        method: 'myFirstMethod',
        position: 'end',
        target: 'penguin',
        procedure: 'say',
        arguments: [{ name: 'text', value: 'Hello' }],
        narration: 'The penguin says Hello.',
        plan_step: 1,
      }),
    ]);
    const { panel } = setUp([proposes([hello]), say("Here's the plan."), says, say('Done.')]);
    await panel.refresh();
    panel.setMode('buildIt');
    await panel.ask('Make the penguin say Hello.');
    await panel.build();
    expect(panel.state).toMatchObject({ phase: 'built', message: null });
    expect(panel.state.entries).toContainEqual(
      expect.objectContaining({ kind: 'change', step: 1 }),
    );
  });

  it('stops offering Undo this request once the learner changes something after it', async () => {
    const { panel, production } = await planned([moves, say('Done.')]);
    await panel.build();
    production.change('Move fox', 'stage', ({ program: _program, ...rest }) => rest);
    panel.setMode('showMeHow');
    expect(panel.state.canUndo).toBe(false);
  });

  it('offers Undo this request in Planned, where it drops the plan', async () => {
    const { panel, production } = await planned();
    expect(panel.state.canUndo).toBe(true);
    panel.undoRequest();
    expect(panel.state).toMatchObject({ phase: 'ready', plan: null, canUndo: false });
    expect(production.history()).toHaveLength(0);
  });

  it("writes a changed or added step's words again from what it now does", async () => {
    const { panel } = await planned();
    panel.changeStep(0, {
      details: [
        { name: 'direction', value: 'forward' },
        { name: 'amount', value: '3' },
      ],
    });
    expect(panel.state.plan?.steps[0]?.words).toBe('Penguin move forward 3.');
    // Words the change gives are kept.
    panel.changeStep(0, { words: 'Pip walks three steps.' });
    expect(panel.state.plan?.steps[0]?.words).toBe('Pip walks three steps.');
    panel.addStep(step({ words: '', actor: 'fox', action: 'turnToFace', target: 'penguin' }));
    expect(panel.state.plan?.steps[1]?.words).toBe('Fox turn to face penguin.');
    // The Prompter's version is unchanged beside it, for keeping with the frame (6.7).
    expect(panel.state.plan?.shown[0]?.words).toBe('The penguin waddles forward.');
  });

  it('keeps the words of a step saved with nothing changed', async () => {
    const { panel } = await planned();
    const before = panel.state.plan!.steps[0]!;
    panel.changeStep(0, {
      actor: before.actor,
      action: before.action,
      details: before.details,
      line: before.line,
      together: before.together,
      repeat: before.repeat,
    });
    expect(panel.state.plan?.steps[0]?.words).toBe(before.words);
    panel.changeStep(0, { repeat: 2 });
    expect(panel.state.plan?.steps[0]?.words).not.toBe(before.words);
  });

  it('never offers Build these steps at the Plan only level', async () => {
    const { panel } = await planned([], { level: 'planOnly' });
    expect(panel.state.phase).toBe('planned');
    expect(panel.state.canBuild).toBe(false);
  });

  it('asks for a frame when the learner presses Code this frame', async () => {
    const { panel, transport } = setUp([say('Here is a plan.')]);
    await panel.refresh();
    await panel.codeFrame(frameId('f2'));
    expect(panel.state.entries[0]).toEqual({ kind: 'asked', text: 'Code frame f2.' });
    expect(JSON.stringify(transport.sent[0]!.body.messages)).toContain('Code frame f2.');
  });
});

describe('PrompterPanel: Plan only ticks steps off (spec 04, section 6.6)', () => {
  /** The learner adds a block to scene 2's method, as the editor would: penguin move forward. */
  let n = 0;
  const learnerMoves = (production: ProductionSession<string>, amount: number, at = 1) => {
    // Node ids are 6 to 12 lowercase letters and digits.
    const id = (k: string) => `learn${k}${++n}` as NodeId;
    return production.apply(
      [
        {
          kind: 'insert',
          label: 'Move penguin',
          parent: 'scene2m' as NodeId,
          slot: 'body',
          index: at,
          node: {
            id: id('m'),
            kind: 'call',
            target: {
              id: id('e'),
              kind: 'fieldRef',
              target: { id: id('e'), kind: 'this' },
              field: 'scene2p' as NodeId,
            },
            callee: { kind: 'story', name: 'move' },
            args: {
              direction: { id: id('e'), kind: 'enum', type: 'MoveDirection', value: 'forward' },
              amount: { id: id('e'), kind: 'number', value: amount },
            },
            details: {},
          },
        },
      ],
      'Move penguin',
      'learner',
    );
  };
  const framePlan = (steps: PlanStep[]) =>
    testReply([use('t1', 'propose_plan', { frame: 'f2', steps })]);
  async function planOnly(steps: PlanStep[] = [step()], frame = true) {
    const t = setUp([frame ? framePlan(steps) : proposes(steps), say("Here's the plan.")], {
      level: 'planOnly',
    });
    await t.panel.refresh();
    t.panel.setMode('showMeHow');
    await t.panel.ask('Make the penguin walk to the fox.');
    return t;
  }
  const kept = (production: ProductionSession<string>) =>
    production.production().frames.find((f) => f.id === 'f2')?.plan;

  it('ticks a step off when the learner builds it, and keeps the plan outside undo', async () => {
    const { panel, production } = await planOnly();
    expect(panel.state.plan?.done).toEqual([false]);
    expect(kept(production)).toBeUndefined();
    expect(learnerMoves(production, 1)).toMatchObject({ ok: true });
    expect(panel.state.plan?.done).toEqual([true]);
    const first = kept(production);
    expect(first).toMatchObject({ done: [1], agreed: [step()], shown: [step()] });
    // Keeping made no step of its own: Undo takes back the learner's block.
    expect(production.history().filter((h) => h.done)).toHaveLength(1);
    production.undo();
    expect(panel.state.plan?.done).toEqual([false]);
    // The plan stays with its frame, its ticks following the code, from the first tick's time.
    expect(kept(production)).toMatchObject({ done: [], agreedAt: first!.agreedAt });
    production.redo();
    expect(kept(production)).toMatchObject({ done: [1] });
  });

  it("ticks a block linked to the frame, but not one that doesn't match", async () => {
    const says = step({
      words: 'The fox says its line.',
      actor: 'fox',
      action: 'say',
      line: 'l3',
      details: [],
    });
    const { panel, production } = await planOnly([step(), says]);
    // Scene 2 already has the fox's line, linked to frame f2: it's this frame's, so it ticks.
    expect(panel.state.plan?.done).toEqual([false, true]);
    learnerMoves(production, 2);
    expect(panel.state.plan?.done).toEqual([false, true]);
    learnerMoves(production, 1);
    expect(panel.state.plan?.done).toEqual([true, true]);
  });

  it('ticks nothing for a block from before the plan, unless it is linked to the frame', async () => {
    const before = step({
      words: 'The fox says its line.',
      actor: 'fox',
      action: 'say',
      line: 'l3',
      details: [],
    });
    // A plan with no frame: the fox's line is from before it, and linked to no frame of its own.
    const { panel } = await planOnly([before], false);
    expect(panel.state.plan?.done).toEqual([false]);
  });

  it('needs one block for each step that is the same', async () => {
    const { panel, production } = await planOnly([step(), step()]);
    learnerMoves(production, 1);
    expect(panel.state.plan?.done).toEqual([true, false]);
    learnerMoves(production, 1, 2);
    expect(panel.state.plan?.done).toEqual([true, true]);
  });

  it('ticks again as the learner edits the plan, and keeps the plan as it now stands', async () => {
    const { panel, production } = await planOnly();
    learnerMoves(production, 3);
    expect(panel.state.plan?.done).toEqual([false]);
    panel.changeStep(0, {
      details: [
        { name: 'direction', value: 'forward' },
        { name: 'amount', value: '3' },
      ],
    });
    expect(panel.state.plan?.done).toEqual([true]);
    expect(kept(production)?.agreed[0]?.details).toContainEqual({ name: 'amount', value: '3' });
  });

  it('ticks a plan with no frame, but keeps it nowhere', async () => {
    const { panel, production } = await planOnly([step()], false);
    learnerMoves(production, 1);
    expect(panel.state.plan?.done).toEqual([true]);
    expect(production.production().frames.some((f) => f.plan !== undefined)).toBe(false);
  });

  it('ticks nothing at a level where the Prompter builds', async () => {
    const t = setUp([framePlan([step()]), say("Here's the plan.")]);
    await t.panel.refresh();
    t.panel.setMode('showMeHow');
    await t.panel.ask('Make the penguin walk to the fox.');
    learnerMoves(t.production, 1);
    expect(t.panel.state.plan?.done).toEqual([false]);
    expect(kept(t.production)).toBeUndefined();
  });
});

describe('PrompterPanel: asking about a frame (11.6)', () => {
  const checked = (frame: FrameId) => ({
    frame,
    items: [{ id: 'c1', words: 'Owl is off screen' }],
  });

  it("sends the frame's check result with a question about it", async () => {
    const { panel, transport } = setUp([say('Owl walks past the edge.')], { checkResult: checked });
    await panel.refresh();
    await panel.ask('Why is Owl off screen?', { frame: frameId('f2') });
    expect(panel.state.entries[0]).toEqual({ kind: 'asked', text: 'Why is Owl off screen?' });
    expect(JSON.stringify(transport.sent[0]!.body.messages)).toContain('Owl is off screen');
  });

  it("says which item the question is about, so the question needn't quote its words", async () => {
    const { panel, transport } = setUp([say('Owl walks past the edge.')], { checkResult: checked });
    await panel.refresh();
    await panel.ask('Why does the check flag this on frame 2.1?', {
      frame: frameId('f2'),
      item: 'c1',
    });
    const sent = JSON.stringify(transport.sent[0]!.body.messages);
    expect(sent).toContain('<check_result>');
    expect(sent).toContain('\\"asked\\":\\"c1\\"');
    // The flag's words go only as data, never as the learner's request.
    expect(panel.state.entries[0]).toEqual({
      kind: 'asked',
      text: 'Why does the check flag this on frame 2.1?',
    });
  });

  it('sends none with a question about nothing in particular', async () => {
    const { panel, transport } = setUp([say('Hello.')], { checkResult: checked });
    await panel.refresh();
    await panel.ask('Hello');
    expect(JSON.stringify(transport.sent[0]!.body.messages)).not.toContain('Owl is off screen');
  });
});

describe('PrompterPanel: limits and problems (spec 04, section 7)', () => {
  it("goes to the limit state on the day's cap, with the class's words", async () => {
    const { panel } = setUp([], { fail: { type: 'error', code: 'cap_reached' } });
    await panel.refresh();
    await panel.ask('Hello');
    expect(panel.state.phase).toBe('limit');
    expect(panel.state.message?.text).toMatch(/Prompter's time for today/);
  });

  it('keeps the limit and its words when the lowered level is read, until the next request', async () => {
    const { panel, setLevel } = setUp([say('Here you go.')], {
      fail: { type: 'error', code: 'cap_reached' },
    });
    await panel.refresh();
    await panel.ask('Hello');
    setLevel('explainOnly');
    await panel.refresh();
    expect(panel.state).toMatchObject({
      phase: 'limit',
      modes: ['explain', 'storyCoach', 'scriptCheck'],
      mode: 'explain',
    });
    expect(panel.state.message?.text).toMatch(/Prompter's time for today/);
  });

  it('says what happened and what to do next', async () => {
    const { panel } = setUp([], { fail: { type: 'error', code: 'overloaded' } });
    await panel.refresh();
    await panel.ask('Hello');
    expect(panel.state.phase).toBe('problem');
    expect(panel.state.message).toMatchObject({ action: 'tryAgain' });
  });

  it('goes to set-up when the key stops working mid-conversation', async () => {
    const { panel } = setUp([], { fail: { type: 'error', code: 'no_key' } });
    await panel.refresh();
    await panel.ask('Hello');
    expect(panel.state.phase).toBe('notSetUp');
  });

  it('stops a request, with no problem shown', async () => {
    const { panel } = setUp([say('A long answer.')]);
    await panel.refresh();
    const asking = panel.ask('Tell me a story.');
    panel.stop();
    await asking;
    expect(panel.state).toMatchObject({ phase: 'ready', message: null });
  });

  it('stops a request in flight when the level turns Off, and stays off', async () => {
    const { panel, setLevel } = setUp([say('A long answer.')]);
    await panel.refresh();
    const asking = panel.ask('Tell me a story.');
    setLevel('off');
    await panel.refresh();
    await asking;
    expect(panel.state).toMatchObject({ phase: 'off', modes: [], message: null });
    await panel.ask('Are you there?');
    expect(panel.state.entries.filter((e) => e.kind === 'asked')).toHaveLength(1);
    setLevel('full');
    await panel.refresh();
    expect(panel.state.phase).toBe('ready');
  });

  it('takes one request at a time', async () => {
    const { panel, transport } = setUp([say('One.'), say('Two.')]);
    await panel.refresh();
    const first = panel.ask('One?');
    await panel.ask('Two?');
    await first;
    expect(transport.sent).toHaveLength(1);
  });
});

describe('PrompterPanel: Try again (spec 04, section 7)', () => {
  const overloaded: PrompterEvent[] = [{ type: 'error', code: 'overloaded' }];

  it('sends the last request again, as it was', async () => {
    const { panel, transport } = setUp([overloaded, say('Hello.')]);
    await panel.refresh();
    await panel.ask('Hi there');
    expect(panel.state).toMatchObject({ phase: 'problem', canRetry: true });
    await panel.retry();
    expect(transport.sent).toHaveLength(2);
    expect(panel.state).toMatchObject({ phase: 'ready', canRetry: false });
    const asked = panel.state.entries.filter((e) => e.kind === 'asked');
    expect(asked).toEqual([
      { kind: 'asked', text: 'Hi there' },
      { kind: 'asked', text: 'Hi there' },
    ]);
  });

  it('builds again with the plan as it stands, when the build changed nothing', async () => {
    const { panel, transport } = await planned([overloaded, moves, say('Done.')]);
    await panel.build();
    expect(panel.state).toMatchObject({ phase: 'problem', canRetry: true });
    await panel.retry();
    expect(panel.state.phase).toBe('built');
    expect(JSON.stringify(transport.sent.at(-2)!.body.messages)).toContain('<agreed_plan>');
  });

  it("isn't offered after a build that stopped part-way: that is undone, not built on top", async () => {
    const { panel, transport } = await planned([moves, overloaded]);
    await panel.build();
    expect(panel.state).toMatchObject({ phase: 'problem', canRetry: false, canUndo: true });
    const sent = transport.sent.length;
    await panel.retry();
    expect(transport.sent).toHaveLength(sent);
  });
});

describe('createPrompterPanel', () => {
  it("takes the studio's own session, with its own names for where changes come from", () => {
    const studio = new ProductionSession<'learner' | 'prompter'>(exampleProduction());
    const options = {
      transport: scriptedTransport(() => say('Hello.')),
      production: studio,
      level: () => 'full' as const,
      scene: () => sceneId('s2'),
      backstageClass: () => null,
    };
    expect(createPrompterPanel({ ...options, source: 'prompter' })).toBeInstanceOf(PrompterPanel);
    // @ts-expect-error: a source the studio's history doesn't have.
    createPrompterPanel({ ...options, source: 'robot' });
  });

  it("sends this release's pinned system and tools, through the runner on the open production", async () => {
    const transport = scriptedTransport(() => say('Hello.'));
    const panel = createPrompterPanel({
      transport,
      production: new ProductionSession<string>(exampleProduction()),
      source: 'prompter',
      level: () => 'full',
      scene: () => sceneId('s2'),
      backstageClass: () => null,
    });
    await panel.refresh();
    await panel.ask('Hello');
    const body = transport.sent[0]!.body;
    expect(body.system).toEqual(releaseSystem());
    expect(body.tools).toEqual(releaseTools());
    expect(panel.state.entries.at(-1)).toEqual({ kind: 'reply', text: 'Hello.', done: true });
  });
});
