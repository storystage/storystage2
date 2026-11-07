import { describe, expect, it } from 'vitest';
import { STORY_CLASSES, jointName } from '@storystage/story-api';
import {
  EXTRA_JOINTS,
  JOINT_MAP,
  SKELETONS,
  findJoint,
  jointsOf,
  jointFromAlice,
  jointWord,
  skeletonOf,
  type Skeleton,
} from './joints.ts';

/** VRM 1.0 humanoid bones (VRMC_vrm-1.0 humanoid.md), with the 15 the specification requires. */
const VRM_REQUIRED = [
  'hips',
  'spine',
  'head',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
];
const fingers = (side: string) =>
  [
    'ThumbMetacarpal',
    'ThumbProximal',
    'ThumbDistal',
    ...['Index', 'Middle', 'Ring', 'Little'].flatMap((f) =>
      ['Proximal', 'Intermediate', 'Distal'].map((p) => f + p),
    ),
  ].map((b) => side + b);
const VRM_BONES = [
  ...VRM_REQUIRED,
  'chest',
  'upperChest',
  'neck',
  'leftEye',
  'rightEye',
  'jaw',
  'leftToes',
  'rightToes',
  'leftShoulder',
  'rightShoulder',
  ...fingers('left'),
  ...fingers('right'),
];

/**
 * The joints each Alice resource class defines (StoryStage 1, `org.lgna.story.resources`), less
 * `ROOT`, which is the model itself rather than a joint.
 */
const sided = (...names: string[]) =>
  names.flatMap((n) => ['LEFT', 'RIGHT'].map((s) => n.replace('@', s)));
const ALICE: Record<Skeleton, string[]> = {
  biped: [
    'PELVIS_LOWER_BODY',
    'SPINE_BASE',
    'SPINE_MIDDLE',
    'SPINE_UPPER',
    'NECK',
    'HEAD',
    'MOUTH',
    ...sided('@_EYE', '@_EYELID', '@_CLAVICLE', '@_SHOULDER', '@_ELBOW', '@_WRIST', '@_HAND'),
    ...sided(
      ...['THUMB', 'INDEX_FINGER', 'MIDDLE_FINGER', 'PINKY_FINGER'].flatMap((f) => [
        `@_${f}`,
        `@_${f}_KNUCKLE`,
        `@_${f}_TIP`,
      ]),
    ),
    ...sided('@_HIP', '@_KNEE', '@_ANKLE', '@_FOOT', '@_TOES'),
  ],
  quadruped: [
    'SPINE_BASE',
    'SPINE_MIDDLE',
    'SPINE_UPPER',
    'NECK',
    'HEAD',
    'MOUTH',
    ...sided('@_EYE', '@_EYELID', '@_EAR'),
    ...sided(
      'FRONT_@_CLAVICLE',
      'FRONT_@_SHOULDER',
      'FRONT_@_KNEE',
      'FRONT_@_ANKLE',
      'FRONT_@_FOOT',
      'FRONT_@_TOE',
    ),
    'PELVIS_LOWER_BODY',
    'TAIL_0',
    'TAIL_1',
    'TAIL_2',
    'TAIL_3',
    ...sided(
      'BACK_@_HIP',
      'BACK_@_KNEE',
      'BACK_@_HOCK',
      'BACK_@_ANKLE',
      'BACK_@_FOOT',
      'BACK_@_TOE',
    ),
  ],
  flyer: [
    'SPINE_BASE',
    'SPINE_MIDDLE',
    'SPINE_UPPER',
    'NECK_0',
    'NECK_1',
    'HEAD',
    'MOUTH',
    'LOWER_LIP',
    ...sided('@_EYE', '@_EYELID'),
    ...sided('@_WING_SHOULDER', '@_WING_ELBOW', '@_WING_WRIST', '@_WING_TIP'),
    'PELVIS_LOWER_BODY',
    'TAIL_0',
    'TAIL_1',
    'TAIL_2',
    ...sided('@_HIP', '@_KNEE', '@_ANKLE', '@_FOOT'),
  ],
  swimmer: [
    'NECK',
    'HEAD',
    'MOUTH',
    ...sided('@_EYE', '@_EYELID', 'FRONT_@_FIN'),
    'SPINE_BASE',
    'SPINE_MIDDLE',
    'TAIL',
  ],
  slitherer: [
    'SPINE_BASE',
    'SPINE_MIDDLE',
    'SPINE_UPPER',
    'NECK',
    'HEAD',
    'MOUTH',
    ...sided('@_EYE', '@_EYELID'),
    'TAIL_0',
  ],
};

describe('the joint map', () => {
  it.each(SKELETONS)('%s: ids and words are unique, and parents are in the same set', (s) => {
    const joints = JOINT_MAP[s];
    const ids = joints.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    const words = joints.map((j) => j.word);
    expect(new Set(words).size).toBe(words.length);
    for (const j of joints) {
      expect(j.word).toMatch(/^[a-z0-9 ]+$/);
      expect(j.id).toMatch(/^[a-z][A-Za-z0-9]*$/);
      if (j.parent !== null) expect(ids).toContain(j.parent);
    }
  });

  it.each(SKELETONS)('%s: every joint Alice defines for the class has a place', (s) => {
    for (const alice of ALICE[s]) {
      const id = jointFromAlice(s, alice);
      expect(
        JOINT_MAP[s].map((j) => j.id),
        `${s} ${alice}`,
      ).toContain(id);
    }
  });

  it.each(SKELETONS)('%s: an Alice name belongs to only one joint, extras included', (s) => {
    const all = jointsOf(s);
    expect(new Set(all.map((j) => j.id)).size).toBe(all.length);
    const names = all.flatMap((j) => j.alice);
    expect(new Set(names).size).toBe(names.length);
  });

  describe('humanoids (biped)', () => {
    const biped = JOINT_MAP.biped;

    it('use the VRM 1.0 bone names as ids, every one of them', () => {
      const vrmIds = biped.filter((j) => j.vrm).map((j) => j.id);
      expect([...vrmIds].sort()).toEqual([...VRM_BONES].sort());
    });

    it('require the joints VRM requires, and no others', () => {
      const required = biped.filter((j) => j.required).map((j) => j.id);
      expect([...required].sort()).toEqual([...VRM_REQUIRED].sort());
    });

    it('give every joint an H-Anim 2.0 name, each used once', () => {
      const hanim = biped.map((j) => j.hanim);
      expect(hanim.every((h) => typeof h === 'string' && h.length > 0)).toBe(true);
      expect(new Set(hanim).size).toBe(hanim.length);
    });

    it("fold Alice's wrist and hand, and ankle and foot, onto the one standard bone", () => {
      expect(jointFromAlice('biped', 'LEFT_WRIST')).toBe('leftHand');
      expect(jointFromAlice('biped', 'LEFT_HAND')).toBe('leftHand');
      expect(jointFromAlice('biped', 'RIGHT_ANKLE')).toBe('rightFoot');
      expect(jointFromAlice('biped', 'RIGHT_FOOT')).toBe('rightFoot');
    });

    it('add a ring finger, which Alice bipeds lack', () => {
      expect(findJoint('biped', jointName('leftRingProximal'))?.word).toBe('left ring finger');
      expect(jointFromAlice('biped', 'RIGHT_RING_FINGER_TIP')).toBe('rightRingDistal');
    });

    it("keep Alice's words on the blocks, including the shoulder naming trap", () => {
      expect(jointWord('biped', jointName('leftShoulder'))).toBe('left collarbone');
      expect(jointWord('biped', jointName('leftUpperArm'))).toBe('left shoulder');
      expect(jointFromAlice('biped', 'LEFT_SHOULDER')).toBe('leftUpperArm');
      expect(jointWord('biped', jointName('jaw'))).toBe('mouth');
      expect(jointWord('biped', jointName('leftLittleProximal'))).toBe('left little finger');
    });
  });

  describe('animals (the StoryStage extension)', () => {
    it('share the face joints with humanoids, so "look at" and "speak line" work on any class', () => {
      for (const s of SKELETONS)
        for (const id of ['head', 'jaw', 'leftEye', 'rightEye'])
          expect(findJoint(s, jointName(id)), `${s} ${id}`).toBeDefined();
    });

    it('keep their own legs, wings, fins and tails', () => {
      expect(jointFromAlice('quadruped', 'BACK_LEFT_HOCK')).toBe('backLeftHock');
      expect(jointFromAlice('quadruped', 'TAIL_0')).toBe('tail');
      expect(jointFromAlice('quadruped', 'TAIL_3')).toBe('tail4');
      expect(jointFromAlice('flyer', 'NECK_1')).toBe('upperNeck');
      expect(jointFromAlice('flyer', 'RIGHT_WING_TIP')).toBe('rightWingTip');
      expect(jointFromAlice('swimmer', 'FRONT_LEFT_FIN')).toBe('frontLeftFin');
      expect(jointWord('quadruped', jointName('backLeftHock'))).toBe('back left hock');
    });
  });

  describe('extra joints', () => {
    it("cover the joints many Alice models add beyond their class's set", () => {
      expect(jointFromAlice('biped', 'LOWER_LIP')).toBe('lowerLip');
      expect(jointFromAlice('biped', 'LEFT_EAR_TIP')).toBe('leftEarTip');
      expect(jointFromAlice('biped', 'TAIL_0')).toBe('tail');
      expect(jointFromAlice('quadruped', 'TRUNK_5')).toBe('trunk6');
      expect(jointFromAlice('quadruped', 'LEFT_WING_SHOULDER')).toBe('leftWingShoulder');
      expect(findJoint('biped', jointName('leftEarTip'))?.word).toBe('left ear tip');
    });

    it('name any other joint a model has from its Alice name', () => {
      expect(jointFromAlice('flyer', 'PLUMAGE_CENTER_TIP')).toBe('plumageCenterTip');
      expect(jointWord('flyer', jointName('plumageCenterTip'))).toBe('plumage center tip');
      expect(jointFromAlice('quadruped', 'HAIR_0')).toBe('hair');
      expect(jointWord('quadruped', jointName('tail7'))).toBe('tail 7');
    });

    it('have parents that are in the class map or are themselves extras', () => {
      const extraIds = EXTRA_JOINTS.map((j) => j.id);
      expect(new Set(extraIds).size).toBe(extraIds.length);
      for (const j of EXTRA_JOINTS) {
        expect(j.required).toBe(false);
        if (j.parent === null) continue;
        const inSome = SKELETONS.some((s) => JOINT_MAP[s].some((k) => k.id === j.parent));
        expect(inSome || extraIds.includes(j.parent), `${j.id} -> ${j.parent}`).toBe(true);
      }
    });
  });
});

describe('skeletonOf', () => {
  it('gives the five jointed classes a skeleton, and nothing else', () => {
    const jointed = STORY_CLASSES.filter((c) => skeletonOf(c) !== null);
    expect(jointed).toEqual(['Biped', 'Quadruped', 'Flyer', 'Swimmer', 'Slitherer']);
    expect(skeletonOf('Biped')).toBe('biped');
  });
});
