import { IDENTITY, micros, objectId, type SceneSetup } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { gaitClipNames, strideSpeed, type Gaits } from './gaits.ts';
import { v } from './math.ts';
import { cmd } from './testing/conformance.ts';
import { Timeline, type Shape } from './timeline.ts';

const dog = objectId('dog');
const spot = objectId('spot');
const at = (x: number) => ({ ...IDENTITY, position: v(x, 0, 0) });
const scene: SceneSetup = {
  backdrop: {},
  objects: [{ id: dog, model: { standIn: 'dog' }, class: 'Quadruped', transform: at(0) }],
  camera: { transform: { ...IDENTITY, position: v(0, 1.5, -8) } },
  markers: [{ id: spot, transform: at(4) }],
};
const animal = (gaits: Gaits): Shape => ({
  joints: [],
  box: { min: v(-0.2, 0, -0.4), max: v(0.2, 0.6, 0.4) },
  jointPlaces: new Map(),
  gaits,
});
const timeline = (gaits: Gaits) => {
  const t = new Timeline();
  t.load(scene, () => animal(gaits));
  return t;
};

describe("an animal's own gaits", () => {
  it('are looked for under the standard names, a flyer flying and a swimmer swimming', () => {
    expect(gaitClipNames('walk', 'Quadruped')).toEqual(['walk']);
    // A penguin walks with its own walk (S4, 19 Nov); a butterfly with its fly.
    expect(gaitClipNames('walk', 'Flyer')).toEqual(['walk', 'fly']);
    expect(gaitClipNames('walk', 'Swimmer')).toEqual(['walk', 'swim']);
    // On any move, a flyer flies and a swimmer swims (owner, 19 Nov); nothing else.
    expect(gaitClipNames('move', 'Flyer')).toEqual(['fly']);
    expect(gaitClipNames('move', 'Swimmer')).toEqual(['swim']);
    expect(gaitClipNames('move', 'Quadruped')).toEqual([]);
    // Styloo's makers spelt it so, until S4's build renames it.
    expect(gaitClipNames('idle', 'Quadruped')).toEqual(['idle', 'iddle']);
  });

  it("go as fast as the feet sweep while they're down", () => {
    // 0.26 m a step, a foot down for 0.65 of a 1 s cycle.
    expect(strideSpeed([0.26, 0.26], 1, 'walk')).toBeCloseTo(0.4, 9);
    expect(strideSpeed([0, 0], 1, 'walk')).toBeNull();
    expect(strideSpeed([0.3], 0, 'run')).toBeNull();
  });

  it('stand with their idle, and walk with their walk keeping pace with the ground', () => {
    const t = timeline({
      walk: { clip: 'walk', speed: 0.5 },
      idle: { clip: 'iddle', speed: null },
    });
    expect(t.shown(dog).own).toEqual([{ name: 'iddle', time: 0, weight: 1 }]);
    // Walking 4 m at its own pace takes 8 s.
    const walk = { object: dog, kind: 'walk', to: spot, gait: 'walk' } as const;
    expect(t.answer({ kind: 'naturalDuration', action: walk, at: 0 }, () => false).value).toBe(
      micros(8),
    );
    t.schedule([{ ...cmd(0, 8, walk), style: 'beginAndEndAbruptly' }]);
    t.seek(micros(4));
    const own = t.shown(dog).own;
    // Half way, 2 m on: the walk's clip is 4 s in, and the idle is under it no longer.
    expect(own).toEqual([{ name: 'walk', time: 4, weight: 1 }]);
    t.seek(micros(9));
    expect(t.shown(dog).own).toEqual([{ name: 'iddle', time: 9, weight: 1 }]);
  });

  it('walk no slower than a quarter of a metre a second, legs stepping up to three times faster (owner, 19-20 Nov)', () => {
    // A small dog's legs carry it 10 cm a second; it walks at the floor, 4 m in 16 s.
    const small = timeline({
      walk: { clip: 'walk', speed: 0.1 },
      run: { clip: 'run', speed: 0.3 },
    });
    const walk = { object: dog, kind: 'walk', to: spot, gait: 'walk' } as const;
    const run = { ...walk, gait: 'run' } as const;
    const seconds = (t: ReturnType<typeof timeline>, action: typeof walk | typeof run) =>
      Number(t.answer({ kind: 'naturalDuration', action, at: 0 }, () => false).value) / 1e6;
    expect(seconds(small, walk)).toBeCloseTo(16, 5);
    // Its run no slower than two and a half times that: 0.625 m a second.
    expect(seconds(small, run)).toBeCloseTo(6.4, 5);
    // A toy cat's tiny legs carry it 3 cm a second. Its clip plays no faster than three times
    // its own pace (owner, 20 Nov), so it walks 9 cm a second; its run, 18 cm, at 54 cm.
    const t = timeline({ walk: { clip: 'walk', speed: 0.03 }, run: { clip: 'run', speed: 0.18 } });
    expect(seconds(t, walk)).toBeCloseTo(4 / 0.09, 5);
    expect(seconds(t, run)).toBeCloseTo(4 / 0.54, 5);
    t.schedule([{ ...cmd(0, 4 / 0.09, walk), style: 'beginAndEndAbruptly' }]);
    t.seek(micros(2 / 0.09));
    // 2 m on, its clip keeps its own pace with the ground: 2 / 0.03 s in, feet planted.
    const [own] = t.shown(dog).own;
    expect(own!.name).toBe('walk');
    expect(own!.time).toBeCloseTo(2 / 0.03, 3);
  });

  it('run with their walk, faster, if they have no run', () => {
    const t = timeline({ walk: { clip: 'walk', speed: 0.5 } });
    const run = { object: dog, kind: 'walk', to: spot, gait: 'run' } as const;
    // Two and a half times as fast as walking: 1.25 m a second.
    expect(t.answer({ kind: 'naturalDuration', action: run, at: 0 }, () => false).value).toBe(
      micros(3.2),
    );
    t.schedule([{ ...cmd(0, 3.2, run), style: 'beginAndEndAbruptly' }]);
    t.seek(micros(1.6));
    // 2 m on: the walk's clip keeps pace with the ground, 4 s in.
    expect(t.shown(dog).own.map((l) => [l.name, l.time])).toEqual([['walk', 4]]);
  });

  it('hop when their Backstage entry says so, at a pace from their height (owner, 20 Nov)', () => {
    // A 60 cm hopper with no walk clip (S4's frog, `gait: 'hop'`).
    const t = new Timeline();
    t.load(scene, () => ({ ...animal({}), hop: true }));
    const walk = { object: dog, kind: 'walk', to: spot, gait: 'walk' } as const;
    // Its pace is for legs half its height, as an animal's whose stride can't be measured.
    const pace = Math.sqrt(0.1 * 9.81 * 0.3);
    const seconds =
      Number(t.answer({ kind: 'naturalDuration', action: walk, at: 0 }, () => false).value) / 1e6;
    expect(seconds).toBeCloseTo(4 / pace, 5);
    t.schedule([{ ...cmd(0, 4 / pace, walk), style: 'beginAndEndAbruptly' }]);
    // Each hop goes about 1.5 heights (0.9 m), four fitting the 4 m: 1 m each. It's in the air
    // for 0.7 of each, rising 0.4 heights (0.24 m).
    const at = (metres: number) => {
      t.seek(micros(metres / pace));
      return t.transform(dog);
    };
    // Half way through its time in the air: at the top, level.
    const top = at(1 + 0.35);
    expect(top.position.x).toBeCloseTo(1.35, 3);
    expect(top.position.y).toBeCloseTo(0.24, 3);
    expect(top.rotation.x).toBeCloseTo(0, 3);
    // Leaving the ground, its nose tipping up (a negative turn about its own x axis).
    const leaving = at(1 + 0.01);
    expect(leaving.position.y).toBeGreaterThan(0);
    expect(leaving.position.y).toBeLessThan(0.05);
    expect(leaving.rotation.x).toBeLessThan(-0.1);
    // Landed, between hops: on the ground, level.
    const down = at(1 + 0.85);
    expect(down.position.y).toBe(0);
    expect(down.rotation.x).toBe(0);
    // Nothing else hops.
    const plain = timeline({});
    plain.schedule([{ ...cmd(0, 4 / pace, walk), style: 'beginAndEndAbruptly' }]);
    plain.seek(micros(1.35 / pace));
    expect(plain.transform(dog).position.y).toBe(0);
  });

  it('hop smoothly as they ease into a run, walking and running hops blending (S4)', () => {
    const t = new Timeline();
    t.load({ ...scene, markers: [{ id: spot, transform: at(8) }] }, () => ({
      ...animal({}),
      hop: true,
    }));
    const run = { object: dog, kind: 'walk', to: spot, gait: 'run' } as const;
    t.schedule([{ ...cmd(0, 8, run), style: 'beginGentlyAndEndAbruptly' }]);
    // Every 5 ms as it speeds up, it rises or falls no more than its fastest hop could; and as
    // the walk ends at full speed, it has landed.
    let last = 0;
    let most = 0;
    for (let ms = 0; ms <= 8000; ms += 5) {
      t.seek(micros(ms / 1000));
      const { y } = t.transform(dog).position;
      most = Math.max(most, Math.abs(y - last));
      last = y;
    }
    expect(most).toBeLessThan(0.03);
  });

  it('fly at their own pace when the stage can’t tell how fast a clip goes', () => {
    const t = timeline({ walk: { clip: 'fly', speed: null } });
    const walk = { object: dog, kind: 'walk', to: spot, gait: 'walk' } as const;
    // At a pace for legs half its 60 cm height (owner, 20 Nov), not a person's 1.2 m/s:
    // √(0.1 g × 0.3 m) walking, √(0.8 g × 0.3 m) running.
    const seconds = (gait: 'walk' | 'run') =>
      Number(
        t.answer({ kind: 'naturalDuration', action: { ...walk, gait }, at: 0 }, () => false).value,
      ) / 1e6;
    expect(seconds('walk')).toBeCloseTo(4 / Math.sqrt(0.1 * 9.81 * 0.3), 5);
    expect(seconds('run')).toBeCloseTo(4 / Math.sqrt(0.8 * 9.81 * 0.3), 5);
    t.schedule([{ ...cmd(0, 8, walk), style: 'beginAndEndAbruptly' }]);
    t.seek(micros(3));
    expect(t.shown(dog).own).toEqual([{ name: 'fly', time: 3, weight: 1 }]);
  });
});

describe('a flyer or swimmer on any move (owner, 19 Nov)', () => {
  const bee = (gaits: Gaits) => timeline(gaits);
  const fly = { clip: 'fly', speed: null } as const;

  it('plays its own fly while it moves, coming in and going', () => {
    const t = bee({ move: fly, idle: { clip: 'idle', speed: null } });
    t.schedule([
      { ...cmd(0, 2, { object: dog, kind: 'moveTo', target: spot }), style: 'beginAndEndAbruptly' },
    ]);
    t.seek(micros(1));
    // At its own pace, a second in, with the idle gone under it.
    expect(t.shown(dog).own).toEqual([{ name: 'fly', time: 1, weight: 1 }]);
    t.seek(micros(0.1));
    expect(t.shown(dog).own).toEqual([
      { name: 'idle', time: 0.1, weight: 0.5 },
      { name: 'fly', time: 0.1, weight: 0.5 },
    ]);
    t.seek(micros(2.5));
    expect(t.shown(dog).own).toEqual([{ name: 'idle', time: 2.5, weight: 1 }]);
  });

  it('flies once for two moves at once, by the clock of the first', () => {
    const t = bee({ move: fly });
    const up = { object: dog, kind: 'translate', by: v(0, 1, 0), space: 'scene' } as const;
    t.schedule([
      { ...cmd(0, 2, { object: dog, kind: 'moveTo', target: spot }), style: 'beginAndEndAbruptly' },
      { ...cmd(0.5, 2, up), style: 'beginAndEndAbruptly' },
    ]);
    t.seek(micros(1));
    expect(t.shown(dog).own).toEqual([{ name: 'fly', time: 1, weight: 1 }]);
    // The first has ended; the second flies on, by its own clock.
    t.seek(micros(2.3));
    expect(t.shown(dog).own).toEqual([{ name: 'fly', time: 1.8, weight: 1 }]);
  });

  it('does nothing for a model with no fly, or a move that goes nowhere', () => {
    const t = bee({ walk: { clip: 'walk', speed: 0.5 } });
    t.schedule([
      { ...cmd(0, 2, { object: dog, kind: 'moveTo', target: spot }), style: 'beginAndEndAbruptly' },
    ]);
    t.seek(micros(1));
    expect(t.shown(dog).own).toEqual([]);
    const still = bee({ move: fly });
    still.schedule([cmd(0, 2, { object: dog, kind: 'moveTo', target: dog })]);
    still.seek(micros(1));
    expect(still.shown(dog).own).toEqual([]);
  });
});
