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
    expect(gaitClipNames('walk', 'Flyer')).toEqual(['fly', 'walk']);
    expect(gaitClipNames('walk', 'Swimmer')).toEqual(['swim', 'walk']);
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

  it('fly at their own pace when the stage can’t tell how fast a clip goes', () => {
    const t = timeline({ walk: { clip: 'fly', speed: null } });
    const walk = { object: dog, kind: 'walk', to: spot, gait: 'walk' } as const;
    t.schedule([{ ...cmd(0, 8, walk), style: 'beginAndEndAbruptly' }]);
    t.seek(micros(3));
    expect(t.shown(dog).own).toEqual([{ name: 'fly', time: 3, weight: 1 }]);
  });
});
