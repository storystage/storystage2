import { nodeId, type Expression, type Statement } from '@storystage/ast';
import { exampleProduction, type Production } from '@storystage/production';
import {
  inMemoryPorts,
  serve,
  type FromRuntime,
  type Port,
  type Timers,
  type ToRuntime,
} from '@storystage/runtime';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY, micros, StageError } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { ScreeningPlayer } from './screening-player.ts';

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

/** Workers over in-memory ports, counting the ones ended. */
function workers() {
  let started = 0;
  let ended = 0;
  const start = () => {
    started++;
    const { main, worker } = inMemoryPorts();
    const timers: Timers = { now: () => 0, every: () => () => undefined };
    serve(worker, STORY_LIBRARY, timers);
    const port: Port<ToRuntime, FromRuntime> = main;
    return { port, terminate: () => ended++ };
  };
  return { start, started: () => started, ended: () => ended };
}

/** A FakeStage that counts its disposal. */
class CountedStage extends FakeStage {
  disposed = 0;
  override dispose(): void {
    this.disposed++;
    super.dispose();
  }
}

function setup(production: Production = exampleProduction()) {
  let wall = 0;
  const shown = new CountedStage();
  const hidden: CountedStage[] = [];
  const w = workers();
  const player = new ScreeningPlayer({
    production,
    stage: shown,
    measureStage: () => {
      const s = new CountedStage();
      hidden.push(s);
      return s;
    },
    startWorker: w.start,
    seed: 1,
    wall: () => wall,
  });
  return {
    player,
    shown,
    hidden,
    workers: w,
    /** Moves the wall clock on and draws a frame. */
    async after(ms: number) {
      wall += ms;
      await player.tick();
    },
  };
}

describe('ScreeningPlayer', () => {
  it('measures the film on a hidden stage, and lets that stage and its worker go', async () => {
    await settle();
    const { player, hidden, workers: w } = setup();
    const timeline = await player.prepare();
    expect(timeline?.scenes.map((s) => s.scene)).toEqual(['s1', 's2', 's3']);
    expect(player.state.timeline).toBe(timeline);
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.disposed).toBe(1);
    expect(w.ended()).toBe(w.started());
  });

  it('stops measuring when the learner leaves, and lets the stage go', async () => {
    await settle();
    const { player, hidden } = setup();
    const controller = new AbortController();
    const preparing = player.prepare(controller.signal);
    controller.abort();
    expect(await preparing).toBeNull();
    expect(hidden[0]!.disposed).toBe(1);
    expect(player.state.timeline).toBeNull();
  });

  it('plays on the shown stage with the clock, from the start', async () => {
    await settle();
    const { player, shown, after } = setup();
    await player.prepare();
    await player.play();
    expect(player.state.playing).toBe(true);
    await after(500);
    expect(player.state.time).toBe(micros(0.5));
    expect(shown.calls.filter((c) => c.method === 'load').length).toBeGreaterThan(0);
  });

  it('shows the captions of the moment', async () => {
    await settle();
    const { player, after } = setup();
    await player.prepare();
    await player.play();
    await after(200);
    expect(player.state.captions).toEqual(['PIP: Oh no, the ice is moving!']);
  });

  it('holds still on Pause, and goes on from there', async () => {
    await settle();
    const { player, after } = setup();
    await player.prepare();
    await player.play();
    await after(300);
    player.pause();
    await after(1000);
    expect(player.state.time).toBe(micros(0.3));
    expect(player.state.playing).toBe(false);
    await player.play();
    await after(100);
    expect(player.state.time).toBe(micros(0.4));
  });

  it('plays from a moment in a later scene, loading that scene', async () => {
    await settle();
    const { player, shown } = setup();
    const timeline = (await player.prepare())!;
    const s2 = timeline.scenes[1]!;
    await player.seek(s2.start + micros(0.2));
    expect(player.state.time).toBe(s2.start + micros(0.2));
    const loads = shown.calls.filter((c) => c.method === 'load');
    expect(loads.length).toBeGreaterThan(0);
  });

  it('stops at the end of the film', async () => {
    await settle();
    const { player, after } = setup();
    const timeline = (await player.prepare())!;
    await player.play();
    for (let i = 0; i < 200 && player.state.playing; i++) await after(100);
    expect(player.state.playing).toBe(false);
    expect(player.state.time).toBe(timeline.length);
  });

  it("says at once when the film can't be played, from measuring", async () => {
    await settle();
    const w = workers();
    const player = new ScreeningPlayer({
      production: exampleProduction(),
      stage: new CountedStage(),
      // A hidden stage that can't make sense of the set-up. (A model it can't find no longer
      // stops a scene: it plays on as a stand-in, spec 03 section 1.3.)
      measureStage: () =>
        new (class extends CountedStage {
          override async load(): Promise<void> {
            throw new StageError('bad_argument', 'There is no paint called rainbow.');
          }
        })(),
      startWorker: w.start,
      seed: 1,
      wall: () => 0,
    });
    await player.prepare();
    expect(player.state.error).toEqual({
      words: "The stage can't do what this block asks. Check what you've put in its spaces.",
      node: null,
    });
  });

  it('stops at an error, in plain words, at its block', async () => {
    await settle();
    const p = exampleProduction();
    const [first, ...rest] = p.program.types;
    const bad: Statement = {
      id: nodeId('badbad'),
      kind: 'call',
      target: {
        id: nodeId('badtgt'),
        kind: 'fieldRef',
        target: { id: nodeId('badslf'), kind: 'this' },
        field: nodeId('scene1p'),
      } satisfies Expression,
      callee: { kind: 'story', name: 'say' },
      args: { text: { id: nodeId('badnum'), kind: 'number', value: 3 } },
      details: {},
    };
    const broken: Production = {
      ...p,
      program: {
        ...p.program,
        types: [{ ...first!, methods: [{ ...first!.methods[0]!, body: [bad] }] }, ...rest],
      },
    };
    const { player, after } = setup(broken);
    await player.prepare();
    await player.play();
    for (let i = 0; i < 10 && player.state.playing; i++) await after(100);
    expect(player.state.playing).toBe(false);
    expect(player.state.error).toMatchObject({ node: bad.id });
    expect(player.state.error?.words).toMatch(/can't use/);
  });

  it('tells its listeners when anything changes', async () => {
    await settle();
    const { player, after } = setup();
    let heard = 0;
    const stop = player.subscribe(() => heard++);
    await player.prepare();
    await player.play();
    await after(100);
    const before = heard;
    stop();
    await after(100);
    expect(before).toBeGreaterThan(0);
    expect(heard).toBe(before);
  });

  it('ends every worker it started when disposed', async () => {
    await settle();
    const { player, workers: w, shown } = setup();
    await player.prepare();
    await player.play();
    player.dispose();
    expect(w.ended()).toBe(w.started());
    // The shown stage is the host's to dispose.
    expect(shown.disposed).toBe(0);
  });
});
