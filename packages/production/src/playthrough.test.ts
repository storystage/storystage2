/**
 * WP8's done-when: "a three-scene production ... plays through with each transition type". The
 * player (`player.ts`) drives the real runtime (`serve`, S2) in fixed-step mode, with the stage's
 * fake (S3) drawing, as the one-scene driver and the export will.
 */
import { describe, expect, it } from 'vitest';
import { nodeId, type ListenerDecl, type Program, type Statement } from '@storystage/ast';
import {
  RUNTIME_PROTOCOL,
  inMemoryPorts,
  serve,
  type FromRuntime,
  type StoryLibrary,
  type Timers,
  type ToRuntime,
} from '@storystage/runtime';
import { FakeStage } from '@storystage/stage/testing';
import { micros, objectId, type StageCommand } from '@storystage/story-api';
import { exampleProduction } from './example.ts';
import { ProductionPlayer, type PlayerAction } from './player.ts';
import { duplicateScene } from './scenes.ts';
import { checkReferences, sceneId, type Production } from './types.ts';

/** `say` shows its text for a second, as the Story API's does by default. */
const library: StoryLibrary = {
  *say(call, context) {
    const duration = micros(1);
    context.emit({
      kind: 'say',
      object: objectId('penguin'),
      duration,
      style: 'beginAndEndGently',
      text: String(call.args.text ?? ''),
      bubble: 'say',
    });
    yield { kind: 'sleep', duration };
    return null;
  },
};

const call = (id: string, name: string, args: Record<string, unknown> = {}): Statement =>
  ({
    id: nodeId(id),
    kind: 'call',
    target: { id: nodeId(`${id}t`), kind: 'this' },
    callee: { kind: 'story', name },
    args,
    details: {},
  }) as unknown as Statement;

/**
 * Four scenes, each ending a different way:
 * s1 says a line, then `goToScene("s2")` (the running order's cut);
 * s2 ends on its own (its fade to black into s3);
 * s3 ends on its own (its crossfade into s4);
 * s4 waits for a click, whose listener runs `fadeToBlack()`: the film ends in black.
 */
function film(): Production {
  const base = exampleProduction();
  let seed = 1;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dup = duplicateScene(
    base,
    sceneId('s3'),
    { heading: 'Home, night', label: 'Duplicate' },
    random,
  );
  if (!dup.ok) throw new Error('not duplicated');
  const p = dup.step.production;
  const click: ListenerDecl = {
    id: nodeId('clickfour'),
    kind: 'listener',
    event: 'clickOnScreen',
    args: {},
    details: {},
    params: [],
    body: [call('fadefour', 'fadeToBlack')],
  };
  const types = p.program.types.map((t, i) => {
    if (i === 0) {
      const m = t.methods[0]!;
      const goTo = call('gotoone', 'goToScene', {
        scene: { id: nodeId('gotoonearg'), kind: 'text', value: 's2' },
      });
      return { ...t, methods: [{ ...m, body: [...m.body, goTo] }] };
    }
    if (i === 3) return { ...t, listeners: [click] };
    return t;
  });
  return { ...p, program: { ...p.program, types } as Program };
}

/** The one-scene driver, cut down: fixed steps of 100 ms, the runtime and the fake stage. */
async function play(p: Production, clickAfter = micros(3)) {
  const { main, worker } = inMemoryPorts();
  const heard: FromRuntime[] = [];
  main.listen((m) => heard.push(m));
  const timers: Timers = { now: () => 0, every: () => () => {} };
  serve(worker, library, timers);
  const settle = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  };
  const send = async (m: ToRuntime) => {
    main.post(m);
    await settle();
  };

  const stage = new FakeStage();
  const player = new ProductionPlayer(p, { mode: 'production', seed: 7 });
  const log: string[] = [];
  const fades: StageCommand[] = [];
  let t = 0;
  let scene = '';
  let clicked = false;
  let over = false;

  const perform = async (actions: PlayerAction[]) => {
    for (const a of actions) {
      switch (a.kind) {
        case 'load':
          await stage.load(a.setup);
          stage.schedule(a.commands);
          fades.push(...a.commands);
          await send({
            type: 'load',
            protocol: RUNTIME_PROTOCOL,
            program: p.program,
            scene: a.setup,
            entry: a.entry,
            seed: a.seed,
            disabled: [],
            scenes: a.scenes,
          });
          await send({ type: 'start', mode: { kind: 'fixed' } });
          log.push(`load ${a.scene}${a.transition ? ` after ${a.transition.kind}` : ''}`);
          scene = a.scene;
          t = 0;
          clicked = false;
          break;
        case 'stageCommands':
          stage.schedule(a.commands);
          fades.push(...a.commands);
          break;
        case 'crossfade':
          log.push(`crossfade ${a.from} to ${a.to}`);
          break;
        case 'stop':
          await send({ type: 'stop' });
          break;
        case 'next':
        case 'fault':
          log.push(`${a.kind} ${'message' in a ? a.message : a.scene}`);
          break;
        case 'end':
          log.push('end');
          over = true;
          break;
      }
    }
  };

  await perform(player.start());
  for (let step = 0; step < 500 && !over; step++) {
    t += micros(0.1);
    await send({ type: 'advance', until: t });
    for (const m of heard.splice(0)) {
      if (m.type === 'commands') stage.schedule(m.commands);
      if (m.type === 'error') throw new Error(`runtime: ${m.error.code} ${m.error.detail}`);
      await perform(player.runtime(m));
    }
    stage.seek(t);
    if (scene === 's4' && !clicked && t >= clickAfter) {
      clicked = true;
      log.push('click');
      await send({ type: 'event', event: { kind: 'click', object: null, x: 0.5, y: 0.5, at: t } });
    }
    await perform(player.now(t));
  }
  return { log, fades, over };
}

describe('playing a production through (WP8 done-when)', () => {
  it('builds a film whose references are sound', () => {
    expect(checkReferences(film())).toEqual([]);
  });

  it('plays through with each transition type, go to scene, and a scene that waits on the viewer', async () => {
    const { log, fades, over } = await play(film());
    expect(over).toBe(true);
    expect(log).toEqual([
      'load s1',
      'load s2 after cut',
      'load s3 after fadeToBlack',
      'crossfade s3 to s4',
      'load s4 after crossfade',
      'click',
      'end',
    ]);
    // Fade to black into s3: out on s2, then in on s3; then s4's fadeToBlack ends the film in black.
    expect(fades.map((f) => (f.kind === 'fade' ? f.to : null))).toEqual([1, 1, 0, 1]);
  });

  it('waits on a scene that listens for a click, however long, until it is clicked', async () => {
    const { log } = await play(film(), micros(20));
    expect(log.slice(-2)).toEqual(['click', 'end']);
  });
});
