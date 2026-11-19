import {
  IDENTITY,
  micros,
  objectId,
  type JointName,
  type Quat,
  type SceneSetup,
  type Vec3,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { codedGait, codedSpeed, codedStride, codedTurns, legAt } from './coded-gait.ts';
import { v } from './math.ts';
import { cmd } from './testing/conformance.ts';
import { standInShape, Timeline, type Shape } from './timeline.ts';

const j = (name: string) => name as JointName;

/** A cat-sized animal: shoulders and hips 20 cm up, its knees half way down. */
function cat(): Shape {
  const places = new Map<JointName, Vec3>();
  for (const [side, x] of [
    ['Left', 0.05],
    ['Right', -0.05],
  ] as const) {
    places.set(j(`front${side}Shoulder`), v(x, 0.2, 0.15));
    places.set(j(`front${side}Knee`), v(x, 0.1, 0.15));
    places.set(j(`front${side}Ankle`), v(x, 0.04, 0.15));
    places.set(j(`back${side}Hip`), v(x, 0.2, -0.15));
    places.set(j(`back${side}Knee`), v(x, 0.12, -0.15));
    places.set(j(`back${side}Hock`), v(x, 0.06, -0.15));
  }
  return {
    joints: [...places.keys()],
    box: { min: v(-0.08, 0, -0.25), max: v(0.08, 0.3, 0.25) },
    jointPlaces: places,
  };
}

const gaitOf = (shape: Shape) => codedGait(shape.joints, shape.jointPlaces, shape.box)!;

/** A turn about the sideways axis, in turns: positive takes a foot back. */
const sideways = (q: Quat | undefined) => (q ? (2 * Math.atan2(q.x, q.w)) / (2 * Math.PI) : 0);

const LEGS = ['backLeft', 'frontLeft', 'backRight', 'frontRight'] as const;
const upper = (leg: string) => j(`${leg}${leg.startsWith('front') ? 'Shoulder' : 'Hip'}`);

describe('a walk in code', () => {
  it('is for an animal with four legs, and not for a stand-in or a humanoid', () => {
    const gait = gaitOf(cat());
    expect(gait.legs).toHaveLength(4);
    expect(gait.legLength).toBeCloseTo(0.2, 9);
    // A stand-in's joints all rest at one place.
    const block = standInShape(cat().joints);
    expect(codedGait(block.joints, block.jointPlaces, block.box)).toBeNull();
    const human = new Map([[j('hips'), v(0, 1, 0)]]);
    expect(codedGait([j('hips')], human, cat().box)).toBeNull();
  });

  it('goes as fast as its legs are long: a giraffe strides, a cat pads', () => {
    const small = gaitOf(cat());
    const tall = codedGait(
      small.legs.flatMap((l) => [l.upper, l.knee]),
      new Map([...cat().jointPlaces].map(([joint, p]) => [joint, v(p.x * 10, p.y * 10, p.z * 10)])),
      { min: v(-0.8, 0, -2.5), max: v(0.8, 3, 2.5) },
    )!;
    // About half a metre a second for the cat; ten times the legs, about three times as fast.
    expect(codedSpeed(small, 'walk')).toBeCloseTo(0.44, 2);
    expect(codedSpeed(tall, 'walk')! / codedSpeed(small, 'walk')!).toBeCloseTo(Math.sqrt(10), 9);
    expect(codedSpeed(small, 'run')!).toBeGreaterThan(2.5 * codedSpeed(small, 'walk')!);
  });

  it('puts its feet down one at a time walking, and two across trotting', () => {
    const gait = gaitOf(cat());
    // Each foot is furthest forward as it comes down.
    const ahead = (moving: 'walk' | 'run', cycles: number) => {
      const turns = codedTurns(gait, [{ moving, cycles, weight: 1 }]);
      const forward = (leg: string) => -sideways(turns.get(upper(leg)));
      return LEGS.filter((leg) => forward(leg) > 0.999 * Math.max(...LEGS.map(forward)));
    };
    expect([0, 0.25, 0.5, 0.75].map((c) => ahead('walk', c))).toEqual([
      ['backLeft'],
      ['frontLeft'],
      ['backRight'],
      ['frontRight'],
    ]);
    expect(ahead('run', 0)).toEqual(['frontLeft', 'backRight']);
    expect(ahead('run', 0.5)).toEqual(['backLeft', 'frontRight']);
  });

  it('keeps each foot planted while it is on the ground', () => {
    const gait = gaitOf(cat());
    for (const moving of ['walk', 'run'] as const) {
      const stride = codedStride(gait, moving)!;
      const onGround = moving === 'walk' ? 0.65 : 0.4;
      for (const leg of gait.legs) {
        // Where its foot is on the ground, as the body goes from one end of its time there.
        const down = leg.phase[moving];
        const feet = Array.from({ length: 21 }, (_, i) => {
          const cycles = down + (i / 20) * onGround;
          const turns = codedTurns(gait, [{ moving, cycles, weight: 1 }]);
          const forward = -sideways(turns.get(leg.upper)) * 2 * Math.PI;
          return cycles * stride + leg.length * Math.sin(forward);
        });
        // It moves back as the body goes forward: by under a twentieth of a stride.
        expect(Math.max(...feet) - Math.min(...feet)).toBeLessThan(stride / 20);
      }
    }
  });

  it('lifts a foot only while it swings forward', () => {
    expect(legAt(0.3, 0.65)).toEqual({ forward: 1 - 0.6 / 0.65, lift: 0 });
    const swing = legAt(0.825, 0.65);
    expect(swing.forward).toBeCloseTo(0, 9);
    expect(swing.lift).toBeCloseTo(1, 9);
  });

  it('walks a bird on two legs, one foot then the other, its wings still', () => {
    const places = new Map<JointName, Vec3>();
    for (const [side, x] of [
      ['left', 0.02],
      ['right', -0.02],
    ] as const) {
      places.set(j(`${side}Hip`), v(x, 0.05, 0));
      places.set(j(`${side}Knee`), v(x, 0.03, 0.01));
      places.set(j(`${side}Ankle`), v(x, 0.01, -0.005));
      places.set(j(`${side}WingShoulder`), v(x * 1.5, 0.07, 0));
    }
    const chick = codedGait([...places.keys()], places, {
      min: v(-0.04, 0, -0.04),
      max: v(0.04, 0.1, 0.04),
    })!;
    expect(chick.legs.map((l) => l.upper)).toEqual([j('leftHip'), j('rightHip')]);
    expect(chick.legs.every((l) => l.lower === l.knee.replace('Knee', 'Ankle'))).toBe(true);
    for (const moving of ['walk', 'run'] as const) {
      const at = (cycles: number) => codedTurns(chick, [{ moving, cycles, weight: 1 }]);
      // Each foot furthest forward as it comes down: the left at 0, the right half a cycle on.
      expect(sideways(at(0).get(j('leftHip')))).toBeLessThan(sideways(at(0).get(j('rightHip'))));
      expect(sideways(at(0.5).get(j('rightHip')))).toBeLessThan(
        sideways(at(0.5).get(j('leftHip'))),
      );
      expect(at(0.25).has(j('leftWingShoulder'))).toBe(false);
    }
  });

  it('beats its wings, for a flyer with wings and no fly clip', () => {
    const places = new Map([
      [j('leftWingShoulder'), v(0.01, 0.05, 0)],
      [j('leftWingTip'), v(0.06, 0.05, 0)],
      [j('rightWingShoulder'), v(-0.01, 0.05, 0)],
      [j('rightWingTip'), v(-0.06, 0.05, 0)],
    ]);
    const gait = codedGait([...places.keys()], places, {
      min: v(-0.06, 0, -0.03),
      max: v(0.06, 0.08, 0.03),
    })!;
    expect(gait.legs).toEqual([]);
    expect(gait.wings.map((w) => w.side)).toEqual([1, -1]);
    expect(codedSpeed(gait, 'walk')).toBeNull();
    // A quarter of a beat in, both wings are up: turned opposite ways about the way it faces.
    const turns = codedTurns(gait, [{ moving: 'walk', cycles: 0.25, weight: 1 }]);
    const left = turns.get(j('leftWingShoulder'))!;
    const right = turns.get(j('rightWingShoulder'))!;
    expect(left.z).toBeGreaterThan(0.1);
    expect(right.z).toBeCloseTo(-left.z, 9);
  });
});

describe('a walk in code on the timeline', () => {
  const kitty = objectId('kitty');
  const spot = objectId('spot');
  const at = (x: number) => ({ ...IDENTITY, position: v(x, 0, 0) });
  const scene: SceneSetup = {
    backdrop: {},
    objects: [{ id: kitty, model: { standIn: 'cat' }, class: 'Quadruped', transform: at(0) }],
    camera: { transform: { ...IDENTITY, position: v(0, 1.5, -8) } },
    markers: [{ id: spot, transform: at(2) }],
  };

  it('walks at its legs’ pace, its legs turning only while it goes', () => {
    const t = new Timeline();
    t.load(scene, () => cat());
    const walk = { object: kitty, kind: 'walk', to: spot, gait: 'walk' } as const;
    const seconds = 2 / Math.sqrt(0.1 * 9.81 * 0.2);
    expect(t.answer({ kind: 'naturalDuration', action: walk, at: 0 }, () => false).value).toBe(
      micros(seconds),
    );
    expect(t.shown(kitty).turns).toBeNull();
    t.schedule([{ ...cmd(0, seconds, walk), style: 'beginAndEndAbruptly' }]);
    t.seek(micros(seconds / 3));
    const turns = t.shown(kitty).turns!;
    expect([...turns.keys()]).toEqual(expect.arrayContaining(LEGS.map(upper)));
    t.seek(micros(seconds + 1));
    expect(t.shown(kitty).turns).toBeNull();
  });

  it('is not for an animal with a walk clip of its own', () => {
    const t = new Timeline();
    t.load(scene, () => ({ ...cat(), gaits: { walk: { clip: 'walk', speed: 0.5 } } }));
    const walk = { object: kitty, kind: 'walk', to: spot, gait: 'walk' } as const;
    t.schedule([{ ...cmd(0, 4, walk), style: 'beginAndEndAbruptly' }]);
    t.seek(micros(2));
    expect(t.shown(kitty).turns).toBeNull();
    expect(t.shown(kitty).own.map((l) => l.name)).toEqual(['walk']);
  });
});
