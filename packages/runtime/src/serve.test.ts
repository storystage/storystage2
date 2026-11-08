import {
  nodeId,
  type Args,
  type Expression,
  type FieldDecl,
  type ListenerDecl,
  type NodeId,
  type ParameterDecl,
  type Program,
  type Statement,
} from '@storystage/ast';
import {
  IDENTITY,
  STORY_LIBRARY,
  micros,
  objectId,
  type StageEvent,
  type StageQueryResult,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import {
  RUNTIME_PROTOCOL,
  inMemoryPorts,
  type FromRuntime,
  type RunMode,
  type ToRuntime,
} from './messages.ts';
import { serve, type Timers } from './serve.ts';
import type { StoryLibrary } from './story.ts';
import { objectName, valueText } from './values.ts';

let counter = 0;
const id = (): NodeId => nodeId(`s${(counter++).toString(36).padStart(5, '0')}`);

const field = (name: string): FieldDecl => ({
  id: nodeId(`${name}fld`.padEnd(6, 'x')),
  kind: 'field',
  name,
  type: { kind: 'story', name: 'Quadruped' },
  initial: null,
});
const CAT = field('cat');
const DOG = field('dog');

const self = (): Expression => ({ id: id(), kind: 'this' });
const of = (f: FieldDecl): Expression => ({
  id: id(),
  kind: 'fieldRef',
  target: self(),
  field: f.id,
});
const num = (value: number): Expression => ({ id: id(), kind: 'number', value });
const text = (value: string): Expression => ({ id: id(), kind: 'text', value });
const list = (...items: Expression[]): Expression => ({
  id: id(),
  kind: 'arrayOf',
  of: { kind: 'story', name: 'Thing' },
  items,
});
const ref = (p: { id: NodeId }): Expression => ({ id: id(), kind: 'variableRef', variable: p.id });

const say = (who: Expression, value: Expression, seconds = 1): Statement => ({
  id: id(),
  kind: 'call',
  target: who,
  callee: { kind: 'story', name: 'say' },
  args: { text: value },
  details: { duration: num(seconds) },
});

const param = (name: string): ParameterDecl => ({
  id: id(),
  kind: 'parameter',
  name,
  type: { kind: 'story', name: 'Thing' },
  default: null,
});

function listener(
  event: string,
  body: readonly Statement[],
  options: { args?: Args; details?: Args; params?: readonly ParameterDecl[] } = {},
): ListenerDecl {
  return {
    id: id(),
    kind: 'listener',
    event,
    args: options.args ?? {},
    details: options.details ?? {},
    params: options.params ?? [],
    body,
  };
}

const MAIN = nodeId('mainmt');

const program = (body: readonly Statement[], listeners: readonly ListenerDecl[] = []): Program => ({
  schemaVersion: '1.0.0',
  types: [
    {
      id: nodeId('scenet'),
      kind: 'type',
      name: 'Scene1',
      extends: { kind: 'story', name: 'Scene' },
      fields: [CAT, DOG],
      methods: [
        { id: MAIN, kind: 'method', name: 'myFirstMethod', returns: null, params: [], body },
      ],
      listeners,
    },
  ],
});

const library: StoryLibrary = {
  *say(call, context) {
    const duration = micros(call.details.duration as number);
    context.emit({
      kind: 'say',
      object: objectId(objectName(call.target)),
      duration,
      style: 'beginAndEndGently',
      text: valueText(call.args.text ?? null),
      bubble: 'say',
    });
    yield { kind: 'sleep', duration };
    return null;
  },
  *getDistanceTo(call, context) {
    const answer = (yield {
      kind: 'ask',
      query: {
        kind: 'distance',
        from: objectId(objectName(call.target)),
        to: objectId('dog'),
        at: context.now,
      },
    }) as StageQueryResult;
    return answer.value as number;
  },
  *move(call, context) {
    context.emit({
      kind: 'translate',
      object: objectId(objectName(call.target)),
      duration: 0,
      style: 'beginAndEndAbruptly',
      by: { x: 0, y: 0, z: call.args.amount as number },
      space: 'self',
    });
    yield { kind: 'sleep', duration: 0 };
    return null;
  },
  *turn() {
    yield { kind: 'sleep', duration: 0 };
    return null;
  },
};

/** The worker's side, with fake time, and what it has said. */
function worker(blocks: StoryLibrary = library) {
  const { main, worker: port } = inMemoryPorts();
  const heard: FromRuntime[] = [];
  main.listen((m) => heard.push(m));
  let now = 0;
  let tick: (() => void) | null = null;
  const timers: Timers = {
    now: () => now,
    every: (f) => {
      tick = f;
      return () => (tick = null);
    },
  };
  serve(port, blocks, timers);
  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  return {
    heard,
    send: async (m: ToRuntime) => {
      main.post(m);
      await settle();
    },
    settle,
    /** Moves the shared clock on and lets the worker's timer fire. */
    clock: async (ms: number) => {
      now = ms;
      tick?.();
      await settle();
    },
    ticking: () => tick !== null,
  };
}

/** The production's scenes, as the player hands them to `load`. */
const SCENES = ['s1', 's2'];

const load = (p: Program, disabled: readonly NodeId[] = []): ToRuntime => ({
  type: 'load',
  protocol: RUNTIME_PROTOCOL,
  program: p,
  scene: { backdrop: {}, objects: [], camera: { transform: IDENTITY }, markers: [] },
  entry: MAIN,
  seed: 1,
  disabled,
  scenes: SCENES,
});

const FIXED: RunMode = { kind: 'fixed' };

async function started(p: Program, mode: RunMode = FIXED, disabled: readonly NodeId[] = []) {
  const w = worker();
  await w.settle();
  await w.send(load(p, disabled));
  await w.send({ type: 'start', mode });
  return w;
}

const of_ = <T extends FromRuntime['type']>(heard: readonly FromRuntime[], type: T) =>
  heard.filter((m): m is Extract<FromRuntime, { type: T }> => m.type === type);

const said = (heard: readonly FromRuntime[]) =>
  of_(heard, 'commands').flatMap((m) =>
    m.commands.flatMap((c) =>
      c.kind === 'say' ? [`${c.start / 1_000_000}:${c.object} ${c.text}`] : [],
    ),
  );

const click = (object: string | null, at = 0): ToRuntime => ({
  type: 'event',
  event: { kind: 'click', object: object === null ? null : objectId(object), x: 0.5, y: 0.5, at },
});
const key = (k: string): ToRuntime => ({ type: 'event', event: { kind: 'key', key: k, at: 0 } });

describe('the protocol', () => {
  it('says ready first, then loaded', async () => {
    const w = worker();
    await w.settle();
    expect(w.heard[0]).toEqual({ type: 'ready', protocol: RUNTIME_PROTOCOL });
    await w.send(load(program([])));
    expect(w.heard[1]).toEqual({ type: 'loaded' });
  });

  it('refuses a program that is not valid, or a method that is not there', async () => {
    const w = worker();
    await w.send(load({ schemaVersion: '1.0.0', types: [{ kind: 'nonsense' }] } as never));
    expect(of_(w.heard, 'error')[0]?.error.code).toBe('protocol');
    const x = worker();
    await x.send({ ...load(program([])), entry: nodeId('nosuch') } as ToRuntime);
    expect(of_(x.heard, 'error')[0]?.error.code).toBe('protocol');
  });

  it('refuses start before load', async () => {
    const w = worker();
    await w.send({ type: 'start', mode: FIXED });
    expect(of_(w.heard, 'error')[0]?.error.code).toBe('protocol');
  });
});

describe('fixed-step mode', () => {
  it('runs only as far as asked, and always answers with commands', async () => {
    const w = await started(program([say(of(CAT), text('a')), say(of(CAT), text('b'))]));
    await w.send({ type: 'advance', until: 0 });
    expect(said(w.heard)).toEqual(['0:cat a']);
    await w.send({ type: 'advance', until: micros(0.5) });
    const commands = of_(w.heard, 'commands');
    expect(commands.at(-1)).toMatchObject({ commands: [], until: micros(0.5) });
    await w.send({ type: 'advance', until: micros(1) });
    expect(said(w.heard)).toEqual(['0:cat a', '1:cat b']);
  });

  it('says finished when the entry method ends, once', async () => {
    const w = await started(program([say(of(CAT), text('a'))]));
    await w.send({ type: 'advance', until: micros(1) });
    await w.send({ type: 'advance', until: micros(2) });
    expect(of_(w.heard, 'finished')).toEqual([{ type: 'finished', at: micros(1) }]);
  });

  it('gives the same messages on every run', async () => {
    const p = program([say(of(CAT), text('a')), say(of(DOG), text('b'))]);
    const run = async () => {
      const w = await started(p);
      await w.send({ type: 'advance', until: micros(3) });
      return of_(w.heard, 'commands').map((m) => m.commands);
    };
    expect(await run()).toEqual(await run());
  });
});

describe('asking the stage', () => {
  const distance: Expression = {
    id: nodeId('distan'),
    kind: 'functionCall',
    target: of(CAT),
    callee: { kind: 'story', name: 'getDistanceTo' },
    args: {},
    details: {},
  };

  it('asks, waits, and goes on to the end of the advance', async () => {
    const w = await started(program([say(of(CAT), distance), say(of(CAT), text('b'))]));
    await w.send({ type: 'advance', until: micros(1) });
    const [ask] = of_(w.heard, 'ask');
    expect(ask?.query).toMatchObject({ kind: 'distance', from: 'cat', to: 'dog' });
    expect(said(w.heard)).toEqual([]);
    await w.send({ type: 'answer', id: ask!.id, result: { kind: 'distance', value: 2.5 } });
    expect(said(w.heard)).toEqual(['0:cat 2.5', '1:cat b']);
    expect(of_(w.heard, 'commands').at(-1)?.until).toBe(micros(1));
  });

  it('turns a stage error into a run error at the block', async () => {
    const w = await started(program([say(of(CAT), distance)]));
    await w.send({ type: 'advance', until: micros(1) });
    const [ask] = of_(w.heard, 'ask');
    await w.send({
      type: 'answer',
      id: ask!.id,
      result: { kind: 'error', code: 'unknown_object' },
    });
    expect(of_(w.heard, 'error')[0]?.error).toMatchObject({
      code: 'stage',
      stageCode: 'unknown_object',
    });
  });

  it("gives the Story API's own blocks the stage's whole answer", async () => {
    const w = worker(STORY_LIBRARY);
    await w.settle();
    const turn: Statement = {
      id: id(),
      kind: 'call',
      target: of(CAT),
      callee: { kind: 'story', name: 'turn' },
      args: {
        direction: { id: id(), kind: 'enum', type: 'TurnDirection', value: 'left' },
        amount: { ...distance, args: { other: of(DOG) } },
      },
      details: {},
    };
    await w.send(load(program([turn])));
    await w.send({ type: 'start', mode: FIXED });
    await w.send({ type: 'advance', until: micros(1) });
    const [ask] = of_(w.heard, 'ask');
    const answer: StageQueryResult = { kind: 'distance', value: 2.5 };
    await w.send({ type: 'answer', id: ask!.id, result: answer });
    expect(of_(w.heard, 'error')).toEqual([]);
    const turns = of_(w.heard, 'commands').flatMap((m) =>
      m.commands.flatMap((c) => (c.kind === 'rotate' ? [c.turns] : [])),
    );
    expect(turns).toEqual([2.5]);
  });

  it('ignores an answer to the wrong question', async () => {
    const w = await started(program([say(of(CAT), distance)]));
    await w.send({ type: 'advance', until: micros(1) });
    const [ask] = of_(w.heard, 'ask');
    await w.send({ type: 'answer', id: ask!.id + 1, result: { kind: 'distance', value: 1 } });
    expect(said(w.heard)).toEqual([]);
    await w.send({ type: 'answer', id: ask!.id, result: { kind: 'distance', value: 1 } });
    expect(said(w.heard)).toEqual(['0:cat 1']);
  });
});

describe('errors and stop', () => {
  const loop: Statement = {
    id: nodeId('looplp'),
    kind: 'while',
    condition: { id: id(), kind: 'boolean', value: true },
    body: [],
  };

  it('reports the fault with its block and time, after the commands so far', async () => {
    const w = await started(program([say(of(CAT), text('a')), loop]));
    await w.send({ type: 'advance', until: micros(2) });
    expect(of_(w.heard, 'error')[0]?.error).toMatchObject({
      code: 'infinite_loop',
      node: loop.id,
      at: micros(1),
    });
    expect(said(w.heard)).toEqual(['0:cat a']);
  });

  it('stop ends the run and says so', async () => {
    const w = await started(program([say(of(CAT), text('a'), 100)]));
    await w.send({ type: 'advance', until: 0 });
    await w.send({ type: 'stop' });
    expect(of_(w.heard, 'stopped')).toHaveLength(1);
    await w.send({ type: 'advance', until: micros(200) });
    expect(of_(w.heard, 'finished')).toEqual([]);
  });
});

describe('highlighting', () => {
  it('says when the running blocks change, and not otherwise', async () => {
    const a = say(of(CAT), text('a'), 2);
    const b = say(of(CAT), text('b'), 1);
    const w = await started(program([a, b]));
    await w.send({ type: 'advance', until: 0 });
    await w.send({ type: 'advance', until: micros(1) });
    await w.send({ type: 'advance', until: micros(2) });
    await w.send({ type: 'advance', until: micros(3) });
    expect(of_(w.heard, 'highlight').map((h) => [h.running, h.at])).toEqual([
      [[a.id], 0],
      [[b.id], micros(2)],
      [[], micros(3)],
    ]);
  });

  it('with trace, says when every block started, even one that starts and ends between frames', async () => {
    const a = say(of(CAT), text('a'), 0);
    const b = say(of(CAT), text('b'), 1.5);
    const c = say(of(CAT), text('c'), 1);
    const w = await started(program([a, b, c]), { kind: 'fixed', trace: true });
    await w.send({ type: 'advance', until: micros(1) });
    await w.send({ type: 'advance', until: micros(3) });
    expect(of_(w.heard, 'ran').map((r) => r.blocks)).toEqual([
      [
        { node: a.id, at: 0 },
        { node: b.id, at: 0 },
      ],
      [{ node: c.id, at: micros(1.5) }],
    ]);
    // Each `ran` comes before the commands of the same advance.
    const types = w.heard.map((m) => m.type).filter((m) => m === 'ran' || m === 'commands');
    expect(types.slice(0, 2)).toEqual(['ran', 'commands']);
  });

  it('sends no ran without trace', async () => {
    const w = await started(program([say(of(CAT), text('a'), 1)]));
    await w.send({ type: 'advance', until: micros(2) });
    expect(of_(w.heard, 'ran')).toEqual([]);
  });
});

describe('switching blocks off for a rehearsal', () => {
  it('skips them', async () => {
    const off = say(of(CAT), text('off'));
    const w = await started(program([off, say(of(CAT), text('on'))]), FIXED, [off.id]);
    await w.send({ type: 'advance', until: 0 });
    expect(said(w.heard)).toEqual(['0:cat on']);
  });
});

describe('live mode', () => {
  const live = (t0 = 0, lookahead = micros(0.1), speed = 1): RunMode => ({
    kind: 'live',
    t0,
    lookahead,
    speed,
  });

  it('runs ahead of the clock by the lookahead', async () => {
    const w = await started(program([say(of(CAT), text('a')), say(of(CAT), text('b'))]), live());
    await w.clock(0);
    expect(said(w.heard)).toEqual(['0:cat a']);
    await w.clock(850);
    expect(said(w.heard)).toEqual(['0:cat a']);
    await w.clock(900);
    expect(said(w.heard)).toEqual(['0:cat a', '1:cat b']);
  });

  it('stamps commands with when they were sent', async () => {
    const w = await started(program([say(of(CAT), text('a')), say(of(CAT), text('b'))]), live());
    await w.clock(950);
    expect(of_(w.heard, 'commands').map((m) => m.sentAt)).toEqual([0, 950]);
  });

  it('counts scene time from t0', async () => {
    const w = await started(
      program([say(of(CAT), text('a')), say(of(CAT), text('b'))]),
      live(5000),
    );
    await w.clock(5850);
    expect(said(w.heard)).toEqual(['0:cat a']);
    await w.clock(5900);
    expect(said(w.heard)).toHaveLength(2);
  });

  it('pauses, and resumes from the same scene time', async () => {
    const w = await started(program([say(of(CAT), text('a')), say(of(CAT), text('b'))]), live());
    await w.clock(500);
    await w.send({ type: 'pause' });
    expect(w.ticking()).toBe(false);
    await w.send({ type: 'resume', t0: 10_000 - 500 });
    await w.clock(10_350);
    expect(said(w.heard)).toEqual(['0:cat a']);
    await w.clock(10_400);
    expect(said(w.heard)).toHaveLength(2);
  });

  it('changes speed', async () => {
    const w = await started(program([say(of(CAT), text('a')), say(of(CAT), text('b'))]), live());
    await w.clock(0);
    await w.send({ type: 'speed', speed: 2, t0: 0 });
    await w.clock(450);
    expect(said(w.heard)).toHaveLength(2);
  });

  it('stops ticking on stop', async () => {
    const w = await started(program([say(of(CAT), text('a'), 100)]), live());
    await w.clock(0);
    await w.send({ type: 'stop' });
    expect(w.ticking()).toBe(false);
  });
});

describe('events', () => {
  const run = async (
    listeners: readonly ListenerDecl[],
    events: readonly ToRuntime[],
    until = 3,
  ) => {
    const w = await started(program([], listeners));
    await w.send({ type: 'advance', until: 0 });
    for (const e of events) await w.send(e);
    await w.send({ type: 'advance', until: micros(until) });
    return said(w.heard);
  };
  const object = param('model');

  it('runs sceneStart listeners with the entry method', async () => {
    expect(await run([listener('sceneStart', [say(of(CAT), text('hello'))])], [])).toEqual([
      '0:cat hello',
    ]);
  });

  it('fires clickOnObject with the object, and clickOnScreen for any click', async () => {
    const l = [
      listener('clickOnObject', [say(ref(object), text('me'))], { params: [object] }),
      listener('clickOnScreen', [say(of(DOG), text('screen'))]),
    ];
    expect(await run(l, [click('cat')])).toEqual(['0:dog screen', '0:cat me']);
  });

  it('a click on nothing is only a click on the screen', async () => {
    const l = [
      listener('clickOnObject', [say(of(CAT), text('object'))]),
      listener('clickOnScreen', [say(of(DOG), text('screen'))]),
    ];
    expect(await run(l, [click(null)])).toEqual(['0:dog screen']);
  });

  it('keeps to setOfVisuals', async () => {
    const only = listener('clickOnObject', [say(of(CAT), text('hit'))], {
      details: { setOfVisuals: list(of(CAT)) },
    });
    expect(await run([only], [click('dog')])).toEqual([]);
    expect(await run([only], [click('cat')])).toEqual(['0:cat hit']);
  });

  it('gives keyPress the key', async () => {
    const p = param('key');
    expect(
      await run([listener('keyPress', [say(of(CAT), ref(p))], { params: [p] })], [key('a')]),
    ).toEqual(['0:cat a']);
  });

  it('gives arrowKeyPress its directions, and ignores other keys', async () => {
    const move = param('moveDirection');
    const turn = param('turnDirection');
    const l = listener('arrowKeyPress', [say(of(CAT), ref(move)), say(of(CAT), ref(turn))], {
      params: [move, turn],
    });
    expect(await run([l], [key('up')])).toEqual(['0:cat forward', '1:cat forward']);
    expect(await run([l], [key('a')])).toEqual([]);
  });

  it('gives numberKeyPress the number', async () => {
    const p = param('number');
    const l = listener('numberKeyPress', [say(of(CAT), ref(p))], { params: [p] });
    expect(await run([l], [key('digit7')])).toEqual(['0:cat 7']);
    expect(await run([l], [key('a')])).toEqual([]);
  });

  it('moves an object with the arrow keys', async () => {
    const l = listener('moveWithArrowKeys', [], { args: { object: of(CAT) } });
    const w = await started(program([], [l]));
    await w.send({ type: 'advance', until: 0 });
    await w.send(key('up'));
    await w.send({ type: 'advance', until: micros(1) });
    const translate = of_(w.heard, 'commands').flatMap((m) => m.commands)[0];
    expect(translate).toMatchObject({ kind: 'translate', object: 'cat' });
  });

  it('fires a timer every so many seconds, with what it needs', async () => {
    const l = listener('timer', [say(of(CAT), text('tick'), 0.5)], { args: { seconds: num(1) } });
    expect(await run([l], [], 3)).toEqual(['1:cat tick', '2:cat tick', '3:cat tick']);
  });

  it('refuses a timer of no time', async () => {
    const l = listener('timer', [], { args: { seconds: num(0) } });
    const w = await started(program([], [l]));
    await w.send({ type: 'advance', until: micros(1) });
    expect(of_(w.heard, 'error')[0]?.error.code).toBe('bad_value');
  });

  const collision = (kind: 'collisionStart', a: string, b: string): ToRuntime => ({
    type: 'event',
    event: { kind, a: objectId(a), b: objectId(b), at: 0 } as StageEvent,
  });

  it('matches collisions either way round, and gives a and b in set order', async () => {
    const a = param('a');
    const b = param('b');
    const l = listener('collisionStart', [say(ref(a), text('hit')), say(ref(b), text('hit'))], {
      args: { setA: list(of(CAT)), setB: list(of(DOG)) },
      params: [a, b],
    });
    expect(await run([l], [collision('collisionStart', 'dog', 'cat')])).toEqual([
      '0:cat hit',
      '1:dog hit',
    ]);
    expect(await run([l], [collision('collisionStart', 'cat', 'cat')])).toEqual([]);
  });

  it('matches proximity on the distance too', async () => {
    const l = listener('proximityEnter', [say(of(CAT), text('near'))], {
      args: { setA: list(of(CAT)), setB: list(of(DOG)), distance: num(2) },
    });
    const near = (distance: number): ToRuntime => ({
      type: 'event',
      event: { kind: 'proximityEnter', a: objectId('cat'), b: objectId('dog'), distance, at: 0 },
    });
    expect(await run([l], [near(1)])).toEqual([]);
    expect(await run([l], [near(2)])).toEqual(['0:cat near']);
  });

  describe('multipleEventPolicy', () => {
    const policy = (value: string): Args => ({
      multipleEventPolicy: { id: id(), kind: 'enum', type: 'MultipleEventPolicy', value },
    });
    const twice = [click(null), click(null)];
    const handler = () => [say(of(CAT), text('run'))];

    it('ignores by default while the last run is going', async () => {
      expect(await run([listener('clickOnScreen', handler())], twice)).toEqual(['0:cat run']);
    });

    it('ignores, when asked', async () => {
      const l = listener('clickOnScreen', handler(), { details: policy('ignore') });
      expect(await run([l], twice)).toEqual(['0:cat run']);
    });

    it('enqueues: runs one after the other', async () => {
      const l = listener('clickOnScreen', handler(), { details: policy('enqueue') });
      expect(await run([l], twice)).toEqual(['0:cat run', '1:cat run']);
    });

    it('combines: runs at once', async () => {
      const l = listener('clickOnScreen', handler(), { details: policy('combine') });
      expect(await run([l], twice)).toEqual(['0:cat run', '0:cat run']);
    });

    it('fires again once the last run has ended', async () => {
      const w = await started(program([], [listener('clickOnScreen', handler())]));
      await w.send({ type: 'advance', until: 0 });
      await w.send(click(null));
      await w.send({ type: 'advance', until: micros(1) });
      await w.send(click(null));
      await w.send({ type: 'advance', until: micros(2) });
      expect(said(w.heard)).toEqual(['0:cat run', '1:cat run']);
    });
  });
});

describe('ending a scene (WP8.3)', () => {
  const block = (name: string, args: Args = {}, details: Args = {}): Statement => ({
    id: id(),
    kind: 'call',
    target: self(),
    callee: { kind: 'story', name },
    args,
    details,
  });
  const goTo = (scene: string) => block('goToScene', { scene: text(scene) });
  const ending = (heard: readonly FromRuntime[]) => of_(heard, 'sceneChange');

  async function ran(
    body: readonly Statement[],
    listeners: readonly ListenerDecl[] = [],
    until = 5,
  ) {
    const w = await started(program(body, listeners));
    await w.send({ type: 'advance', until: micros(until) });
    return w;
  }

  it('goToScene sends the commands so far, then the ending, and runs nothing after it', async () => {
    const w = await ran([say(of(CAT), text('a')), goTo('s2'), say(of(CAT), text('never'))]);
    expect(said(w.heard)).toEqual(['0:cat a']);
    expect(ending(w.heard)).toEqual([
      { type: 'sceneChange', at: micros(1), ending: { kind: 'goToScene', scene: 's2' } },
    ]);
    const types = w.heard.map((m) => m.type);
    expect(types.indexOf('sceneChange')).toBeGreaterThan(types.lastIndexOf('commands'));
    expect(types).not.toContain('finished');
    expect(types).not.toContain('stopped');
  });

  it('stops the blocks running alongside it in a do together', async () => {
    const together: Statement = {
      id: id(),
      kind: 'doTogether',
      body: [
        {
          id: id(),
          kind: 'doInOrder',
          body: [say(of(DOG), text('a'), 0.5), say(of(DOG), text('cut off'))],
        },
        { id: id(), kind: 'doInOrder', body: [say(of(CAT), text('b')), goTo('s2')] },
      ],
    };
    const w = await ran([together]);
    expect(said(w.heard)).toEqual(['0:dog a', '0:cat b', '0.5:dog cut off']);
    expect(ending(w.heard)[0]?.at).toBe(micros(1));
    await w.send({ type: 'advance', until: micros(10) });
    expect(said(w.heard)).toHaveLength(3);
  });

  it('crossfade carries its scene and duration, one second by default', async () => {
    const w = await ran([block('crossfade', { scene: text('s1') }, { duration: num(2.5) })]);
    expect(ending(w.heard)[0]?.ending).toEqual({
      kind: 'crossfade',
      scene: 's1',
      duration: micros(2.5),
    });
    const v = await ran([block('crossfade', { scene: text('s1') })]);
    expect(ending(v.heard)[0]?.ending).toEqual({
      kind: 'crossfade',
      scene: 's1',
      duration: micros(1),
    });
  });

  it('fadeToBlack ends the scene too, with its duration', async () => {
    const w = await ran([block('fadeToBlack', {}, { duration: num(0.5) })]);
    expect(ending(w.heard)[0]?.ending).toEqual({ kind: 'fadeToBlack', duration: micros(0.5) });
    const v = await ran([block('fadeToBlack')]);
    expect(ending(v.heard)[0]?.ending).toEqual({ kind: 'fadeToBlack', duration: micros(1) });
  });

  it('can come from a listener: a branching story', async () => {
    const l = listener('clickOnScreen', [goTo('s1')]);
    const w = await started(program([say(of(CAT), text('waiting'), 100)], [l]));
    await w.send({ type: 'advance', until: micros(1) });
    await w.send(click(null, micros(1)));
    await w.send({ type: 'advance', until: micros(2) });
    expect(ending(w.heard)).toEqual([
      { type: 'sceneChange', at: micros(1), ending: { kind: 'goToScene', scene: 's1' } },
    ]);
  });

  it('works in live mode', async () => {
    const live: RunMode = { kind: 'live', t0: 0, lookahead: micros(0.1), speed: 1 };
    const w = await started(program([say(of(CAT), text('a')), goTo('s2')]), live);
    await w.clock(950);
    expect(ending(w.heard)).toHaveLength(1);
    expect(w.ticking()).toBe(false);
  });

  it.each([
    ['a scene the production does not have', [goTo('s9')]],
    ['a scene that is not text', [block('goToScene', { scene: num(2) })]],
    ['a crossfade to nowhere', [block('crossfade', { scene: text('nope') })]],
    ['a negative duration', [block('fadeToBlack', {}, { duration: num(-1) })]],
  ])('refuses %s at that block', async (_, body) => {
    const w = await ran(body);
    expect(ending(w.heard)).toEqual([]);
    expect(of_(w.heard, 'error')[0]?.error).toMatchObject({ code: 'bad_value', node: body[0]!.id });
  });

  describe('loading the next scene into the same worker', () => {
    it('starts afresh at scene time 0, and can finish', async () => {
      const w = await ran([say(of(CAT), text('one')), goTo('s2')]);
      const before = w.heard.length;
      await w.send(load(program([say(of(DOG), text('two'))])));
      await w.send({ type: 'start', mode: FIXED });
      await w.send({ type: 'advance', until: micros(1) });
      const after = w.heard.slice(before);
      expect(after[0]).toEqual({ type: 'loaded' });
      expect(said(after)).toEqual(['0:dog two']);
      expect(of_(after, 'finished')).toEqual([{ type: 'finished', at: micros(1) }]);
    });

    it('works after a stop or a fault, too', async () => {
      const loop: Statement = {
        id: id(),
        kind: 'while',
        condition: { id: id(), kind: 'boolean', value: true },
        body: [],
      };
      for (const first of [[loop], [say(of(CAT), text('long'), 50)]]) {
        const w = await ran(first, [], 1);
        await w.send({ type: 'stop' });
        const before = w.heard.length;
        await w.send(load(program([say(of(DOG), text('next'))])));
        await w.send({ type: 'start', mode: FIXED });
        await w.send({ type: 'advance', until: 0 });
        expect(said(w.heard.slice(before))).toEqual(['0:dog next']);
      }
    });

    it('still runs only one scene when the old one is never stopped', async () => {
      const w = await started(
        program([say(of(CAT), text('old'), 1), say(of(CAT), text('old again'))]),
      );
      await w.send({ type: 'advance', until: 0 });
      await w.send(load(program([say(of(DOG), text('new'))])));
      await w.send({ type: 'start', mode: FIXED });
      await w.send({ type: 'advance', until: micros(2) });
      expect(said(w.heard)).toEqual(['0:cat old', '0:dog new']);
    });
  });

  it('refuses a load without its scenes', async () => {
    const w = worker();
    const old: Record<string, unknown> = { ...load(program([])) };
    delete old.scenes;
    await w.send(old as ToRuntime);
    expect(of_(w.heard, 'error')[0]?.error.code).toBe('protocol');
  });
});

describe('the events #132 added (WP6.2)', () => {
  const run = async (listeners: readonly ListenerDecl[], events: readonly ToRuntime[]) => {
    const w = await started(program([], listeners));
    await w.send({ type: 'advance', until: 0 });
    for (const e of events) await w.send(e);
    await w.send({ type: 'advance', until: micros(5) });
    return w;
  };
  const event = (e: Record<string, unknown>): ToRuntime =>
    ({ type: 'event', event: { at: 0, ...e } }) as ToRuntime;
  const release = (k: string) => event({ kind: 'keyRelease', key: k });

  it('gives a click its place on the picture', async () => {
    const x = param('x');
    const y = param('y');
    const l = listener('clickOnScreen', [say(of(CAT), ref(x)), say(of(CAT), ref(y))], {
      params: [x, y],
    });
    const w = await run([l], [event({ kind: 'click', object: null, x: 0.25, y: 0.75 })]);
    expect(said(w.heard)).toEqual(['0:cat 0.25', '1:cat 0.75']);
  });

  describe('heldKeyPolicy', () => {
    const combine = (): Args => ({
      multipleEventPolicy: {
        id: id(),
        kind: 'enum',
        type: 'MultipleEventPolicy',
        value: 'combine',
      },
    });
    const policy = (value: string): Args => ({
      ...combine(),
      heldKeyPolicy: { id: id(), kind: 'enum', type: 'HeldKeyPolicy', value },
    });
    /** A key held down: the browser repeats it twice, then it's let go. */
    const holding = [key('a'), key('a'), key('a'), release('a')];
    const times = async (details: Args) => {
      const l = listener('keyPress', [say(of(CAT), text('fired'))], { details });
      return said((await run([l], holding)).heard).length;
    };

    it('fires on every press and repeat by default, and for fireMultiple', async () => {
      expect(await times(combine())).toBe(3);
      expect(await times(policy('fireMultiple'))).toBe(3);
    });

    it('fires once for fireOnceOnPress, and again after the key is let go', async () => {
      expect(await times(policy('fireOnceOnPress'))).toBe(1);
      const l = listener('keyPress', [say(of(CAT), text('fired'))], {
        details: policy('fireOnceOnPress'),
      });
      const w = await run([l], [...holding, ...holding]);
      expect(said(w.heard)).toHaveLength(2);
    });

    it('fires once, on release, for fireOnceOnRelease', async () => {
      expect(await times(policy('fireOnceOnRelease'))).toBe(1);
      const l = listener('keyPress', [say(of(CAT), text('fired'))], {
        details: policy('fireOnceOnRelease'),
      });
      const w = await run([l], [key('a'), key('a')]);
      expect(said(w.heard)).toEqual([]);
    });

    it('keeps each key apart', async () => {
      const k = param('key');
      const l = listener('keyPress', [say(of(CAT), ref(k), 0.1)], {
        details: policy('fireOnceOnPress'),
        params: [k],
      });
      const w = await run([l], [key('a'), key('b'), key('a'), release('a'), key('a')]);
      expect(said(w.heard).map((s) => s.split(' ')[1])).toEqual(['a', 'b', 'a']);
    });

    it('applies to arrow and number keys too', async () => {
      const arrow = listener('arrowKeyPress', [say(of(CAT), text('arrow'))], {
        details: policy('fireOnceOnPress'),
      });
      const number = listener('numberKeyPress', [say(of(DOG), text('number'))], {
        details: policy('fireOnceOnRelease'),
      });
      const w = await run(
        [arrow, number],
        [key('up'), key('up'), key('digit3'), key('digit3'), release('digit3')],
      );
      expect(said(w.heard)).toEqual(['0:cat arrow', '0:dog number']);
    });
  });

  it('fires collisionEnd with the pair in set order', async () => {
    const a = param('a');
    const l = listener('collisionEnd', [say(ref(a), text('apart'))], {
      args: { setA: list(of(CAT)), setB: list(of(DOG)) },
      params: [a],
    });
    const w = await run([l], [event({ kind: 'collisionEnd', a: 'dog', b: 'cat' })]);
    expect(said(w.heard)).toEqual(['0:cat apart']);
  });

  it('fires proximityExit for its own distance only', async () => {
    const l = listener('proximityExit', [say(of(CAT), text('far'))], {
      args: { setA: list(of(CAT)), setB: list(of(DOG)), distance: num(3) },
    });
    const away = (distance: number) =>
      event({ kind: 'proximityExit', a: 'cat', b: 'dog', distance });
    expect(said((await run([l], [away(2)])).heard)).toEqual([]);
    expect(said((await run([l], [away(3)])).heard)).toEqual(['0:cat far']);
  });

  it('fires viewEnter and viewExit for objects in their set, giving the model', async () => {
    const model = param('model');
    const enter = listener('viewEnter', [say(ref(model), text('in shot'))], {
      args: { set: list(of(CAT)) },
      params: [model],
    });
    const exit = listener('viewExit', [say(of(DOG), text('gone'))], {
      args: { set: list(of(CAT)) },
    });
    const w = await run(
      [enter, exit],
      [
        event({ kind: 'viewEnter', object: 'dog' }),
        event({ kind: 'viewEnter', object: 'cat' }),
        event({ kind: 'viewExit', object: 'cat' }),
      ],
    );
    expect(said(w.heard)).toEqual(['0:cat in shot', '0:dog gone']);
  });

  describe('the watch message', () => {
    const watches = (heard: readonly FromRuntime[]) => of_(heard, 'watch');

    it('tells the stage what the proximity and view listeners need, before any commands', async () => {
      const ls = [
        listener('proximityEnter', [], {
          args: { setA: list(of(CAT)), setB: list(of(DOG), of(CAT)), distance: num(2) },
        }),
        listener('proximityExit', [], {
          args: { setA: list(of(DOG)), setB: list(of(CAT)), distance: num(0) },
        }),
        listener('viewExit', [], { args: { set: list(of(DOG)) } }),
        listener('collisionStart', [], { args: { setA: list(of(CAT)), setB: list(of(DOG)) } }),
        listener('sceneStart', [say(of(CAT), text('hi'))]),
      ];
      const w = await run(ls, []);
      expect(watches(w.heard)).toEqual([
        {
          type: 'watch',
          watches: [
            { kind: 'proximity', a: ['cat'], b: ['dog', 'cat'], distance: 2 },
            { kind: 'proximity', a: ['dog'], b: ['cat'], distance: 0 },
            { kind: 'view', objects: ['dog'] },
          ],
        },
      ]);
      const types = w.heard.map((m) => m.type);
      expect(types.indexOf('watch')).toBeLessThan(types.indexOf('commands'));
    });

    it('is sent, empty, for a scene that watches nothing', async () => {
      const w = await run([], []);
      expect(watches(w.heard)).toEqual([{ type: 'watch', watches: [] }]);
    });

    it.each([
      ['a negative distance', { setA: list(of(CAT)), setB: list(of(DOG)), distance: num(-1) }],
      ['a set that is not a list', { setA: of(CAT), setB: list(of(DOG)), distance: num(1) }],
      ['a set holding a number', { setA: list(num(1)), setB: list(of(DOG)), distance: num(1) }],
    ])('refuses %s at the listener', async (_, args) => {
      const l = listener('proximityEnter', [], { args });
      const w = await run([l], []);
      expect(watches(w.heard)).toEqual([]);
      expect(of_(w.heard, 'error')[0]?.error).toMatchObject({ code: 'bad_value', node: l.id });
    });
  });
});
