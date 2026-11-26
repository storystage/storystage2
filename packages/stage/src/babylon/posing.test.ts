import {
  IDENTITY,
  StageError,
  backstageId,
  jointName,
  objectId,
  type SceneSetup,
  type Vec3,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { Picked, PoseEvent } from '../contract.ts';
import { toView } from '../editing.ts';
import { length, sub, v } from '../math.ts';
import { SETUP } from '../testing/conformance.ts';
import { headlessEngine } from './headless.ts';
import { BabylonStage } from './stage.ts';
import { tinyHumanUrl } from './tiny-model.ts';

const pat = objectId('pat');
const person = backstageId('test/Biped/person');
const JOINTS = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
].map(jointName);

/** Pat at the origin, facing the camera 4 m away, which looks along +Z. */
async function posing(model: Parameters<typeof tinyHumanUrl>[0] = {}) {
  const url = tinyHumanUrl(model);
  const stage = new BabylonStage(headlessEngine(), {
    models: { find: (id) => (id === person ? { url, joints: JOINTS } : null) },
  });
  const setup: SceneSetup = {
    ...SETUP,
    objects: [
      {
        id: pat,
        model: person,
        class: 'Biped',
        transform: { ...IDENTITY, rotation: { x: 0, y: 1, z: 0, w: 0 } },
      },
    ],
    camera: { transform: { ...IDENTITY, position: v(0, 1.2, -4) } },
  };
  await stage.load(setup);
  stage.editing(true);
  const events: PoseEvent[] = [];
  stage.onPose((e) => events.push(e));
  const inside = stage as unknown as {
    timeline: { lens(): number };
    views: Map<string, { jointPlace(joint: string): Vec3 | null }>;
  };
  const onView = (p: Vec3) => toView(stage.viewTransform(), inside.timeline.lens(), 640, 360, p)!;
  /** Where one of Pat's joints is in the scene now. */
  const place = (joint: string) => inside.views.get(pat)!.jointPlace(joint)!;
  return { stage, events, onView, place };
}

const near = (a: Vec3, b: Vec3, within = 1e-3) => expect(length(sub(a, b))).toBeLessThan(within);

describe('drag posing, by a hand or foot (5.9, decision 0073)', () => {
  for (const [name, model] of [
    ['resting in a T-pose', {}],
    ['resting in an A-pose', { arms: 'A' as const }],
    ['with its bones turned every which way', { twisted: true }],
    ['made facing -Z, as a VRM 0.x avatar is', { facing: 'back' as const }],
  ] as const)
    it(`puts the hand where it's asked, turning joints only: ${name}`, async () => {
      const { stage, place } = await posing(model);
      expect(stage.poseHandles(pat)).toEqual(['leftHand', 'rightHand', 'leftFoot', 'rightFoot']);
      expect(stage.poseHandleJoints(pat, 'rightFoot')).toEqual(
        ['rightUpperLeg', 'rightLowerLeg', 'rightFoot'].map(jointName),
      );
      const shoulder = place('leftUpperArm');
      // Facing the camera, its left is the scene's -X: in front of it, lower, within reach.
      const target = v(shoulder.x - 0.2, shoulder.y - 0.35, shoulder.z - 0.2);
      const joints = stage.posedReaching(pat, 'leftHand', target);
      // Asking changes nothing.
      expect(stage.handlePlace(pat, 'leftHand')).not.toEqual(target);
      stage.setObject(pat, { joints });
      near(stage.handlePlace(pat, 'leftHand'), target);
      // The shoulder stays put, and only the arm's two joints are posed.
      near(place('leftUpperArm'), shoulder);
      expect(Object.keys(joints).sort()).toEqual(['leftLowerArm', 'leftUpperArm']);
      // A foot too, forwards and up a little.
      const hip = place('rightUpperLeg');
      const step = v(hip.x, hip.y - 0.75, hip.z - 0.25);
      stage.setObject(pat, { joints: stage.posedReaching(pat, 'rightFoot', step) });
      near(stage.handlePlace(pat, 'rightFoot'), step);
      // The arm's pose was kept.
      near(stage.handlePlace(pat, 'leftHand'), target);
    });

  it('points the limb at a point out of reach', async () => {
    const { stage, place } = await posing();
    const shoulder = place('leftUpperArm');
    const far = v(shoulder.x - 3, shoulder.y + 1, shoulder.z);
    stage.setObject(pat, { joints: stage.posedReaching(pat, 'leftHand', far) });
    const hand = stage.handlePlace(pat, 'leftHand');
    const way = sub(far, shoulder);
    const arm = sub(hand, shoulder);
    // Straight (0.55 m), along the line to the point.
    expect(length(arm)).toBeCloseTo(0.55, 3);
    const along = (arm.x * way.x + arm.y * way.y + arm.z * way.z) / (length(arm) * length(way));
    expect(along).toBeCloseTo(1, 4);
  });

  it('drags a hand: live, then once when let go, and the set-up follows', async () => {
    const { stage, events, onView } = await posing();
    stage.showPoseHandles(pat);
    const hand = onView(stage.handlePlace(pat, 'leftHand'));
    expect(stage.pointerDown(hand.x, hand.y)).toBe(true);
    // Up and in: within reach of the arm, which hangs as KayKit's idle has it.
    stage.pointerMove(hand.x - 20, hand.y - 40);
    stage.pointerMove(hand.x - 30, hand.y - 60);
    stage.pointerUp(hand.x - 30, hand.y - 60);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.filter((e) => e.final)).toHaveLength(1);
    const last = events.at(-1)!;
    expect(last).toMatchObject({ object: pat, handle: 'leftHand', final: true });
    expect(Object.keys(last.joints).sort()).toEqual(['leftLowerArm', 'leftUpperArm']);
    // The hand is under the pointer now.
    const now = onView(stage.handlePlace(pat, 'leftHand'));
    expect(Math.hypot(now.x - (hand.x - 30), now.y - (hand.y - 60))).toBeLessThan(1);
  });

  it("reports a press that doesn't move as a tap on the hand, and nothing for a drag Esc puts back", async () => {
    const { stage, events, onView } = await posing();
    const taps: Picked[] = [];
    stage.onTap((p) => taps.push(p));
    stage.showPoseHandles(pat);
    const hand = onView(stage.handlePlace(pat, 'leftHand'));
    // Within 22 px (a 44 px target), it's the hand.
    expect(stage.pick(hand.x + 15, hand.y).pose).toBe('leftHand');
    stage.pointerDown(hand.x + 15, hand.y);
    stage.pointerUp(hand.x + 17, hand.y);
    expect(events).toEqual([]);
    expect(taps).toHaveLength(1);
    expect(taps[0]).toMatchObject({ target: { object: pat }, pose: 'leftHand' });
    expect(stage.cancelDrag()).toBe(false);
    const before = stage.handlePlace(pat, 'leftHand');
    stage.pointerDown(hand.x, hand.y);
    stage.pointerMove(hand.x, hand.y + 50);
    const live = events.length;
    expect(live).toBeGreaterThan(0);
    expect(stage.cancelDrag()).toBe(true);
    near(stage.handlePlace(pat, 'leftHand'), before, 1e-9);
    expect(stage.cancelDrag()).toBe(false);
    stage.pointerUp(hand.x, hand.y + 50);
    expect(events).toHaveLength(live);
    expect(events.some((e) => e.final)).toBe(false);
  });

  it('takes the pose handles only while shown, and draws them', async () => {
    const { stage, events, onView } = await posing();
    stage.choose({ object: pat });
    const hand = onView(stage.handlePlace(pat, 'leftHand'));
    const shown = stage.editMeshes();
    stage.showPoseHandles(pat);
    // Four balls, and the outline and its handles gone.
    expect(stage.editMeshes()).not.toBe(shown);
    stage.showPoseHandles(null);
    stage.pointerDown(hand.x, hand.y);
    stage.pointerMove(hand.x, hand.y + 50);
    stage.pointerUp(hand.x, hand.y + 50);
    expect(events).toEqual([]);
    expect(() => stage.showPoseHandles(objectId('nobody'))).toThrow(StageError);
  });

  it("can't pose a stand-in, or a model without arms and legs", async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const [first] = SETUP.objects;
    expect(stage.poseHandles(first!.id)).toEqual([]);
    expect(() => stage.handlePlace(first!.id, 'leftHand')).toThrow(/can't be posed/);
    expect(() => stage.poseHandleJoints(first!.id, 'leftHand')).toThrow(/can't be posed/);
  });
});
