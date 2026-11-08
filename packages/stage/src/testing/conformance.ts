/**
 * The stage contract's test suite. Every implementation runs it: `FakeStage` here, and the
 * Babylon.js stage in WP5a (`describeStageContract('BabylonStage', () => new BabylonStage(...))`).
 * The fixture uses stand-ins, so no model files are needed.
 */
import {
  CAMERA,
  IDENTITY,
  StageError,
  jointName,
  micros,
  objectId,
  type ObjectId,
  type SceneSetup,
  type StageCommand,
  type Transform,
  type Vec3,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { Stage } from '../contract.ts';
import { heading } from '../math.ts';

const cat = objectId('cat');
const dog = objectId('dog');
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

    // Until WP4b's stage work: the contract has these, and no stage does them yet.
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
        cmd(0, 1, { object: cat, kind: 'moveToward', target: dog, amount: 1 }),
        cmd(0, 1, {
          object: cat,
          kind: 'moveTo',
          target: { object: dog, joint: jointName('head') },
        }),
      ])
        expect(() => stage.schedule([move, later])).toThrow(/can't do .* yet/);
      stage.seek(micros(1));
      expect(stage.stateHash()).toBe(before);
      expect(() => stage.answer({ kind: 'vehicle', object: cat, at: 0 })).toThrow(StageError);
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
