import { describe, expect, it } from 'vitest';
import { nodeId, type ListenerDecl } from '@storystage/ast';
import type { FromRuntime } from '@storystage/runtime';
import { micros, type StageCommand } from '@storystage/story-api';
import { exampleProduction } from './example.ts';
import { ProductionPlayer, type PlayerAction } from './player.ts';
import { SCENE_START_LIMIT } from './playback.ts';
import { sceneId, type Production } from './types.ts';

// The example's running order: s1 (cut), s2 (fade to black, 1 s), s3 (crossfade, 0.5 s).
const p = exampleProduction();

const command = (start: number, duration: number): StageCommand => ({
  kind: 'fade',
  seq: 1,
  object: 'scene' as never,
  start: micros(start),
  duration: micros(duration),
  style: 'beginAndEndAbruptly',
  to: 0,
});
const commands = (...c: StageCommand[]): FromRuntime => ({
  type: 'commands',
  commands: c,
  until: 0,
  sentAt: 0,
});
const finished = (at: number): FromRuntime => ({ type: 'finished', at: micros(at) });
const goTo = (scene: string, at: number): FromRuntime => ({
  type: 'sceneChange',
  at: micros(at),
  ending: { kind: 'goToScene', scene },
});
const kinds = (actions: PlayerAction[]) => actions.map((a) => a.kind);
const loads = (actions: PlayerAction[]) => actions.flatMap((a) => (a.kind === 'load' ? [a] : []));

/** The example, with its first scene waiting for a click. */
function waiting(): Production {
  const listener: ListenerDecl = {
    id: nodeId('scene1l'),
    kind: 'listener',
    event: 'clickOnObject',
    args: {},
    details: {},
    params: [],
    body: [],
  };
  return {
    ...p,
    program: {
      ...p.program,
      types: p.program.types.map((t, i) => (i === 0 ? { ...t, listeners: [listener] } : t)),
    },
  };
}

const player = (q: Production = p, mode: 'production' | 'rehearse' = 'production', from?: string) =>
  new ProductionPlayer(q, { mode, seed: 100, ...(from ? { from: sceneId(from) } : {}) });

describe('ProductionPlayer', () => {
  it('loads the first scene, self-contained, with its own seed', () => {
    const [load] = player().start();
    expect(load).toEqual({
      kind: 'load',
      scene: 's1',
      entry: p.scenes[0]!.method,
      setup: p.scenes[0]!.setup,
      seed: 101,
      scenes: ['s1', 's2', 's3'],
      transition: null,
      commands: [],
    });
  });

  it('ends a scene once its method has finished and its last command has ended on screen', () => {
    const pl = player();
    pl.start();
    pl.runtime(commands(command(0, 4)));
    pl.runtime(finished(1));
    expect(pl.now(micros(3.9))).toEqual([]);
    const actions = pl.now(micros(4));
    expect(kinds(actions)).toEqual(['stop', 'load', 'preload']);
    expect(loads(actions)[0]).toMatchObject({
      scene: 's2',
      seed: 102,
      transition: { kind: 'cut' },
    });
  });

  it("doesn't end a scene that waits on the viewer, until a block ends it", () => {
    const pl = player(waiting());
    pl.start();
    pl.runtime(finished(0));
    expect(pl.now(micros(60))).toEqual([]);
    pl.runtime(goTo('s3', 61));
    expect(loads(pl.now(micros(61)))[0]).toMatchObject({ scene: 's3' });
  });

  it('in an export, ends a waiting scene viewerWait after its last command (rule 11)', () => {
    const pl = new ProductionPlayer(waiting(), {
      mode: 'production',
      seed: 100,
      viewerWait: micros(5),
    });
    pl.start();
    pl.runtime(commands(command(0, 3)));
    pl.runtime(finished(1));
    expect(pl.now(micros(7.9))).toEqual([]);
    // A later command (a timer, say) moves the end on.
    pl.runtime(commands(command(6, 2)));
    expect(pl.now(micros(12.9))).toEqual([]);
    const actions = pl.now(micros(13));
    expect(kinds(actions)).toEqual(['stop', 'load', 'preload']);
    expect(loads(actions)[0]).toMatchObject({ scene: 's2', transition: { kind: 'cut' } });
  });

  it('in an export, still lets a block end a waiting scene first', () => {
    const pl = new ProductionPlayer(waiting(), {
      mode: 'production',
      seed: 100,
      viewerWait: micros(5),
    });
    pl.start();
    pl.runtime(finished(0));
    pl.runtime(goTo('s3', 2));
    pl.runtime(commands(command(2, 10))); // left over from before the change: moves nothing on
    expect(loads(pl.now(micros(2)))[0]).toMatchObject({ scene: 's3' });
  });

  it('fades to black: out over the first half, then the next scene loads and fades in', () => {
    const pl = player();
    pl.start();
    pl.runtime(goTo('s2', 0)); // s1 ends with a cut into s2
    pl.now(0);
    pl.runtime(finished(2)); // s2 ends with its 1 s fade to black into s3
    const out = pl.now(micros(2));
    expect(out).toEqual([
      { kind: 'stop' },
      {
        kind: 'stageCommands',
        commands: [
          expect.objectContaining({ kind: 'fade', to: 1, start: micros(2), duration: micros(0.5) }),
        ],
      },
    ]);
    expect(pl.current()).toBe('s2');
    expect(pl.now(micros(2.4))).toEqual([]);
    const [load] = pl.now(micros(2.5));
    expect(load).toMatchObject({ kind: 'load', scene: 's3', transition: { kind: 'fadeToBlack' } });
    if (load?.kind !== 'load') return;
    expect(load.commands).toEqual([
      expect.objectContaining({ kind: 'fade', to: 1, start: 0, duration: 0 }),
      expect.objectContaining({ kind: 'fade', to: 0, start: 0, duration: micros(0.5) }),
    ]);
    expect(pl.current()).toBe('s3');
  });

  it('crossfades: the old scene keeps playing while the next loads', () => {
    const pl = player();
    pl.start();
    pl.runtime({
      type: 'sceneChange',
      at: micros(1),
      ending: { kind: 'crossfade', scene: 's3', duration: micros(1) },
    });
    expect(pl.now(micros(1))).toEqual([
      { kind: 'crossfade', from: 's1', to: 's3', duration: micros(1) },
      expect.objectContaining({
        kind: 'load',
        scene: 's3',
        transition: { kind: 'crossfade', duration: micros(1) },
      }),
    ]);
  });

  it('ends the film after the last scene, in black when it fades to black', () => {
    const pl = player(p, 'production', 's3');
    pl.start();
    pl.runtime(finished(1));
    expect(pl.now(micros(1))).toEqual([{ kind: 'stop' }, { kind: 'end', fadeOut: null }]);
    expect(pl.ended()).toBe(true);

    const black = player(p, 'production', 's3');
    black.start();
    black.runtime({
      type: 'sceneChange',
      at: micros(1),
      ending: { kind: 'fadeToBlack', duration: micros(2) },
    });
    expect(kinds(black.now(micros(1)))).toEqual(['stageCommands']);
    expect(black.now(micros(1.99))).toEqual([]);
    expect(black.now(micros(2))).toEqual([{ kind: 'end', fadeOut: null }]);
  });

  it('stops after the scene start limit, with a plain message', () => {
    const pl = player();
    pl.start();
    let last: PlayerAction[] = [];
    for (let i = 0; i < SCENE_START_LIMIT + 1 && !pl.ended(); i++) {
      pl.runtime(goTo('s1', 0));
      last = pl.now(0);
    }
    expect(last[0]).toMatchObject({
      kind: 'fault',
      code: 'tooManyScenes',
      message: expect.stringMatching(/200 times/),
    });
    expect(pl.ended()).toBe(true);
  });

  it("stops at a scene the production doesn't have", () => {
    const pl = player();
    pl.start();
    pl.runtime(goTo('s9', 0));
    expect(pl.now(0)).toEqual([
      { kind: 'fault', code: 'noSuchScene', message: "There's no scene called s9." },
      { kind: 'end', fadeOut: null },
    ]);
  });

  it('in Rehearse, shows "Next" instead of jumping, and ends', () => {
    const pl = player(p, 'rehearse', 's2');
    expect(loads(pl.start())[0]).toMatchObject({ scene: 's2' });
    pl.runtime(goTo('s3', 2));
    expect(pl.now(micros(2))).toEqual([
      { kind: 'next', scene: 's3', heading: 'Ice shelf, evening' },
      { kind: 'end', fadeOut: null },
    ]);
  });

  it('stops on a runtime error, and on Stop, and then does nothing more', () => {
    const pl = player();
    pl.start();
    expect(pl.runtime({ type: 'error', error: { code: 'infinite_loop' } as never })).toEqual([
      { kind: 'stop' },
    ]);
    expect(pl.ended()).toBe(true);
    expect(pl.now(micros(100))).toEqual([]);

    const stopped = player();
    stopped.start();
    expect(stopped.stop()).toEqual([{ kind: 'stop' }, { kind: 'end', fadeOut: null }]);
    expect(stopped.stop()).toEqual([]);
  });

  it("hints at the running order's next scene after each load, so the stage can fetch it", () => {
    const pl = player();
    const started = pl.start();
    expect(kinds(started)).toEqual(['load', 'preload']);
    expect(started[1]).toEqual({ kind: 'preload', scene: 's2', setup: p.scenes[1]!.setup });
    // From the last scene there's nothing to preload; nor in Rehearse, which plays one scene.
    pl.runtime(goTo('s3', 0));
    expect(kinds(pl.now(0))).toEqual(['load']);
    expect(kinds(player(p, 'rehearse', 's1').start())).toEqual(['load']);
  });

  it('gives the same seeds on a rerun', () => {
    const run = () => {
      const pl = player();
      const seeds = loads(pl.start()).map((l) => l.seed);
      pl.runtime(goTo('s2', 0));
      seeds.push(...loads(pl.now(0)).map((l) => l.seed));
      return seeds;
    };
    expect(run()).toEqual([101, 102]);
    expect(run()).toEqual(run());
  });
});
