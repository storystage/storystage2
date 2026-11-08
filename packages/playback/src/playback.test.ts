import {
  nodeId,
  type Expression,
  type ListenerDecl,
  type NodeId,
  type Statement,
} from '@storystage/ast';
import { exampleProduction, sceneId, type Production } from '@storystage/production';
import {
  inMemoryPorts,
  serve,
  type FromRuntime,
  type Port,
  type Timers,
  type ToRuntime,
} from '@storystage/runtime';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY, micros, objectId, type StageCommand } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { LiveClock } from './clock.ts';
import { fastForward } from './fast-forward.ts';
import { Playback, type PlaybackEvent } from './playback.ts';
import { errorWords } from './words.ts';

// ---- A production to play --------------------------------------------------------------------

let counter = 0;
const id = (): NodeId => nodeId(`p${(counter++).toString(36).padStart(5, '0')}`);
const self = (): Expression => ({ id: id(), kind: 'this' });
/** Scene 1's objects, from the example production. */
const PENGUIN = nodeId('scene1p');
const FOX = nodeId('scene1f');
const the = (field: NodeId): Expression => ({ id: id(), kind: 'fieldRef', target: self(), field });
const text = (value: string): Expression => ({ id: id(), kind: 'text', value });
const say = (words: string | Expression): Statement => ({
  id: id(),
  kind: 'call',
  target: the(PENGUIN),
  callee: { kind: 'story', name: 'say' },
  args: { text: typeof words === 'string' ? text(words) : words },
  details: {},
});

/** The example production, with scene 1's code and listeners replaced. */
function withSceneOne(
  body: readonly Statement[],
  listeners: readonly ListenerDecl[] = [],
): Production {
  const p = exampleProduction();
  const [first, ...rest] = p.program.types;
  const method = { ...first!.methods[0]!, body };
  return {
    ...p,
    program: { ...p.program, types: [{ ...first!, methods: [method], listeners }, ...rest] },
  };
}

const listener = (event: string, body: readonly Statement[], args = {}): ListenerDecl => ({
  id: id(),
  kind: 'listener',
  event,
  args,
  details: {},
  params: [],
  body,
});

// ---- Playing it ------------------------------------------------------------------------------

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

/** A runtime worker over in-memory ports. `tap` sees what the driver sends it. */
function runtime(tap: (m: ToRuntime) => void = () => undefined) {
  const { main, worker } = inMemoryPorts();
  const timers: Timers = { now: () => 0, every: () => () => undefined };
  serve(worker, STORY_LIBRARY, timers);
  const port: Port<ToRuntime, FromRuntime> = {
    post: (m) => {
      tap(m);
      main.post(m);
    },
    listen: (l) => main.listen(l),
  };
  return port;
}

/**
 * The fixed-step loop the export runs: frames at 30 a second until play ends or `seconds` pass.
 * `at` runs something before a given frame.
 */
async function play(
  production: Production,
  options: {
    mode?: 'production' | 'rehearse';
    from?: string;
    seconds?: number;
    disabled?: readonly NodeId[];
    port?: Port<ToRuntime, FromRuntime>;
    at?: (t: number, playback: Playback, stage: FakeStage) => void | Promise<void>;
  } = {},
) {
  await settle();
  const stage = new FakeStage();
  const playback = new Playback({
    production,
    stage,
    port: options.port ?? runtime(),
    mode: options.mode ?? 'production',
    seed: 1,
    ...(options.from === undefined ? {} : { from: sceneId(options.from) }),
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
  });
  const events: PlaybackEvent[] = [];
  playback.on((e) => events.push(e));
  await playback.start();
  for (let frame = 1; frame <= (options.seconds ?? 20) * 30 && !playback.ended(); frame++) {
    const t = micros(frame / 30);
    await options.at?.(t, playback, stage);
    await playback.frame(t);
  }
  return { events, stage, playback };
}

const scenes = (events: readonly PlaybackEvent[]) =>
  events.flatMap((e) =>
    e.kind === 'scene' ? [`${e.scene} ${e.transition?.kind ?? 'start'}`] : [],
  );
const said = (stage: FakeStage) =>
  stage.calls
    .filter((c) => c.method === 'schedule')
    .flatMap((c) => c.args[0] as StageCommand[])
    .flatMap((c) => (c.kind === 'say' ? [c.text] : []));
const ended = (events: readonly PlaybackEvent[]) => events.filter((e) => e.kind === 'ended');

describe('playing a production', () => {
  it('plays the running order through with its transitions, and ends', async () => {
    const { events, stage } = await play(exampleProduction());
    expect(scenes(events)).toEqual(['s1 start', 's2 cut', 's3 fadeToBlack']);
    expect(said(stage)).toEqual([
      'Oh no, the ice is moving!',
      "Don't be scared. I'm lost too.",
      'Home! Thank you, Fox.',
    ]);
    expect(ended(events)).toEqual([{ kind: 'ended', stopped: false }]);
  });

  it('loads each scene onto the stage, with the fade the player asks for', async () => {
    const { stage } = await play(exampleProduction());
    expect(stage.calls.filter((c) => c.method === 'load')).toHaveLength(3);
    const fades = stage.calls
      .filter((c) => c.method === 'schedule')
      .flatMap((c) => c.args[0] as StageCommand[])
      .filter((c) => c.kind === 'fade');
    expect(fades.map((f) => (f.kind === 'fade' ? f.to : null))).toEqual([1, 1, 0]);
  });

  it('gives scene start times on the film’s clock', async () => {
    const { events } = await play(exampleProduction());
    const starts = events.flatMap((e) => (e.kind === 'scene' ? [e.at] : []));
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeGreaterThanOrEqual(micros(1));
    expect(starts[2]).toBeGreaterThan(starts[1]!);
  });

  it('plays the same way every time', async () => {
    const once = async () => {
      const { events } = await play(exampleProduction());
      return events.filter((e) => e.kind !== 'running');
    };
    expect(await once()).toEqual(await once());
  });

  it("asks the stage to draw a crossfade, over the new scene's time", async () => {
    const p = exampleProduction();
    const order = p.manifest.runningOrder.map((e, i) =>
      i === 1 ? { ...e, transition: { kind: 'crossfade' as const, duration: micros(0.5) } } : e,
    );
    const { events, stage } = await play({
      ...p,
      manifest: { ...p.manifest, runningOrder: order },
    });
    expect(scenes(events)).toEqual(['s1 start', 's2 cut', 's3 crossfade']);
    const loads = stage.calls.filter((c) => c.method === 'load');
    expect(loads.map((c) => c.args[1])).toEqual([undefined, undefined, { crossfade: micros(0.5) }]);
    expect(events.filter((e) => e.kind === 'crossfade')).toEqual([
      { kind: 'crossfade', from: 's2', to: 's3', duration: micros(0.5) },
    ]);
  });

  it('hands the stage the next scene to get ready, in a production only', async () => {
    const preloads = (stage: FakeStage) =>
      stage.calls
        .filter((c) => c.method === 'preload')
        .map((c) => (c.args[0] as { readonly objects: readonly unknown[] }).objects.length);
    const p = exampleProduction();
    const { stage } = await play(p);
    // After loading s1, s2 is likely; after s2, s3; after s3, nothing.
    expect(preloads(stage)).toHaveLength(2);
    const order = stage.calls.map((c) => c.method).filter((m) => m === 'load' || m === 'preload');
    expect(order).toEqual(['load', 'preload', 'load', 'preload', 'load']);
    const { stage: rehearsal } = await play(p, { mode: 'rehearse' });
    expect(preloads(rehearsal)).toEqual([]);
  });

  it('starts from a given scene', async () => {
    const { events } = await play(exampleProduction(), { from: 's2' });
    expect(scenes(events)).toEqual(['s2 start', 's3 fadeToBlack']);
  });
});

describe('Rehearse', () => {
  it('plays one scene, and ends when the scene does', async () => {
    const { events } = await play(exampleProduction(), { mode: 'rehearse', from: 's2' });
    expect(scenes(events)).toEqual(['s2 start']);
    expect(events.filter((e) => e.kind === 'next')).toEqual([]);
    expect(ended(events)).toEqual([{ kind: 'ended', stopped: false }]);
  });

  it('says what comes next, instead of going on, at a block that goes to another scene', async () => {
    const goTo: Statement = {
      id: id(),
      kind: 'call',
      target: self(),
      callee: { kind: 'story', name: 'goToScene' },
      args: { scene: text('s3') },
      details: {},
    };
    const { events } = await play(withSceneOne([say('off we go'), goTo]), { mode: 'rehearse' });
    expect(scenes(events)).toEqual(['s1 start']);
    expect(events.filter((e) => e.kind === 'next')).toEqual([
      { kind: 'next', scene: 's3', heading: 'Ice shelf, evening' },
    ]);
    expect(ended(events)).toEqual([{ kind: 'ended', stopped: false }]);
  });

  it('skips blocks switched off for the run', async () => {
    const off = say('switched off');
    const { stage } = await play(withSceneOne([off, say('on')]), {
      mode: 'rehearse',
      disabled: [off.id],
    });
    expect(said(stage)).toEqual(['on']);
  });

  it('reports the running blocks as they change', async () => {
    const first = say('one');
    const second = say('two');
    const { events } = await play(withSceneOne([first, second]), { mode: 'rehearse' });
    const running = events.flatMap((e) => (e.kind === 'running' ? [e.nodes] : []));
    expect(running).toContainEqual([first.id]);
    expect(running).toContainEqual([second.id]);
  });

  it('stops from outside, and puts the set-up back', async () => {
    const posted: ToRuntime[] = [];
    const port = runtime((m) => posted.push(m));
    const { events, stage } = await play(withSceneOne([say('one'), say('two'), say('three')]), {
      mode: 'rehearse',
      port,
      at: async (t, playback) => {
        if (t === micros(0.5)) await playback.stop();
      },
    });
    expect(ended(events)).toEqual([{ kind: 'ended', stopped: true }]);
    expect(posted.at(-1)).toEqual({ type: 'stop' });
    const loads = stage.calls.filter((c) => c.method === 'load');
    expect(loads.at(-1)!.args[0]).toEqual(exampleProduction().scenes[0]!.setup);
    expect(said(stage)).toEqual(['one']);
  });
});

describe('the runtime’s messages', () => {
  it('answers the runtime’s questions from the stage', async () => {
    const distance: Expression = {
      id: id(),
      kind: 'functionCall',
      target: the(PENGUIN),
      callee: { kind: 'story', name: 'getDistanceTo' },
      args: { other: the(FOX) },
      details: {},
    };
    const local: Statement = {
      id: id(),
      kind: 'local',
      name: 'far',
      type: { kind: 'story', name: 'Number' },
      value: distance,
    };
    const { stage, events } = await play(withSceneOne([local, say('measured')]), {
      mode: 'rehearse',
    });
    expect(stage.calls.some((c) => c.method === 'answer')).toBe(true);
    expect(events.filter((e) => e.kind === 'error')).toEqual([]);
    expect(said(stage)).toEqual(['measured']);
  });

  it('hands the stage what to watch', async () => {
    const near = listener('proximityEnter', [say('close')], {
      setA: {
        id: id(),
        kind: 'arrayOf',
        of: { kind: 'story', name: 'Thing' },
        items: [the(PENGUIN)],
      },
      setB: { id: id(), kind: 'arrayOf', of: { kind: 'story', name: 'Thing' }, items: [the(FOX)] },
      distance: { id: id(), kind: 'number', value: 1 },
    });
    const { stage } = await play(withSceneOne([say('hello')], [near]), { mode: 'rehearse' });
    const watches = stage.calls.filter((c) => c.method === 'watch');
    expect(watches.at(-1)!.args[0]).toEqual([
      { kind: 'proximity', a: ['penguin'], b: ['fox'], distance: 1 },
    ]);
  });

  it('sends the stage’s events to the runtime', async () => {
    const click = listener('clickOnScreen', [say('ouch')]);
    const { stage } = await play(withSceneOne([say('waiting')], [click]), {
      mode: 'rehearse',
      seconds: 4,
      at: (t, _, stage) => {
        if (t === micros(2)) stage.emit({ kind: 'click', object: null, x: 0.5, y: 0.5, at: t });
      },
    });
    expect(said(stage)).toEqual(['waiting', 'ouch']);
  });

  it('reports an error with its block, and ends', async () => {
    const bad = say({ id: id(), kind: 'number', value: 3 });
    const { events } = await play(withSceneOne([bad]), { mode: 'rehearse' });
    const error = events.find((e) => e.kind === 'error');
    expect(error).toMatchObject({
      kind: 'error',
      scene: 's1',
      error: { code: 'bad_value', node: bad.id },
      words: "This block got something it can't use. Check what you've put in its spaces.",
    });
    expect(ended(events)).toEqual([{ kind: 'ended', stopped: false }]);
  });

  it('drops what the old scene had in flight until the new scene has loaded', async () => {
    const { main, worker } = inMemoryPorts();
    const timers: Timers = { now: () => 0, every: () => () => undefined };
    serve(worker, STORY_LIBRARY, timers);
    const listeners = new Set<(m: FromRuntime) => void>();
    main.listen((m) => listeners.forEach((l) => l(m)));
    let loads = 0;
    const ghost: StageCommand = {
      seq: 0,
      object: objectId('ghost'),
      start: 0,
      duration: 0,
      style: 'beginAndEndAbruptly',
      kind: 'say',
      text: 'boo',
      bubble: 'say',
    };
    const port: Port<ToRuntime, FromRuntime> = {
      post: (m) => {
        // Before the second scene's load reaches the worker, a message from the first arrives.
        if (m.type === 'load' && ++loads === 2)
          listeners.forEach((l) => l({ type: 'commands', commands: [ghost], until: 0, sentAt: 0 }));
        main.post(m);
      },
      listen: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    };
    const { stage, events } = await play(exampleProduction(), { port });
    expect(scenes(events)).toEqual(['s1 start', 's2 cut', 's3 fadeToBlack']);
    expect(said(stage)).not.toContain('boo');
  });
});

describe('fastForward', () => {
  async function started(production: Production) {
    await settle();
    const stage = new FakeStage();
    const playback = new Playback({
      production,
      stage,
      port: runtime(),
      mode: 'rehearse',
      seed: 1,
    });
    await playback.start();
    return { playback, stage };
  }

  it('runs to a block and stops when it is running', async () => {
    const target = say('three');
    const { playback } = await started(withSceneOne([say('one'), say('two'), target]));
    const result = await fastForward(playback, 0, { node: target.id });
    expect(result.reached).toBe(true);
    expect(result.at).toBeGreaterThanOrEqual(micros(2));
    expect(result.at).toBeLessThan(micros(2.2));
  });

  it('says so when the block never runs', async () => {
    const never = say('never');
    const { playback } = await started(withSceneOne([say('one')]));
    const result = await fastForward(playback, 0, { node: never.id }, { limit: micros(3) });
    expect(result.reached).toBe(false);
  });

  it('runs to a time', async () => {
    const { playback, stage } = await started(withSceneOne([say('one'), say('two'), say('three')]));
    const result = await fastForward(playback, 0, micros(1.5));
    expect(result).toEqual({ at: micros(1.5), reached: true });
    expect(stage.time()).toBe(micros(1.5));
  });
});

describe('LiveClock', () => {
  it('counts from play, holds on pause, and keeps its place through a change of speed', () => {
    let wall = 1000;
    const clock = new LiveClock(() => wall);
    expect(clock.time()).toBe(0);
    clock.play();
    wall += 500;
    expect(clock.time()).toBe(micros(0.5));
    clock.pause();
    wall += 5000;
    expect(clock.time()).toBe(micros(0.5));
    clock.play();
    clock.setSpeed(2);
    wall += 500;
    expect(clock.time()).toBe(micros(1.5));
    clock.setSpeed(0.5);
    wall += 1000;
    expect(clock.time()).toBe(micros(2));
    clock.setTime(micros(10));
    expect(clock.time()).toBe(micros(10));
  });

  it('refuses a speed of nothing', () => {
    expect(() => new LiveClock(() => 0).setSpeed(0)).toThrow();
  });
});

describe('dispose', () => {
  it('stops listening and ends the worker', async () => {
    await settle();
    const stage = new FakeStage();
    let ended = 0;
    const playback = new Playback({
      production: exampleProduction(),
      stage,
      port: runtime(),
      mode: 'rehearse',
      seed: 1,
      terminate: () => ended++,
    });
    const events: PlaybackEvent[] = [];
    playback.on((e) => events.push(e));
    await playback.start();
    playback.dispose();
    stage.emit({ kind: 'click', object: null, x: 0, y: 0, at: 0 });
    await playback.frame(micros(1));
    expect(ended).toBe(1);
    expect(playback.ended()).toBe(true);
    expect(events.map((e) => e.kind)).toEqual(['scene']);
  });
});

describe('errorWords', () => {
  it('has plain words for every code, with no technical words', () => {
    const codes = [
      'infinite_loop',
      'recursion_limit',
      'time_slice',
      'bad_value',
      'protocol',
      'internal',
    ] as const;
    const stageCodes = [
      'unknown_object',
      'unknown_joint',
      'unknown_model',
      'bad_argument',
    ] as const;
    const all = [
      ...codes.map((code) => errorWords({ code, node: null, at: 0 })),
      ...stageCodes.map((stageCode) => errorWords({ code: 'stage', node: null, at: 0, stageCode })),
      errorWords({ code: 'stage', node: null, at: 0 }),
    ];
    for (const words of all) {
      expect(words).toMatch(/\.$/);
      expect(words).not.toMatch(/\b(ast|node|field|invocation|edit|token|schema|api|sorry)\b/i);
    }
  });
});
