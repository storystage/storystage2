/**
 * The stage contract's test suite. Every implementation runs it: `FakeStage` here, and the
 * Babylon.js stage in WP5a (`describeStageContract('BabylonStage', () => new BabylonStage(...))`).
 * The fixture uses stand-ins, so no model files are needed.
 */
import {
  CAMERA,
  IDENTITY,
  SCENE,
  StageError,
  jointName,
  micros,
  objectId,
  type Look,
  type ObjectId,
  type SceneLook,
  type SceneSetup,
  type ShotType,
  type StageCommand,
  type Transform,
  type Vec3,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { Stage } from '../contract.ts';
import { heading, rotate } from '../math.ts';

const cat = objectId('cat');
const dog = objectId('dog');
/** Both stages give an actor a head (`FakeStage` by default, a stand-in by its class). */
const head = jointName('head');
const at = (x: number, y: number, z: number): Transform => ({ ...IDENTITY, position: { x, y, z } });

export const SETUP: SceneSetup = {
  backdrop: { fog: 0 },
  objects: [
    { id: cat, model: { standIn: 'cat' }, class: 'Quadruped', transform: at(-1, 0, 0) },
    { id: dog, model: { standIn: 'dog' }, class: 'Quadruped', transform: at(1, 0, 0) },
  ],
  camera: { transform: at(0, 2, -6) },
  markers: [],
};

let seq = 0;
type Partial = DistributiveOmit<StageCommand, 'seq' | 'start' | 'duration' | 'style'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A command starting at `start` seconds and lasting `seconds`. */
export const cmd = (start: number, seconds: number, c: Partial): StageCommand =>
  ({
    seq: seq++,
    start: micros(start),
    duration: micros(seconds),
    style: 'beginAndEndGently',
    ...c,
  }) as StageCommand;

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

export function describeStageContract(name: string, make: () => Stage | Promise<Stage>) {
  describe(`${name} meets the stage contract`, () => {
    const loaded = async (setup: SceneSetup = SETUP) => {
      const stage = await make();
      await stage.load(setup);
      return stage;
    };

    it('lists every object, the camera included, at its starting place', async () => {
      const stage = await loaded();
      expect(stage.objects()).toEqual(expect.arrayContaining([cat, dog, CAMERA]));
      close(stage.transform(cat).position.x, -1);
      close(stage.transform(CAMERA).position.z, -6);
    });

    it('eases a move: half way at half time with the default style', async () => {
      const stage = await loaded();
      stage.schedule([
        cmd(0, 1, { object: cat, kind: 'translate', by: { x: 0, y: 0, z: 2 }, space: 'scene' }),
      ]);
      stage.seek(micros(0.5));
      close(stage.transform(cat).position.z, 1);
      stage.seek(micros(0.1));
      expect(stage.transform(cat).position.z).toBeLessThan(0.2 * 0.1 * 2 + 0.2); // slow start
      stage.seek(micros(5));
      close(stage.transform(cat).position.z, 2);
    });

    it('seeks purely: back and forth gives the same scene, and so does a fresh stage', async () => {
      const commands = [
        cmd(0, 1, { object: cat, kind: 'translate', by: { x: 1, y: 0, z: 0 }, space: 'scene' }),
        cmd(0.5, 1, {
          object: dog,
          kind: 'rotate',
          axis: { x: 0, y: 1, z: 0 },
          turns: 0.5,
          space: 'scene',
        }),
        cmd(1, 0.5, { object: dog, kind: 'say', text: 'Hello', bubble: 'say' }),
      ];
      const a = await loaded();
      a.schedule(commands);
      a.seek(micros(1.2));
      const h = a.stateHash();
      a.seek(micros(3));
      a.seek(micros(1.2));
      expect(a.stateHash()).toBe(h);
      const b = await loaded();
      b.schedule(commands);
      b.seek(micros(1.2));
      expect(b.stateHash()).toBe(h);
    });

    it('composes overlapping commands the same whatever order they arrive in', async () => {
      const move = cmd(0, 1, {
        object: cat,
        kind: 'translate',
        by: { x: 0, y: 1, z: 0 },
        space: 'scene',
      });
      const grow = cmd(0, 2, { object: cat, kind: 'resize', factor: { x: 2, y: 2, z: 2 } });
      const turn = cmd(0.5, 1, {
        object: cat,
        kind: 'rotate',
        axis: { x: 0, y: 1, z: 0 },
        turns: 0.25,
        space: 'scene',
      });
      const a = await loaded();
      a.schedule([move, grow, turn]);
      const b = await loaded();
      b.schedule([turn]);
      b.schedule([grow, move]);
      for (const t of [0.25, 0.75, 1.5, 3]) {
        a.seek(micros(t));
        b.seek(micros(t));
        expect(b.stateHash()).toBe(a.stateHash());
      }
    });

    it("moves 'self' forward along the way the object faces when the move starts", async () => {
      const stage = await loaded();
      stage.schedule([
        cmd(0, 1, {
          object: dog,
          kind: 'rotate',
          axis: { x: 0, y: 1, z: 0 },
          turns: 0.25,
          space: 'scene',
        }),
        cmd(1, 1, { object: dog, kind: 'translate', by: { x: 0, y: 0, z: 1 }, space: 'self' }),
      ]);
      stage.seek(micros(2));
      // A quarter turn about +Y turns +Z (forward) into +X.
      close(stage.transform(dog).position.x, 2);
      close(stage.transform(dog).position.z, 0);
    });

    it('works out "move to" when the move starts', async () => {
      const stage = await loaded();
      stage.schedule([cmd(0, 1, { object: cat, kind: 'moveTo', target: dog })]);
      stage.seek(micros(1));
      close(stage.transform(cat).position.x, 1);
    });

    it('shows a speech bubble only while it lasts', async () => {
      const stage = await loaded();
      stage.schedule([cmd(1, 2, { object: cat, kind: 'say', text: 'Hello', bubble: 'say' })]);
      stage.seek(micros(0.5));
      expect(stage.speech(cat)).toBeNull();
      stage.seek(micros(2));
      expect(stage.speech(cat)).toEqual({ text: 'Hello', bubble: 'say' });
      stage.seek(micros(3.5));
      expect(stage.speech(cat)).toBeNull();
    });

    it('refuses a command for an unknown object and adds none of the batch', async () => {
      const stage = await loaded();
      const before = stage.stateHash();
      const good = cmd(0, 1, {
        object: cat,
        kind: 'translate',
        by: { x: 1, y: 0, z: 0 },
        space: 'scene',
      });
      const bad = cmd(0, 1, {
        object: objectId('dragon'),
        kind: 'translate',
        by: { x: 1, y: 0, z: 0 },
        space: 'scene',
      });
      let error: unknown;
      try {
        stage.schedule([good, bad]);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(StageError);
      expect((error as StageError).code).toBe('unknown_object');
      stage.seek(micros(2));
      expect(stage.stateHash()).toBe(before);
    });

    it('answers a question at its own time without moving the scene', async () => {
      const stage = await loaded();
      stage.schedule([cmd(0, 1, { object: cat, kind: 'moveTo', target: dog })]);
      stage.seek(0);
      const h = stage.stateHash();
      const answer = stage.answer({ kind: 'distance', from: cat, to: dog, at: micros(1) });
      expect(answer.kind).toBe('distance');
      close(answer.value as number, 0);
      expect(stage.stateHash()).toBe(h);
      expect(stage.time()).toBe(0);
    });

    it('refuses a paint that does not exist, in a command or a set-up', async () => {
      const stage = await loaded();
      expect(() =>
        stage.schedule([cmd(0, 0, { object: cat, kind: 'paint', paint: 'rainbow' })]),
      ).toThrow(StageError);
      const [first, second] = SETUP.objects;
      await expect(
        (await make()).load({ ...SETUP, objects: [{ ...first!, paint: 'rainbow' }, second!] }),
      ).rejects.toMatchObject({ code: 'bad_argument' });
    });

    // Still to come: smooth paths, wings and the size of a joint.
    it('refuses what it cannot do yet, and adds none of the batch', async () => {
      const stage = await loaded();
      const before = stage.stateHash();
      const move = cmd(0, 1, {
        object: cat,
        kind: 'translate',
        by: { x: 1, y: 0, z: 0 },
        space: 'scene',
      });
      for (const later of [
        cmd(0, 1, { object: cat, kind: 'moveTo', target: dog, pathStyle: 'smooth' }),
        cmd(0, 1, { object: cat, kind: 'pose', pose: 'wingsFolded' }),
      ])
        expect(() => stage.schedule([move, later])).toThrow(/can't do .* yet/);
      stage.seek(micros(1));
      expect(stage.stateHash()).toBe(before);
      const joint = { object: cat, joint: head };
      expect(() => stage.answer({ kind: 'size', object: joint, at: 0 })).toThrow(/yet/);
    });

    describe('character actions (WP4c)', () => {
      const where = (stage: Stage, id = cat) =>
        stage.answer({ kind: 'transform', object: id, at: stage.time() }).value as Transform;
      const natural = (
        stage: Stage,
        action: Parameters<typeof stage.answer>[0] & { kind: 'naturalDuration' },
      ) => stage.answer(action).value as number;

      it('take their own time: a walk by its length, anything else instantly', async () => {
        const stage = await loaded();
        const walk = { object: cat, kind: 'walk', to: dog, gait: 'walk' } as const;
        const run = { ...walk, gait: 'run' } as const;
        const slow = natural(stage, { kind: 'naturalDuration', action: walk, at: 0 });
        expect(slow).toBeGreaterThan(micros(0.5));
        expect(natural(stage, { kind: 'naturalDuration', action: run, at: 0 })).toBeLessThan(slow);
        const turn = { object: cat, kind: 'turnToFace', target: dog } as const;
        expect(natural(stage, { kind: 'naturalDuration', action: turn, at: 0 })).toBe(0);
      });

      it('walk to a thing and stop in front of it, facing it', async () => {
        const stage = await loaded();
        stage.schedule([cmd(0, 2, { object: cat, kind: 'walk', to: dog, gait: 'walk' })]);
        stage.seek(micros(2));
        const { position, rotation } = where(stage);
        // The dog's block starts 0.25 m to the side of it; the cat stops a step from that.
        expect(position.x).toBeCloseTo(1 - 0.25 - 0.35, 5);
        expect(heading(rotation)).toBeCloseTo(0.25, 3);
        stage.seek(micros(1));
        expect(where(stage).position.x).toBeGreaterThan(-0.9);
        expect(where(stage).position.x).toBeLessThan(0.35);
      });

      it('walk out of the picture past an edge, and in again from another', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 3, { object: cat, kind: 'walk', to: { edge: 'left' }, gait: 'run' }),
          cmd(4, 3, { object: dog, kind: 'enter', from: 'right', gait: 'walk' }),
        ]);
        stage.seek(micros(3));
        // +X is the picture's left, and the camera sees about 3 m each side at this distance.
        expect(where(stage).position.x).toBeGreaterThan(4);
        stage.seek(micros(4));
        expect(where(stage, dog).position.x).toBeLessThan(-4);
        stage.seek(micros(7));
        expect(where(stage, dog).position.x).toBeCloseTo(1, 5);
      });

      it('pick a thing up, carry it, and put it down', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 1, { object: cat, kind: 'pickUp', target: dog }),
          cmd(1, 1, { object: cat, kind: 'translate', by: { x: 0, y: 0, z: 3 }, space: 'scene' }),
          cmd(2, 1, { object: cat, kind: 'putDown', target: dog }),
        ]);
        stage.seek(micros(0.25));
        expect(stage.answer({ kind: 'vehicle', object: dog, at: stage.time() }).value).toBeNull();
        stage.seek(micros(1));
        expect(stage.answer({ kind: 'vehicle', object: dog, at: stage.time() }).value).toBe(cat);
        stage.seek(micros(2));
        expect(where(stage, dog).position.z).toBeGreaterThan(2.5);
        stage.seek(micros(3));
        expect(stage.answer({ kind: 'vehicle', object: dog, at: stage.time() }).value).toBeNull();
        expect(where(stage, dog).position.y).toBeCloseTo(0, 5);
        expect(where(stage, dog).position.z).toBeGreaterThan(3);
      });

      it('sit on a thing, and get off it again', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 1, { object: cat, kind: 'posture', posture: 'sit', on: dog }),
          cmd(2, 1, { object: cat, kind: 'posture', posture: 'stand' }),
        ]);
        stage.seek(micros(1));
        // A block has no hips, so it sits where the seat is. Something taller than 0.7 m is
        // taken to be a chair, with its seat a little under half way up.
        expect(where(stage).position.y).toBeCloseTo(0.45, 5);
        stage.seek(micros(3));
        expect(where(stage).position.y).toBeCloseTo(0, 5);
      });

      it('change only what they say, and the same way every time', async () => {
        const a = await loaded();
        const b = await loaded();
        const before = a.stateHash();
        const batch = () => [
          cmd(0, 1, { object: cat, kind: 'lookAt', target: dog }),
          cmd(0, 0.3, { object: cat, kind: 'expression', expression: 'happy' }),
          cmd(1, 1, { object: cat, kind: 'reach', target: dog, then: 'stay' }),
        ];
        a.schedule(batch());
        b.schedule(batch());
        for (const s of [a, b]) s.seek(micros(2));
        expect(a.stateHash()).not.toBe(before);
        expect(a.stateHash()).toBe(b.stateHash());
        expect(where(a).position.x).toBeCloseTo(-1, 9);
      });

      it('refuse a clip the model and the library do not have, or holding itself', async () => {
        const stage = await loaded();
        expect(() =>
          stage.schedule([cmd(0, 1, { object: cat, kind: 'clip', clip: 'tango' })]),
        ).toThrow(/tango/);
        expect(() =>
          stage.schedule([cmd(0, 1, { object: cat, kind: 'pickUp', target: cat })]),
        ).toThrow(/hold/);
      });
    });

    describe('targets', () => {
      it('can be a joint, where it rests on its object', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 1, { object: cat, kind: 'moveTo', target: { object: dog, joint: head } }),
        ]);
        stage.seek(micros(1));
        close(stage.transform(cat).position.x, 1);
        expect(stage.transform(cat).position.y).toBeGreaterThan(0.5);
        const q = {
          kind: 'distance',
          from: cat,
          to: { object: dog, joint: head },
          at: micros(1),
        } as const;
        close(stage.answer(q).value as number, 0);
      });

      it('refuses a joint the object does not have', async () => {
        const stage = await loaded();
        const nothing = { object: dog, joint: jointName('noSuchJoint') };
        expect(() =>
          stage.schedule([cmd(0, 1, { object: cat, kind: 'turnToFace', target: nothing })]),
        ).toThrow(StageError);
      });
    });

    describe('moving', () => {
      it('moves toward a target, and away with a negative amount', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 1, { object: cat, kind: 'moveToward', target: dog, amount: 0.5 }),
          cmd(1, 1, { object: cat, kind: 'moveToward', target: dog, amount: -2 }),
        ]);
        stage.seek(micros(1));
        close(stage.transform(cat).position.x, -0.5);
        stage.seek(micros(2));
        close(stage.transform(cat).position.x, -2.5);
      });

      it('takes on a marker’s place and the way it faces', async () => {
        const quarter = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
        const stage = await loaded({
          ...SETUP,
          markers: [{ id: 'spot', transform: { ...at(3, 0, 3), rotation: quarter } }],
        });
        stage.schedule([
          cmd(0, 1, { object: cat, kind: 'moveAndOrientTo', target: objectId('spot') }),
        ]);
        stage.seek(micros(0.5));
        close(stage.transform(cat).position.x, 1);
        stage.seek(micros(1));
        close(stage.transform(cat).position.z, 3);
        close(heading(stage.transform(cat).rotation), 0.25);
      });

      it('finds the camera a good view of its target, looking at it', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 1, { object: CAMERA, kind: 'moveAndOrientTo', target: dog, goodView: true }),
        ]);
        stage.seek(micros(1));
        const camera = stage.transform(CAMERA);
        // The dog faces +Z, so the camera is in front of it and faces back towards it.
        expect(camera.position.z).toBeGreaterThan(0.5);
        close(camera.position.x, 1);
        close(Math.abs(heading(camera.rotation)), 0.5);
      });

      it('places one thing beside another by their sizes, with a gap', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 1, { object: cat, kind: 'place', relation: 'leftOf', target: dog, gap: 0.5 }),
        ]);
        stage.seek(micros(1));
        // A stand-in is half a metre wide, and left is +X (spec 02, Directions).
        close(stage.transform(cat).position.x, 2);
        stage.schedule([
          cmd(1, 1, { object: cat, kind: 'place', relation: 'above', target: dog, gap: 0 }),
        ]);
        stage.seek(micros(2));
        close(stage.transform(cat).position.x, 1);
        close(stage.transform(cat).position.y, 1);
      });
    });

    describe('turning', () => {
      const tilt = cmd(0, 0, {
        object: cat,
        kind: 'rotate',
        axis: { x: 1, y: 0, z: 0 },
        turns: 0.1,
        space: 'scene',
      });

      it('stands back upright, still facing the same way', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 0, {
            object: cat,
            kind: 'rotate',
            axis: { x: 0, y: 1, z: 0 },
            turns: 0.25,
            space: 'scene',
          }),
          { ...tilt, seq: tilt.seq, start: micros(0.1) },
          cmd(1, 1, { object: cat, kind: 'orient', to: 'upright' }),
        ]);
        stage.seek(micros(2));
        const r = stage.transform(cat).rotation;
        close(heading(r), 0.25);
        close(Math.abs(r.x) + Math.abs(r.z), 0);
      });

      it('points at a target, and lines up with one', async () => {
        const stage = await loaded();
        stage.schedule([cmd(0, 1, { object: cat, kind: 'orient', to: { pointAt: dog } })]);
        stage.seek(micros(1));
        close(heading(stage.transform(cat).rotation), 0.25);
        stage.schedule([tilt, cmd(1, 1, { object: cat, kind: 'orient', to: { lineUpWith: dog } })]);
        stage.seek(micros(2));
        const r = stage.transform(cat).rotation;
        close(Math.abs(r.w), 1);
      });
    });

    describe('sizes', () => {
      it('sets a height and keeps the shape, and answers with the new size', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 1, {
            object: cat,
            kind: 'setSize',
            dimension: 'height',
            to: 2,
            policy: 'preserveAspectRatio',
          }),
        ]);
        stage.seek(micros(1));
        close(stage.transform(cat).scale.x, 2);
        const size = stage.answer({ kind: 'size', object: cat, at: micros(1) }).value as Vec3;
        close(size.y, 2);
        close(size.x, 1);
      });

      it('keeps the volume, or nothing, if asked', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 0, {
            object: cat,
            kind: 'setSize',
            dimension: 'width',
            to: 2,
            policy: 'preserveVolume',
          }),
          cmd(0, 0, {
            object: dog,
            kind: 'setSize',
            dimension: 'depth',
            to: 1,
            policy: 'preserveNothing',
          }),
        ]);
        stage.seek(0);
        const cats = stage.transform(cat).scale;
        close(cats.x * cats.y * cats.z, 1);
        close(cats.x, 4);
        expect(stage.transform(dog).scale).toEqual({ x: 1, y: 1, z: 2 });
      });
    });

    describe('looks', () => {
      it('blends a paint over its duration, and answers with it', async () => {
        const stage = await loaded();
        stage.schedule([cmd(0, 1, { object: cat, kind: 'paint', paint: 'red' })]);
        stage.seek(micros(0.5));
        const half = stage.stateHash();
        stage.seek(micros(1));
        expect(stage.stateHash()).not.toBe(half);
        const look = stage.answer({ kind: 'look', object: cat, at: micros(1) }).value as Look;
        expect(look).toEqual({ paint: 'red', opacity: 1, backPaint: null, text: null });
      });

      it('straightens every joint', async () => {
        const stage = await loaded();
        const start = stage.stateHash();
        stage.schedule([
          cmd(0, 1, {
            object: cat,
            kind: 'joint',
            joint: head,
            axis: { x: 0, y: 1, z: 0 },
            turns: 0.2,
          }),
          cmd(1, 1, { object: cat, kind: 'pose', pose: 'straight' }),
        ]);
        stage.seek(micros(1.5));
        expect(stage.stateHash()).not.toBe(start);
        stage.seek(micros(2));
        const q = stage.answer({
          kind: 'transform',
          object: { object: cat, joint: head },
          at: micros(2),
        });
        close(Math.abs((q.value as Transform).rotation.w), 1);
      });

      it('answers with an object’s vehicle', async () => {
        const stage = await loaded();
        stage.schedule([cmd(1, 0, { object: cat, kind: 'vehicle', vehicle: dog })]);
        expect(stage.answer({ kind: 'vehicle', object: cat, at: 0 }).value).toBeNull();
        expect(stage.answer({ kind: 'vehicle', object: cat, at: micros(1) }).value).toBe(dog);
      });

      it('gives only a billboard a back paint, and only 3D text words', async () => {
        const stage = await loaded();
        expect(() =>
          stage.schedule([cmd(0, 0, { object: cat, kind: 'backPaint', paint: 'red' })]),
        ).toThrow(StageError);
        expect(() =>
          stage.schedule([cmd(0, 0, { object: cat, kind: 'text', text: 'Hi' })]),
        ).toThrow(StageError);
      });
    });

    describe('pictures', () => {
      it('are the size asked for, and leave the scene where it was', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 2, { object: cat, kind: 'translate', by: { x: 3, y: 0, z: 0 }, space: 'scene' }),
        ]);
        stage.seek(micros(0.5));
        const before = stage.stateHash();
        const heard: string[] = [];
        stage.onEvent((e) => heard.push(e.kind));
        const picture = await stage.picture(micros(2), 160, 90);
        expect([picture.width, picture.height, picture.data.length]).toEqual([
          160,
          90,
          160 * 90 * 4,
        ]);
        expect(stage.time()).toBe(micros(0.5));
        expect(stage.stateHash()).toBe(before);
        expect(heard).toEqual([]);
      });

      it('are the same for the same moment', async () => {
        const stage = await loaded();
        const a = await stage.picture(micros(1), 8, 8);
        const b = await stage.picture(micros(1), 8, 8);
        expect(Array.from(b.data)).toEqual(Array.from(a.data));
      });

      it('refuse a size they cannot draw', async () => {
        const stage = await loaded();
        for (const [w, h] of [
          [0, 90],
          [160, 4097],
          [1.5, 90],
        ] as const)
          await expect(stage.picture(0, w, h)).rejects.toMatchObject({ code: 'bad_argument' });
      });
    });

    describe('shots', () => {
      const shot = (name: ShotType, ...targets: ObjectId[]) =>
        cmd(0, 1, { object: CAMERA, kind: 'shot', shot: name, targets });
      const frame = async (name: ShotType, ...targets: ObjectId[]) => {
        const stage = await loaded();
        stage.schedule([shot(name, ...targets)]);
        stage.seek(micros(1));
        return { stage, camera: stage.transform(CAMERA) };
      };
      /** Where a point is as the camera sees it: +Z is straight ahead. */
      const seen = (camera: Transform, point: Vec3) => {
        const d = {
          x: point.x - camera.position.x,
          y: point.y - camera.position.y,
          z: point.z - camera.position.z,
        };
        const q = camera.rotation;
        return rotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, d);
      };

      it('look at the front of their target, nearer for a closer shot', async () => {
        const distances: number[] = [];
        for (const name of ['wide', 'medium', 'closeUp'] as const) {
          const { camera } = await frame(name, dog);
          // The dog faces +Z, so the camera is in front of it, looking back at it.
          expect(camera.position.z).toBeGreaterThan(0.5);
          const there = seen(camera, { x: 1, y: 0.5, z: 0 });
          close(there.x, 0);
          expect(there.z).toBeGreaterThan(0);
          distances.push(camera.position.z);
        }
        expect(distances[0]).toBeGreaterThan(distances[1]!);
        expect(distances[1]).toBeGreaterThan(distances[2]!);
      });

      it('aim a close-up nearer the top than a wide shot', async () => {
        const wide = (await frame('wide', dog)).camera.position.y;
        const closeUp = (await frame('closeUp', dog)).camera.position.y;
        expect(closeUp).toBeGreaterThan(wide);
      });

      it('put both of a two-shot in front of the camera, seen side by side', async () => {
        const { camera } = await frame('twoShot', cat, dog);
        const a = seen(camera, { x: -1, y: 0.5, z: 0 });
        const b = seen(camera, { x: 1, y: 0.5, z: 0 });
        expect(a.z).toBeGreaterThan(0);
        close(a.z, b.z);
        expect(Math.sign(a.x)).toBe(-Math.sign(b.x));
      });

      it('look over the first target’s shoulder at the second', async () => {
        const { camera } = await frame('overTheShoulder', cat, dog);
        const cats = seen(camera, { x: -1, y: 0.5, z: 0 });
        const dogs = seen(camera, { x: 1, y: 0.85, z: 0 });
        expect(dogs.z).toBeGreaterThan(cats.z);
        expect(cats.z).toBeGreaterThan(0);
        expect(Math.abs(dogs.x / dogs.z)).toBeLessThan(0.1);
      });

      it('follow a target as it moves on after the shot', async () => {
        const stage = await loaded();
        stage.schedule([
          shot('follow', dog),
          cmd(1, 1, { object: dog, kind: 'translate', by: { x: 0, y: 0, z: 3 }, space: 'scene' }),
        ]);
        stage.seek(micros(1));
        const before = stage.transform(CAMERA).position;
        // Behind the dog, which faces +Z.
        expect(before.z).toBeLessThan(0);
        stage.seek(micros(2));
        close(stage.transform(CAMERA).position.z - before.z, 3);
      });

      it('are only the camera’s, and a two-shot needs two', async () => {
        const stage = await loaded();
        expect(() =>
          stage.schedule([cmd(0, 1, { object: cat, kind: 'shot', shot: 'wide', targets: [dog] })]),
        ).toThrow(StageError);
        expect(() =>
          stage.schedule([
            cmd(0, 1, { object: CAMERA, kind: 'shot', shot: 'twoShot', targets: [dog] }),
          ]),
        ).toThrow(StageError);
      });
    });

    describe('the sky and the lens', () => {
      it('fades the picture to black, as part of the scene', async () => {
        const stage = await loaded();
        const start = stage.stateHash();
        stage.schedule([cmd(0, 2, { object: SCENE, kind: 'fade', to: 1 })]);
        stage.seek(micros(1));
        const half = stage.stateHash();
        stage.seek(micros(2));
        expect(new Set([start, half, stage.stateHash()]).size).toBe(3);
        for (const wrong of [
          cmd(0, 1, { object: cat, kind: 'fade', to: 1 }),
          cmd(0, 1, { object: SCENE, kind: 'fade', to: 1.5 }),
        ])
          expect(() => stage.schedule([wrong])).toThrow(StageError);
      });

      it('changes the sky colour and fog over time, and answers with them', async () => {
        const stage = await loaded({ ...SETUP, backdrop: { fog: 0 } });
        const sky = (t: number) =>
          stage.answer({ kind: 'sceneLook', at: micros(t) }).value as SceneLook;
        const start = sky(0).atmosphere;
        stage.schedule([
          cmd(0, 1, { object: SCENE, kind: 'atmosphere', colour: '#000000' }),
          cmd(0, 1, { object: SCENE, kind: 'fog', density: 0.5 }),
          cmd(0, 0, { object: SCENE, kind: 'light', from: 'below', colour: 'red' }),
        ]);
        expect(sky(1).atmosphere).toBe('#000000');
        expect(sky(0.5).atmosphere).not.toBe(start);
        close(sky(1).fog, 0.5);
        close(sky(0.5).fog, 0.25);
        expect(sky(0).fromBelow).toBe('#ff0000');
      });

      it('changes the camera’s viewing angle', async () => {
        const stage = await loaded();
        close(stage.answer({ kind: 'lens', at: 0 }).value as number, 0.5 / (2 * Math.PI));
        stage.schedule([cmd(0, 1, { object: CAMERA, kind: 'lens', verticalAngle: 0.1 })]);
        close(stage.answer({ kind: 'lens', at: micros(1) }).value as number, 0.1);
      });

      it('keeps the sky to the scene and the lens to the camera', async () => {
        const stage = await loaded();
        for (const wrong of [
          cmd(0, 0, { object: cat, kind: 'fog', density: 0.5 }),
          cmd(0, 0, { object: SCENE, kind: 'translate', by: { x: 1, y: 0, z: 0 }, space: 'scene' }),
          cmd(0, 0, { object: cat, kind: 'lens', verticalAngle: 0.1 }),
          cmd(0, 0, { object: SCENE, kind: 'fog', density: 2 }),
        ])
          expect(() => stage.schedule([wrong])).toThrow(StageError);
        expect(stage.objects()).not.toContain(SCENE);
      });
    });

    it('forgets every command on reset, and on load', async () => {
      const stage = await loaded();
      const start = stage.stateHash();
      stage.schedule([
        cmd(0, 1, { object: cat, kind: 'translate', by: { x: 1, y: 0, z: 0 }, space: 'scene' }),
      ]);
      stage.reset();
      stage.seek(micros(2));
      expect(stage.stateHash()).toBe(start);
      stage.schedule([
        cmd(0, 1, { object: cat, kind: 'translate', by: { x: 1, y: 0, z: 0 }, space: 'scene' }),
      ]);
      await stage.load(SETUP);
      stage.seek(micros(2));
      expect(stage.stateHash()).toBe(start);
    });

    it('lets a late command that starts earlier change what later ones work out', async () => {
      const stage = await loaded();
      stage.schedule([cmd(1, 1, { object: cat, kind: 'moveTo', target: dog })]);
      stage.seek(micros(2));
      close(stage.transform(cat).position.z, 0);
      stage.schedule([
        cmd(0, 1, { object: dog, kind: 'translate', by: { x: 0, y: 0, z: 4 }, space: 'scene' }),
      ]);
      stage.seek(micros(2));
      close(stage.transform(cat).position.z, 4);
    });

    describe('vehicles', () => {
      const push = (start: number, seconds: number, by: Vec3) =>
        cmd(start, seconds, { object: dog, kind: 'translate', by, space: 'scene' });
      const board = (start: number, vehicle: ObjectId | null) =>
        cmd(start, 0, { object: cat, kind: 'vehicle', vehicle });

      it('carries a rider, and leaves it where it got off', async () => {
        const stage = await loaded();
        stage.schedule([
          board(0, dog),
          push(0, 1, { x: 0, y: 0, z: 3 }),
          board(1, null),
          push(1, 1, { x: 0, y: 0, z: 3 }),
        ]);
        stage.seek(micros(0.5));
        close(stage.transform(cat).position.z, 1.5);
        close(stage.transform(cat).position.x, -1);
        stage.seek(micros(2));
        close(stage.transform(cat).position.z, 3);
        close(stage.transform(dog).position.z, 6);
      });

      it('swings a rider round when its vehicle turns', async () => {
        const stage = await loaded();
        stage.schedule([
          board(0, dog),
          cmd(0, 1, {
            object: dog,
            kind: 'rotate',
            axis: { x: 0, y: 1, z: 0 },
            turns: 0.25,
            space: 'scene',
          }),
          cmd(1, 1, { object: cat, kind: 'translate', by: { x: 0, y: 0, z: 1 }, space: 'self' }),
        ]);
        stage.seek(micros(1));
        // The cat is 2 m to the dog's -X. A quarter turn about +Y takes -X to +Z.
        close(stage.transform(cat).position.x, 1);
        close(stage.transform(cat).position.z, 2);
        stage.seek(micros(2));
        // It now faces +X, as the dog does, so forward is +X.
        close(stage.transform(cat).position.x, 2);
        close(stage.transform(cat).position.z, 2);
      });

      it('picks a rider up from the moment it boards a moving vehicle', async () => {
        const stage = await loaded();
        stage.schedule([push(0, 2, { x: 0, y: 0, z: 4 }), board(1, dog)]);
        stage.seek(micros(1));
        close(stage.transform(cat).position.z, 0);
        stage.seek(micros(2));
        close(stage.transform(cat).position.z, 2);
      });

      it('keeps a move going when the object boards in the middle of it', async () => {
        const stage = await loaded();
        stage.schedule([
          cmd(0, 2, { object: cat, kind: 'translate', by: { x: 0, y: 2, z: 0 }, space: 'scene' }),
          board(1, dog),
        ]);
        stage.seek(micros(2));
        close(stage.transform(cat).position.y, 2);
        close(stage.transform(cat).position.x, -1);
      });

      it('starts a rider on its vehicle, where the set-up says it is', async () => {
        const [first, second] = SETUP.objects;
        const stage = await loaded({
          ...SETUP,
          objects: [{ ...first!, vehicle: dog }, second!],
        });
        close(stage.transform(cat).position.x, -1);
        stage.schedule([push(0, 1, { x: 0, y: 2, z: 0 })]);
        stage.seek(micros(1));
        close(stage.transform(cat).position.y, 2);
      });

      it('refuses a rider on itself, a vehicle that is not there, and a loop', async () => {
        const stage = await loaded();
        expect(() => stage.schedule([board(0, cat)])).toThrow(StageError);
        const [first, second] = SETUP.objects;
        await expect(
          (await make()).load({ ...SETUP, objects: [{ ...first!, vehicle: objectId('bus') }] }),
        ).rejects.toMatchObject({ code: 'bad_argument' });
        await expect(
          (await make()).load({
            ...SETUP,
            objects: [
              { ...first!, vehicle: dog },
              { ...second!, vehicle: cat },
            ],
          }),
        ).rejects.toMatchObject({ code: 'bad_argument' });
      });

      it('ignores a ride that would loop back to the rider', async () => {
        const stage = await loaded();
        stage.schedule([
          board(0, dog),
          cmd(1, 0, { object: dog, kind: 'vehicle', vehicle: cat }),
          push(2, 1, { x: 0, y: 1, z: 0 }),
        ]);
        stage.seek(micros(3));
        close(stage.transform(dog).position.y, 1);
        close(stage.transform(cat).position.y, 1);
      });
    });

    describe('markers', () => {
      const spot = objectId('spot');
      const marked: SceneSetup = {
        ...SETUP,
        markers: [{ id: 'spot', transform: at(0, 1, 5) }],
      };

      it('are places to go to and look at, not objects', async () => {
        const stage = await loaded(marked);
        expect(stage.objects()).not.toContain(spot);
        stage.schedule([
          cmd(0, 1, { object: CAMERA, kind: 'moveTo', target: spot }),
          cmd(0, 1, { object: cat, kind: 'turnToFace', target: spot }),
        ]);
        stage.seek(micros(1));
        close(stage.transform(CAMERA).position.y, 1);
        close(stage.transform(CAMERA).position.z, 5);
        close(heading(stage.transform(cat).rotation), Math.atan2(1, 5) / (2 * Math.PI));
      });

      it('give their own axes to "as seen by"', async () => {
        const turned: SceneSetup = {
          ...SETUP,
          markers: [
            {
              id: 'spot',
              transform: {
                ...IDENTITY,
                rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
              },
            },
          ],
        };
        const stage = await loaded(turned);
        stage.schedule([
          cmd(0, 1, {
            object: cat,
            kind: 'translate',
            by: { x: 0, y: 0, z: 1 },
            space: { asSeenBy: spot },
          }),
        ]);
        stage.seek(micros(1));
        close(stage.transform(cat).position.x, 0);
      });
    });

    it('renders the same image for the same scene', async () => {
      const stage = await loaded();
      stage.schedule([
        cmd(0, 1, { object: cat, kind: 'translate', by: { x: 1, y: 0, z: 0 }, space: 'scene' }),
      ]);
      stage.seek(micros(0.5));
      const a = await stage.renderFrame();
      stage.seek(micros(0.9));
      stage.seek(micros(0.5));
      const b = await stage.renderFrame();
      expect(b.width).toBe(a.width);
      expect(Array.from(b.data)).toEqual(Array.from(a.data));
    });
  });
}
