/**
 * The scene view's contract (07-ux section 7.2): every `EditableStage` runs it, `FakeStage` here
 * and the Babylon.js stage once it's one. The fixture is `SETUP`: a cat at x = -1 and a dog at
 * x = 1, stand-ins a metre tall, with the camera 6 m back and 2 m up looking along +Z, on a view
 * 640 by 360 pixels.
 */
import {
  CAMERA,
  IDENTITY,
  StageError,
  micros,
  objectId,
  type SceneSetup,
  type Transform,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { EditableStage } from '../contract.ts';
import { SETUP, cmd } from './conformance.ts';

const cat = objectId('cat');
const dog = objectId('dog');
const at = (x: number, y: number, z: number): Transform => ({ ...IDENTITY, position: { x, y, z } });
const WITH_MARKER: SceneSetup = { ...SETUP, markers: [{ id: 'door', transform: at(0, 1, 0) }] };

/** Where the cat's body is on the view: right of the middle, since +X is on the picture's left. */
const CAT = { x: 437, y: 327 };

export function describeEditableStageContract(
  name: string,
  make: () => EditableStage | Promise<EditableStage>,
) {
  describe(`${name} meets the scene view's contract`, () => {
    const loaded = async (setup: SceneSetup = SETUP) => {
      const stage = await make();
      await stage.load(setup);
      return stage;
    };

    it('picks an object, and the ground where the pointer meets it', async () => {
      const stage = await loaded();
      const { target, ground } = stage.pick(CAT.x, CAT.y);
      expect(target).toEqual({ object: cat });
      expect(ground!.y).toBeCloseTo(0, 5);
      // Beyond the cat, along the same line of sight.
      expect(ground!.z).toBeGreaterThan(0);
      expect(ground!.x).toBeLessThan(-1);
    });

    it('picks nothing, and no ground, in the sky', async () => {
      const stage = await loaded();
      expect(stage.pick(320, 5)).toEqual({ target: null, ground: null });
    });

    it('picks the ground alone where nothing stands', async () => {
      const stage = await loaded();
      const { target, ground } = stage.pick(320, 355);
      expect(target).toBeNull();
      expect(ground!.y).toBeCloseTo(0, 5);
      expect(Math.abs(ground!.x)).toBeLessThan(0.1);
    });

    it('picks a marker only while editing', async () => {
      const stage = await loaded(WITH_MARKER);
      // The marker is 1 m up, straight ahead: a little below the middle of the view.
      const y = 180 + Math.round((1 / (6 * Math.tan(0.25))) * 180);
      expect(stage.pick(320, y).target).toBeNull();
      stage.editing(true);
      expect(stage.pick(320, y).target).toEqual({ marker: 'door' });
    });

    it("changes an object's set-up without reloading, and keeps its commands", async () => {
      const stage = await loaded();
      stage.schedule([cmd(0, 1, { object: cat, kind: 'moveTo', target: dog })]);
      stage.setObject(dog, { transform: at(3, 0, 0) });
      expect(stage.transform(dog).position.x).toBeCloseTo(3, 5);
      // The move now goes to where the dog is.
      stage.seek(micros(1));
      expect(stage.transform(cat).position.x).toBeCloseTo(3, 5);
      stage.seek(0);
      expect(stage.transform(cat).position.x).toBeCloseTo(-1, 5);
    });

    it("moves the camera's set-up, and only its place", async () => {
      const stage = await loaded();
      stage.setObject(CAMERA, { transform: at(0, 3, -8) });
      expect(stage.transform(CAMERA).position.z).toBeCloseTo(-8, 5);
      expect(() => stage.setObject(CAMERA, { opacity: 0.5 })).toThrow(StageError);
    });

    it('changes nothing for a change it refuses', async () => {
      const stage = await loaded();
      const before = stage.stateHash();
      for (const bad of [
        () => stage.setObject(objectId('owl'), { opacity: 1 }),
        () => stage.setObject(cat, { paint: 'nonsense' }),
        () => stage.setObject(cat, { opacity: 2 }),
        () => stage.setObject(cat, { transform: { ...at(0, 0, 0), scale: { x: 0, y: 1, z: 1 } } }),
      ])
        expect(bad).toThrow(StageError);
      expect(stage.stateHash()).toBe(before);
    });

    it('says at once what the scene camera sees, after a change', async () => {
      const stage = await loaded();
      expect(stage.inShot()).toEqual([cat, dog]);
      // Behind the camera, and then faded to nothing.
      stage.setObject(dog, { transform: at(1, 0, -10) });
      expect(stage.inShot()).toEqual([cat]);
      stage.setObject(cat, { opacity: 0 });
      expect(stage.inShot()).toEqual([]);
    });

    it('moves a marker', async () => {
      const stage = await loaded(WITH_MARKER);
      stage.setMarker('door', at(4, 0, 4));
      const r = stage.answer({ kind: 'distance', from: CAMERA, to: objectId('door'), at: 0 });
      expect(r.value).toBeCloseTo(Math.hypot(4, 2, 10), 5);
      expect(() => stage.setMarker('window', at(0, 0, 0))).toThrow(StageError);
    });

    it('chooses what is there, and refuses what is not', async () => {
      const stage = await loaded(WITH_MARKER);
      stage.choose({ object: cat });
      stage.choose({ marker: 'door' });
      stage.choose({ object: CAMERA });
      stage.choose(null);
      expect(() => stage.choose({ object: objectId('owl') })).toThrow(StageError);
      expect(() => stage.choose({ marker: 'window' })).toThrow(StageError);
    });

    it('goes back to the set-up when editing starts', async () => {
      const stage = await loaded();
      stage.schedule([cmd(0, 1, { object: cat, kind: 'moveTo', target: dog })]);
      stage.seek(micros(1));
      stage.editing(true);
      expect(stage.time()).toBe(0);
      expect(stage.transform(cat).position.x).toBeCloseTo(-1, 5);
    });

    it("looks around from the scene camera's place, and back", async () => {
      const stage = await loaded();
      const camera = stage.transform(CAMERA);
      stage.lookAround(true);
      expect(stage.viewTransform()).toEqual(camera);
      stage.lookAround(false);
      expect(stage.viewTransform()).toEqual(camera);
    });

    it('stops listening when asked', async () => {
      const stage = await loaded();
      const stopEdit = stage.onEdit(() => {});
      const stopTap = stage.onTap(() => {});
      stopEdit();
      stopTap();
    });
  });
}
