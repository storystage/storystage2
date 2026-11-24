/**
 * The Babylon.js stage's scene view (07-ux section 7.2), through the pointer and keys as the
 * canvas's listeners give them. The contract itself is `describeEditableStageContract`, which
 * `stage.test.ts` runs. The fixture is `SETUP` on a 640 by 360 view: the cat's body is at
 * (437, 327), right of the middle, since +X is on the picture's left.
 */
import {
  CAMERA,
  IDENTITY,
  backstageId,
  objectId,
  type SceneSetup,
  type Transform,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { EditEvent, Picked } from '../contract.ts';
import { toView } from '../editing.ts';
import { handlePlaces } from '../handles.ts';
import { heading, v } from '../math.ts';
import { SETUP } from '../testing/conformance.ts';
import { STAND_IN_BOX } from '../timeline.ts';
import { headlessEngine } from './headless.ts';
import { BabylonStage } from './stage.ts';

const cat = objectId('cat');
const CAT = { x: 437, y: 327 };
const at = (x: number, y: number, z: number): Transform => ({ ...IDENTITY, position: v(x, y, z) });

async function editing(setup: SceneSetup = SETUP) {
  const stage = new BabylonStage(headlessEngine());
  await stage.load(setup);
  stage.editing(true);
  const edits: EditEvent[] = [];
  const taps: Picked[] = [];
  stage.onEdit((e) => edits.push(e));
  stage.onTap((p) => taps.push(p));
  return { stage, edits, taps };
}

/** Where a point of the scene is on the view, through the scene's camera. */
function onView(stage: BabylonStage, p: { x: number; y: number; z: number }) {
  return toView(stage.viewTransform(), 0.5 / (2 * Math.PI), 640, 360, p)!;
}

describe("the Babylon.js stage's scene view", () => {
  it('drags the chosen object along the ground, and says where it put it', async () => {
    const { stage, edits } = await editing();
    stage.choose({ object: cat });
    expect(stage.pointerDown(CAT.x, CAT.y)).toBe(true);
    stage.pointerMove(CAT.x - 60, CAT.y);
    stage.pointerMove(CAT.x - 120, CAT.y);
    stage.pointerUp(CAT.x - 120, CAT.y);
    expect(edits.map((e) => e.final)).toEqual([false, false, true]);
    const put = edits.at(-1)!.transform;
    // Dragged left on the view, it goes to +X, along the ground.
    expect(put.position.x).toBeGreaterThan(-0.5);
    expect(put.position.y).toBe(0);
    // The set-up has it there at once.
    expect(stage.transform(cat)).toEqual(put);
  });

  it('lifts it with Shift', async () => {
    const { stage, edits } = await editing();
    stage.choose({ object: cat });
    stage.pointerDown(CAT.x, CAT.y, { shift: true });
    stage.pointerMove(CAT.x, CAT.y - 40, { shift: true });
    stage.pointerUp(CAT.x, CAT.y - 40);
    const put = edits.at(-1)!.transform;
    expect(put.position.y).toBeGreaterThan(0.2);
    expect(put.position.x).toBeCloseTo(-1, 9);
  });

  it('turns it by its ring, and resizes it by its knob', async () => {
    const { stage, edits } = await editing();
    stage.choose({ object: cat });
    const places = handlePlaces(STAND_IN_BOX, stage.transform(cat), true);
    const r = places.ring.radius;
    const front = onView(stage, v(-1, 0, -r));
    const side = onView(stage, v(-1 - r, 0, 0));
    stage.pointerDown(front.x, front.y);
    stage.pointerMove(side.x, side.y);
    stage.pointerUp(side.x, side.y);
    expect(Math.abs(heading(edits.at(-1)!.transform.rotation))).toBeCloseTo(0.25, 2);
    const knob = onView(stage, places.knob!);
    stage.pointerDown(knob.x, knob.y);
    stage.pointerMove(knob.x, knob.y - 30);
    stage.pointerUp(knob.x, knob.y - 30);
    const grown = edits.at(-1)!.transform.scale;
    expect(grown.x).toBeGreaterThan(1.2);
    expect(grown.x).toBeCloseTo(grown.y, 9);
  });

  it('reports a tap, with what was there, and a press on the chosen object as one', async () => {
    const { stage, taps, edits } = await editing();
    stage.pointerDown(CAT.x, CAT.y);
    stage.pointerUp(CAT.x + 2, CAT.y);
    expect(taps.map((p) => p.target)).toEqual([{ object: cat }]);
    stage.choose({ object: cat });
    stage.pointerDown(CAT.x, CAT.y);
    stage.pointerUp(CAT.x, CAT.y);
    stage.pointerDown(320, 5);
    stage.pointerUp(320, 5);
    expect(taps.map((p) => p.target)).toEqual([{ object: cat }, { object: cat }, null]);
    expect(edits).toEqual([]);
  });

  it('leaves the pointer alone while neither editing nor looking around', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    expect(stage.pointerDown(CAT.x, CAT.y)).toBe(false);
    expect(stage.wheel(100)).toBe(false);
    expect(stage.viewKey('ArrowLeft')).toBe(false);
  });

  it('looks around by dragging, the wheel and the arrow keys, and never moves the camera', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const camera = stage.transform(CAMERA);
    stage.lookAround(true);
    expect(stage.pointerDown(320, 180)).toBe(true);
    stage.pointerMove(420, 180);
    stage.pointerUp(420, 180);
    const dragged = stage.viewTransform();
    // Dragged right, the camera goes to its left, which is +X.
    expect(dragged.position.x).toBeGreaterThan(0);
    expect(stage.wheel(-300)).toBe(true);
    expect(stage.viewKey('ArrowUp')).toBe(true);
    expect(stage.viewKey('a')).toBe(false);
    expect(stage.viewTransform()).not.toEqual(dragged);
    expect(stage.transform(CAMERA)).toEqual(camera);
    stage.lookAround(false);
    expect(stage.viewTransform()).toEqual(camera);
  });

  it('steps for the buttons, as the keys do, only while looking around (owner, 24 Nov)', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const camera = stage.transform(CAMERA);
    expect(stage.viewStep('circleLeft')).toBe(false);
    stage.lookAround(true);
    const steps = [
      'circleLeft',
      'circleRight',
      'riseAndLookDown',
      'dropAndLookUp',
      'zoomIn',
      'zoomOut',
      'panLeft',
      'panRight',
      'panUp',
      'panDown',
    ] as const;
    for (const step of steps) {
      const before = stage.viewTransform();
      expect(stage.viewStep(step)).toBe(true);
      expect(stage.viewTransform()).not.toEqual(before);
    }
    // A step and its key go the same way.
    const keyed = new BabylonStage(headlessEngine());
    await keyed.load(SETUP);
    keyed.lookAround(true);
    stage.lookAround(false);
    stage.lookAround(true);
    stage.viewStep('panLeft');
    keyed.viewKey('ArrowLeft', { shift: true });
    expect(keyed.viewTransform()).toEqual(stage.viewTransform());
    expect(stage.transform(CAMERA)).toEqual(camera);
  });

  it('pans by Shift and the arrows, a Shift-drag, a right-drag and two fingers', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    stage.lookAround(true);
    const start = stage.viewTransform();
    const turnedLike = (a: typeof start, b: typeof start) => expect(a.rotation).toEqual(b.rotation);
    expect(stage.viewKey('ArrowUp', { shift: true })).toBe(true);
    const keyed = stage.viewTransform();
    turnedLike(keyed, start);
    expect(keyed.position.y).toBeGreaterThan(start.position.y);
    // Dragged right with Shift, the camera slides to its left, which is +X, without turning.
    expect(stage.pointerDown(320, 180, { shift: true })).toBe(true);
    stage.pointerMove(420, 180, { shift: true });
    stage.pointerUp(420, 180);
    const shifted = stage.viewTransform();
    turnedLike(shifted, start);
    expect(shifted.position.x).toBeGreaterThan(keyed.position.x);
    expect(stage.pointerDown(320, 180, { button: 2 })).toBe(true);
    stage.pointerMove(220, 180);
    stage.pointerUp(220, 180);
    const right = stage.viewTransform();
    turnedLike(right, start);
    expect(right.position.x).toBeLessThan(shifted.position.x);
    // Two fingers moving together pan; they don't turn it.
    stage.pointerDown(300, 180, { id: 1 });
    stage.pointerDown(340, 180, { id: 2 });
    stage.pointerMove(300, 230, { id: 1 });
    stage.pointerMove(340, 230, { id: 2 });
    stage.pointerUp(300, 230, { id: 1 });
    stage.pointerUp(340, 230, { id: 2 });
    const fingers = stage.viewTransform();
    turnedLike(fingers, start);
    expect(fingers.position.y).toBeGreaterThan(right.position.y);
  });

  it('takes a right press only while looking around, and a press to pan chooses nothing', async () => {
    const { stage, taps } = await editing();
    expect(stage.pointerDown(CAT.x, CAT.y, { button: 2 })).toBe(false);
    stage.lookAround(true);
    expect(stage.pointerDown(CAT.x, CAT.y, { shift: true })).toBe(true);
    stage.pointerUp(CAT.x, CAT.y);
    expect(taps).toEqual([]);
  });

  it("says where a step would put the scene's camera, and changes nothing (Camera view)", async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const camera = stage.transform(CAMERA);
    // With no change, the camera is where it was: the orbit starts exactly at it.
    const { transform: left, around: pivot } = stage.steppedCamera('circleLeft');
    expect(left.position).not.toEqual(camera.position);
    expect(stage.transform(CAMERA)).toEqual(camera);
    // It's where the same step takes Look around's camera from the scene's camera.
    stage.lookAround(true);
    stage.viewStep('circleLeft');
    const around = stage.viewTransform();
    for (const k of ['x', 'y', 'z'] as const)
      expect(left.position[k]).toBeCloseTo(around.position[k], 9);
    expect(left.scale).toEqual(camera.scale);
    // Given back the point it went round, the next step goes round it again.
    const again = stage.steppedCamera('circleLeft', pivot).around;
    for (const k of ['x', 'y', 'z'] as const) expect(again[k]).toBeCloseTo(pivot[k], 9);
  });

  it('draws the outline, the handles and the markers only while editing', async () => {
    const withMarker = { ...SETUP, markers: [{ id: 'door', transform: at(0, 1, 0) }] };
    const stage = new BabylonStage(headlessEngine());
    await stage.load(withMarker);
    stage.choose({ object: cat });
    expect(stage.editMeshes()).toBe(0);
    stage.editing(true);
    // Twelve edges, the ring, the knob, and the marker with its nose.
    expect(stage.editMeshes()).toBe(16);
    await stage.renderFrame();
    expect(stage.editMeshes()).toBe(16);
    stage.choose(null);
    expect(stage.editMeshes()).toBe(2);
    stage.editing(false);
    expect(stage.editMeshes()).toBe(0);
  });

  it('keeps the scene when a load changes only places, paint and fading', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const before = stage.measure();
    const scene = (stage as unknown as { scene: unknown }).scene;
    const moved = { ...SETUP.objects[0]!, transform: at(-2, 0, 0), paint: 'red', opacity: 0.5 };
    await stage.load({ ...SETUP, objects: [moved, SETUP.objects[1]!] });
    expect((stage as unknown as { scene: unknown }).scene).toBe(scene);
    expect(stage.transform(cat).position.x).toBe(-2);
    expect(stage.measure()).toEqual(before);
    // Another model is another scene.
    const owl = { ...moved, model: backstageId('Flyer/Owl') };
    await stage.load({ ...SETUP, objects: [owl, SETUP.objects[1]!] });
    expect((stage as unknown as { scene: unknown }).scene).not.toBe(scene);
  });
});
