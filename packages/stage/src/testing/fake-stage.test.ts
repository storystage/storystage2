import {
  CAMERA,
  StageError,
  backstageId,
  jointName,
  micros,
  objectId,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { SETUP, cmd, describeStageContract } from './conformance.ts';
import { describeEditableStageContract } from './editing-conformance.ts';
import { FakeStage } from './fake-stage.ts';

describeStageContract('FakeStage', () => new FakeStage());
describeEditableStageContract('FakeStage', () => new FakeStage());

const cat = objectId('cat');
const dog = objectId('dog');

describe('FakeStage', () => {
  it('records the calls made to it', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    stage.seek(micros(1));
    expect(stage.calls.map((c) => c.method)).toEqual(['load', 'seek']);
    expect(stage.calls[1]!.args).toEqual([micros(1)]);
  });

  it('lets a test fire stage events, and stop listening', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    const heard: string[] = [];
    const stop = stage.onEvent((e) => heard.push(e.kind));
    stage.emit({ kind: 'click', object: cat, x: 0.5, y: 0.5, at: 0 });
    stop();
    stage.emit({ kind: 'click', object: dog, x: 0.5, y: 0.5, at: 0 });
    expect(heard).toEqual(['click']);
  });

  it('gives actors a head and neck, and refuses a joint an object does not have', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    expect(stage.joints(cat)).toEqual([jointName('head'), jointName('neck')]);
    stage.schedule([
      cmd(0, 1, {
        object: cat,
        kind: 'joint',
        joint: jointName('head'),
        axis: { x: 0, y: 1, z: 0 },
        turns: 0.1,
      }),
    ]);
    expect(() =>
      stage.schedule([
        cmd(0, 1, {
          object: cat,
          kind: 'joint',
          joint: jointName('tail'),
          axis: { x: 0, y: 1, z: 0 },
          turns: 0.1,
        }),
      ]),
    ).toThrow(StageError);
  });

  it('plays on past a model it is told does not exist, and says so (spec 03, 1.3)', async () => {
    const stage = new FakeStage({ knownModels: [backstageId('Quadruped/Cat/AbyssinianCat')] });
    const dragon = backstageId('Dragon/Big');
    const setup = {
      ...SETUP,
      objects: [{ ...SETUP.objects[0]!, model: dragon }, SETUP.objects[1]!],
    };
    await stage.load(setup);
    expect(stage.objects()).toContain(SETUP.objects[0]!.id);
    expect(stage.missing()).toEqual([
      { kind: 'model', object: SETUP.objects[0]!.id, model: dragon },
    ]);
  });

  it('says a picture sky its Backstage lacks is missing, but not a ground (spec 17 §2)', async () => {
    const clearDay = backstageId('storystage/Sky/clearDay');
    const backdrop = {
      ground: backstageId('storystage/Ground/grass'),
      sky: clearDay,
      lighting: backstageId('storystage/Lighting/clearDay'),
    };
    const without = new FakeStage({ knownModels: [] });
    await without.load({ ...SETUP, objects: [], backdrop });
    expect(without.missing()).toEqual([{ kind: 'backdrop', id: clearDay }]);
    const withIt = new FakeStage({ knownModels: [clearDay] });
    await withIt.load({ ...SETUP, objects: [], backdrop });
    expect(withIt.missing()).toEqual([]);
  });

  it('says which posed joints a model has not got, and none for a stand-in (spec 03, 2.2)', async () => {
    const turn = { x: 0, y: 0, z: 0, w: 1 };
    const wing = jointName('leftWing');
    const pose = { [jointName('head')]: turn, [wing]: turn };
    const cat = backstageId('Quadruped/Cat/AbyssinianCat');
    const stage = new FakeStage({ knownModels: [cat] });
    await stage.load({
      ...SETUP,
      objects: [
        { ...SETUP.objects[0]!, model: cat, joints: pose },
        { ...SETUP.objects[1]!, joints: pose },
      ],
    });
    expect(stage.missing()).toEqual([{ kind: 'joint', object: SETUP.objects[0]!.id, joint: wing }]);
  });

  it('poses by a hand or foot as a test makes it, for the Pose panel (5.9)', async () => {
    const limbs = ['UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot'];
    const stage = new FakeStage({
      jointsFor: () => ['left', 'right'].flatMap((side) => limbs.map((l) => jointName(side + l))),
    });
    await stage.load(SETUP);
    stage.editing(true);
    expect(stage.poseHandles(cat)).toEqual(['leftHand', 'rightHand', 'leftFoot', 'rightFoot']);
    expect(stage.poseHandleJoints(cat, 'leftHand')).toEqual(
      ['leftUpperArm', 'leftLowerArm', 'leftHand'].map(jointName),
    );
    stage.showPoseHandles(cat);
    expect(stage.posingNow()).toBe(cat);
    const inside = stage as unknown as { timeline: { setupJoints(o: unknown): unknown } };
    const posed = () => inside.timeline.setupJoints(cat);
    expect(() => stage.showPoseHandles(objectId('nobody'))).toThrow(StageError);
    // A pose for the keyboard, the same each time, changing nothing.
    const target = { x: 1, y: 1, z: 1 };
    const joints = stage.posedReaching(cat, 'leftHand', target);
    expect(stage.posedReaching(cat, 'leftHand', target)).toEqual(joints);
    expect(Object.keys(joints).sort()).toEqual(['leftLowerArm', 'leftUpperArm']);
    // A drag as a test makes it: live, Esc has it to put back; then final.
    const poses: unknown[] = [];
    const taps: unknown[] = [];
    stage.onPose((e) => poses.push(e));
    stage.onTap((p) => taps.push(p));
    expect(stage.cancelDrag()).toBe(false);
    stage.dragPose(cat, 'leftHand', joints, { final: false });
    expect(posed()).toEqual(joints);
    // Esc puts back the pose from before the drag (S5).
    expect(stage.cancelDrag()).toBe(true);
    expect(posed()).toEqual({});
    stage.dragPose(cat, 'leftHand', joints);
    expect(stage.cancelDrag()).toBe(false);
    expect(poses).toEqual([
      { object: cat, handle: 'leftHand', joints, final: false },
      { object: cat, handle: 'leftHand', joints, final: true },
    ]);
    stage.tapPose(cat, 'rightFoot');
    expect(taps).toEqual([{ target: { object: cat }, ground: null, pose: 'rightFoot' }]);
    // Only on the object whose handles are shown.
    stage.tapPose(dog, 'rightFoot');
    stage.showPoseHandles(null);
    stage.tapPose(cat, 'rightFoot');
    expect(taps).toHaveLength(1);
    // Where a hand is follows the pose written, so keys that step from it add up (S5).
    const rest = stage.handlePlace(cat, 'rightHand');
    const first = { x: rest.x + 0.1, y: rest.y, z: rest.z };
    stage.setObject(cat, { joints: stage.posedReaching(cat, 'rightHand', first) });
    expect(stage.handlePlace(cat, 'rightHand')).toEqual(first);
    const second = { x: first.x + 0.1, y: first.y, z: first.z };
    stage.setObject(cat, { joints: stage.posedReaching(cat, 'rightHand', second) });
    expect(stage.handlePlace(cat, 'rightHand')).toEqual(second);
  });

  it('reports a tap only while editing, and a drag as a test makes it', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    const taps: unknown[] = [];
    const drags: unknown[] = [];
    stage.onTap((p) => taps.push(p.target));
    stage.onEdit((e) => drags.push(e.final));
    stage.tap(437, 327);
    expect(taps).toEqual([]);
    stage.editing(true);
    stage.tap(437, 327);
    expect(taps).toEqual([{ object: cat }]);
    const transform = stage.transform(cat);
    stage.drag({ target: { object: cat }, transform, final: false });
    stage.drag({ target: { object: cat }, transform, final: true });
    expect(drags).toEqual([false, true]);
  });

  it('keeps what is chosen across a load while it is still there', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    stage.choose({ object: cat });
    await stage.load(SETUP);
    expect(stage.chosen()).toEqual({ object: cat });
    await stage.load({ ...SETUP, objects: [SETUP.objects[1]!] });
    expect(stage.chosen()).toBeNull();
  });

  it("moves Look around's camera only while looking around", async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    const elsewhere = { ...stage.transform(cat), position: { x: 5, y: 5, z: 5 } };
    stage.moveView(elsewhere);
    expect(stage.viewTransform().position.z).toBeCloseTo(-6, 5);
    stage.lookAround(true);
    stage.moveView(elsewhere);
    expect(stage.viewTransform().position.x).toBe(5);
    // The scene's camera stays where it was.
    expect(stage.transform(CAMERA).position.z).toBeCloseTo(-6, 5);
  });

  it('turns to face the other way round the short way', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    stage.schedule([cmd(0, 1, { object: cat, kind: 'turnToFace', target: dog })]);
    stage.seek(micros(1));
    const r = stage.transform(cat).rotation;
    // Facing +X from facing +Z is a quarter turn: sin(45°) about Y.
    expect(Math.abs(r.y)).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('refuses bad numbers', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    expect(() => stage.schedule([cmd(0, 1, { object: cat, kind: 'opacity', to: 2 })])).toThrow(
      /0 to 1/,
    );
    expect(() =>
      stage.schedule([
        cmd(0, 1, { object: cat, kind: 'translate', by: { x: NaN, y: 0, z: 0 }, space: 'scene' }),
      ]),
    ).toThrow(StageError);
  });
});
