/**
 * The stage contract's test suite. Every implementation runs it: `FakeStage` here, and the
 * Babylon.js stage in WP5a (`describeStageContract('BabylonStage', () => new BabylonStage(...))`).
 * The fixture uses stand-ins, so no model files are needed.
 */
import {
  CAMERA,
  IDENTITY,
  StageError,
  micros,
  objectId,
  type SceneSetup,
  type StageCommand,
  type Transform,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { Stage } from '../contract.ts';

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
    const loaded = async () => {
      const stage = await make();
      await stage.load(SETUP);
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
