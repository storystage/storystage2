import { describe, expect, it } from 'vitest';
import { mapSkeleton, normalizeBoneName } from './skeleton-map.ts';

const LR = (...names: string[]) =>
  names.flatMap((n) => [n.replaceAll('@', 'Left'), n.replaceAll('@', 'Right')]);
const lr = (...names: string[]) =>
  names.flatMap((n) => [n.replaceAll('@', 'l'), n.replaceAll('@', 'r')]);
const LRu = (...names: string[]) =>
  names.flatMap((n) => [n.replaceAll('@', 'LEFT'), n.replaceAll('@', 'RIGHT')]);
const LRcap = (...names: string[]) =>
  names.flatMap((n) => [n.replaceAll('@', 'L'), n.replaceAll('@', 'R')]);

// Bone names as each tool writes them. Fixtures for the converter, MakeHuman and Kenney/KayKit
// pipelines are checked against real files in WP3b.
const VRM = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'jaw',
  ...['left', 'right'].flatMap((s) =>
    ['Eye', 'Shoulder', 'UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot', 'Toes'].map(
      (b) => s + b,
    ),
  ),
];
const ALICE = [
  'ROOT',
  'PELVIS_LOWER_BODY',
  'SPINE_BASE',
  'SPINE_MIDDLE',
  'SPINE_UPPER',
  'NECK',
  'HEAD',
  'MOUTH',
  ...LRu('@_CLAVICLE', '@_SHOULDER', '@_ELBOW', '@_WRIST', '@_HAND', '@_THUMB', '@_THUMB_KNUCKLE'),
  ...LRu('@_HIP', '@_KNEE', '@_ANKLE', '@_FOOT', '@_TOES'),
  'LOWER_LIP',
  'SKIRT_BASE',
];
const MIXAMO = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'HeadTop_End',
  ...LR('@Shoulder', '@Arm', '@ForeArm', '@Hand', '@HandThumb1', '@HandIndex1', '@HandRing2'),
  ...LR('@UpLeg', '@Leg', '@Foot', '@ToeBase'),
].map((b) => `mixamorig:${b}`);
const UE4 = [
  'root',
  'pelvis',
  'spine_01',
  'spine_02',
  'spine_03',
  'neck_01',
  'head',
  ...lr('clavicle_@', 'upperarm_@', 'lowerarm_@', 'hand_@', 'thumb_01_@', 'pinky_03_@'),
  ...lr('thigh_@', 'calf_@', 'foot_@', 'ball_@'),
];
const UE5 = [...UE4, 'spine_04', 'spine_05'];
const RIGIFY = [
  'spine',
  'spine.001',
  'spine.002',
  'spine.003',
  'spine.004',
  'spine.006',
  ...LRcap('shoulder.@', 'upper_arm.@', 'forearm.@', 'hand.@', 'f_index.01.@', 'thumb.01.@'),
  ...LRcap('thigh.@', 'shin.@', 'foot.@', 'toe.@'),
].map((b) => `DEF-${b}`);
const UNIVRM0 = [
  'J_Bip_C_Hips',
  'J_Bip_C_Spine',
  'J_Bip_C_Chest',
  'J_Bip_C_UpperChest',
  'J_Bip_C_Neck',
  'J_Bip_C_Head',
  ...LRcap('J_Bip_@_Shoulder', 'J_Bip_@_UpperArm', 'J_Bip_@_LowerArm', 'J_Bip_@_Hand'),
  ...LRcap('J_Bip_@_Index1', 'J_Bip_@_Little3', 'J_Bip_@_Thumb2'),
  ...LRcap('J_Bip_@_UpperLeg', 'J_Bip_@_LowerLeg', 'J_Bip_@_Foot', 'J_Bip_@_ToeBase'),
  'J_Sec_Hair1_01',
];
// Suffix-sided names, as many hand-made and stylised rigs use.
const GENERIC = [
  'Armature|Hips',
  'Armature|Spine',
  'Armature|Chest',
  'Armature|Neck',
  'Armature|Head',
  ...lr('Armature|UpperArm.@', 'Armature|LowerArm.@', 'Armature|Wrist.@', 'Armature|Hand.@'),
  ...lr('Armature|UpperLeg.@', 'Armature|LowerLeg.@', 'Armature|Foot.@', 'Armature|Toes.@'),
];

describe('normalizeBoneName', () => {
  it('drops namespaces, rig prefixes, case and separators', () => {
    expect(normalizeBoneName('mixamorig:LeftForeArm')).toBe('leftforearm');
    expect(normalizeBoneName('mixamorig1:Hips')).toBe('hips');
    expect(normalizeBoneName('Armature|upper_arm.L')).toBe('upperarml');
    expect(normalizeBoneName('DEF-spine.001')).toBe('spine001');
    expect(normalizeBoneName('J_Bip_C_Hips')).toBe('hips');
    expect(normalizeBoneName('J_Bip_L_UpperArm')).toBe('lupperarm');
    expect(normalizeBoneName('LEFT_WRIST')).toBe('leftwrist');
  });
});

describe('mapSkeleton, humanoids', () => {
  it.each([
    ['VRM 1.0', VRM, 'storystage'],
    ['Alice', ALICE, 'alice'],
    ['Mixamo', MIXAMO, 'mixamo'],
    ['Unreal 4 and MakeHuman (game engine skeleton)', UE4, 'unreal'],
    ['Unreal 5', UE5, 'unreal'],
    ['Blender Rigify', RIGIFY, 'rigify'],
    ['UniVRM 0.x', UNIVRM0, 'generic'],
    ['generic suffix names', GENERIC, 'generic'],
  ] as const)('maps %s with every required joint', (_, bones, convention) => {
    const m = mapSkeleton(bones, 'biped');
    expect(m.missingRequired).toEqual([]);
    expect(m.status).toBe('mapped');
    expect(m.convention).toBe(convention);
    expect(m.joints).not.toBe('prop-only');
  });

  it("handles Alice's shoulder trap and prefers the wrist and ankle over the hand and foot", () => {
    const m = mapSkeleton(ALICE, 'biped');
    expect(m.bones.leftShoulder).toBe('LEFT_CLAVICLE');
    expect(m.bones.leftUpperArm).toBe('LEFT_SHOULDER');
    expect(m.bones.leftHand).toBe('LEFT_WRIST');
    expect(m.bones.rightFoot).toBe('RIGHT_ANKLE');
    expect(m.bones.jaw).toBe('MOUTH');
    expect(m.bones.lowerLip).toBe('LOWER_LIP');
    expect(m.bones.leftThumbProximal).toBe('LEFT_THUMB_KNUCKLE');
  });

  it("keeps a model's own Alice joints under names made from Alice's", () => {
    const m = mapSkeleton(ALICE, 'biped');
    expect(m.bones.skirtBase).toBe('SKIRT_BASE');
    expect(m.unmapped).toEqual(['ROOT', 'LEFT_HAND', 'RIGHT_HAND', 'LEFT_FOOT', 'RIGHT_FOOT']);
  });

  it("reads Mixamo's names: shoulder is the collarbone, arm the upper arm, leg the lower leg", () => {
    const m = mapSkeleton(MIXAMO, 'biped');
    expect(m.bones.leftShoulder).toBe('mixamorig:LeftShoulder');
    expect(m.bones.leftUpperArm).toBe('mixamorig:LeftArm');
    expect(m.bones.leftLowerLeg).toBe('mixamorig:LeftLeg');
    expect(m.bones.chest).toBe('mixamorig:Spine1');
    expect(m.bones.rightRingIntermediate).toBe('mixamorig:RightHandRing2');
    expect(m.unmapped).toEqual(['mixamorig:HeadTop_End']);
  });

  it('spreads a numbered spine of any length over spine, chest and upper chest', () => {
    const ue4 = mapSkeleton(UE4, 'biped');
    expect([ue4.bones.spine, ue4.bones.chest, ue4.bones.upperChest]).toEqual([
      'spine_01',
      'spine_02',
      'spine_03',
    ]);
    const ue5 = mapSkeleton(UE5, 'biped');
    expect([ue5.bones.spine, ue5.bones.chest, ue5.bones.upperChest]).toEqual([
      'spine_01',
      'spine_03',
      'spine_05',
    ]);
    expect(ue5.unmapped).toEqual(['root', 'spine_02', 'spine_04']);
    const two = mapSkeleton(
      UE4.filter((b) => b !== 'spine_03'),
      'biped',
    );
    expect([two.bones.spine, two.bones.chest, two.bones.upperChest]).toEqual([
      'spine_01',
      'spine_02',
      undefined,
    ]);
  });

  it("reads Rigify's names, where the first spine bone is the hips", () => {
    const m = mapSkeleton(RIGIFY, 'biped');
    expect(m.bones.hips).toBe('DEF-spine');
    expect(m.bones.spine).toBe('DEF-spine.001');
    expect(m.bones.head).toBe('DEF-spine.006');
    expect(m.bones.leftShoulder).toBe('DEF-shoulder.L');
    expect(m.bones.leftIndexProximal).toBe('DEF-f_index.01.L');
  });

  it('prefers the wrist bone when a generic rig has both a wrist and a hand', () => {
    const m = mapSkeleton(GENERIC, 'biped');
    expect(m.bones.leftHand).toBe('Armature|Wrist.l');
    expect(m.unmapped).toEqual(['Armature|Hand.l', 'Armature|Hand.r']);
  });

  it('lists the joints in map order, ready for the manifest', () => {
    const m = mapSkeleton(VRM, 'biped');
    expect(m.joints).toEqual(Object.keys(m.bones));
    expect((m.joints as readonly string[]).slice(0, 3)).toEqual(['hips', 'spine', 'chest']);
  });

  it('marks a model "prop only" when it lacks a required joint, and says which', () => {
    const noLegs = VRM.filter((b) => !/Leg|Foot|Toes/.test(b));
    const m = mapSkeleton(noLegs, 'biped');
    expect(m.status).toBe('prop-only');
    expect(m.joints).toBe('prop-only');
    expect(m.missingRequired).toEqual([
      'leftUpperLeg',
      'leftLowerLeg',
      'leftFoot',
      'rightUpperLeg',
      'rightLowerLeg',
      'rightFoot',
    ]);
  });

  it('marks a model with no skeleton, or one it cannot read, "prop only"', () => {
    expect(mapSkeleton([], 'biped').status).toBe('prop-only');
    expect(mapSkeleton(['Bone', 'Bone.001', 'Cube'], 'biped').status).toBe('prop-only');
  });

  it('never maps two joints to one bone, or one joint to two bones', () => {
    for (const bones of [VRM, ALICE, MIXAMO, UE5, RIGIFY, UNIVRM0, GENERIC]) {
      const used = Object.values(mapSkeleton(bones, 'biped').bones);
      expect(new Set(used).size).toBe(used.length);
    }
  });
});

describe('mapSkeleton, animals', () => {
  const QUADRUPED = [
    'ROOT',
    'SPINE_BASE',
    'SPINE_MIDDLE',
    'SPINE_UPPER',
    'NECK',
    'HEAD',
    'MOUTH',
    'LOWER_LIP',
    ...LRu('@_EAR', '@_EAR_TIP'),
    ...LRu('FRONT_@_CLAVICLE', 'FRONT_@_SHOULDER', 'FRONT_@_KNEE', 'FRONT_@_ANKLE'),
    'PELVIS_LOWER_BODY',
    'TAIL_0',
    'TAIL_1',
    'TAIL_5',
    ...LRu('BACK_@_HIP', 'BACK_@_KNEE', 'BACK_@_HOCK'),
  ];

  it("maps Alice's quadruped joints and the extras", () => {
    const m = mapSkeleton(QUADRUPED, 'quadruped');
    expect(m.status).toBe('mapped');
    expect(m.convention).toBe('alice');
    expect(m.bones.backLeftHock).toBe('BACK_LEFT_HOCK');
    expect(m.bones.tail6).toBe('TAIL_5');
    expect(m.bones.leftEarTip).toBe('LEFT_EAR_TIP');
    expect(m.unmapped).toEqual(['ROOT']);
  });

  // Styloo's dog, cow and giraffe (CC0): Rigify's four-legged metarig, deform bones only.
  const RIGIFY_QUADRUPED = [
    'DEF-spine.004',
    'DEF-spine',
    'DEF-pelvis.L',
    'DEF-pelvis.R',
    'DEF-thigh.L',
    'DEF-thigh.R',
    'DEF-shoulder.L',
    'DEF-front_thigh.L',
    'DEF-shoulder.R',
    'DEF-front_thigh.R',
    'DEF-breast.L',
    'DEF-breast.R',
    'DEF-spine.005',
    'DEF-spine.006',
    'DEF-spine.007',
    'DEF-spine.008',
    'DEF-spine.009',
    'DEF-spine.010',
    'DEF-spine.011',
    'DEF-spine.001',
    'DEF-spine.002',
    'DEF-spine.003',
    'DEF-thigh.L.001',
    'DEF-shin.L',
    'DEF-shin.L.001',
    'DEF-foot.L',
    'DEF-foot.L.001',
    'DEF-toe.L',
    'DEF-thigh.R.001',
    'DEF-shin.R',
    'DEF-shin.R.001',
    'DEF-foot.R',
    'DEF-foot.R.001',
    'DEF-toe.R',
    'DEF-front_thigh.L.001',
    'DEF-front_shin.L',
    'DEF-front_shin.L.001',
    'DEF-front_foot.L',
    'DEF-front_foot.L.001',
    'DEF-front_toe.L',
    'DEF-front_thigh.R.001',
    'DEF-front_shin.R',
    'DEF-front_shin.R.001',
    'DEF-front_foot.R',
    'DEF-front_foot.R.001',
    'DEF-front_toe.R',
  ];

  it("maps Rigify's four-legged metarig, as Blender's animals come", () => {
    const m = mapSkeleton(RIGIFY_QUADRUPED, 'quadruped');
    expect(m.status).toBe('mapped');
    expect(m.convention).toBe('rigify');
    expect(m.bones).toMatchObject({
      pelvis: 'DEF-spine.004',
      spineBase: 'DEF-spine.005',
      spineMiddle: 'DEF-spine.006',
      spineUpper: 'DEF-spine.008',
      neck: 'DEF-spine.009',
      head: 'DEF-spine.011',
      tail: 'DEF-spine.003',
      tail4: 'DEF-spine',
      frontLeftClavicle: 'DEF-shoulder.L',
      frontLeftShoulder: 'DEF-front_thigh.L',
      frontLeftKnee: 'DEF-front_shin.L',
      frontLeftAnkle: 'DEF-front_foot.L',
      frontRightToe: 'DEF-front_toe.R',
      backLeftHip: 'DEF-thigh.L',
      backLeftKnee: 'DEF-shin.L',
      backLeftHock: 'DEF-foot.L',
      backRightToe: 'DEF-toe.R',
    });
    expect(m.unmapped).toContain('DEF-spine.010');
    expect(m.unmapped).toContain('DEF-thigh.L.001');
  });

  it("prefers Rigify's deform bones over their ORG, MCH and control twins", () => {
    // Styloo's cat keeps the whole control rig, and its spine.003 and ORG-thigh.L come first.
    const m = mapSkeleton(
      ['root', 'spine.003', 'ORG-spine.004', 'MCH-thigh.L', 'ORG-thigh.L', ...RIGIFY_QUADRUPED],
      'quadruped',
    );
    expect(m.status).toBe('mapped');
    expect(m.bones.tail).toBe('DEF-spine.003');
    expect(m.bones.pelvis).toBe('DEF-spine.004');
    expect(m.bones.backLeftHip).toBe('DEF-thigh.L');
  });

  it("keeps Rigify's human numbering for bipeds", () => {
    expect(mapSkeleton(['DEF-spine', 'DEF-spine.006'], 'biped').bones).toMatchObject({
      hips: 'DEF-spine',
      head: 'DEF-spine.006',
    });
  });

  it('maps a model exported with StoryStage ids', () => {
    const m = mapSkeleton(['spineBase', 'head', 'tail', 'neck', 'frontLeftFin'], 'swimmer');
    expect(m.status).toBe('mapped');
    expect(m.convention).toBe('storystage');
  });

  it('marks an animal without its legs "prop only"', () => {
    const m = mapSkeleton(
      QUADRUPED.filter((b) => !b.startsWith('BACK_')),
      'quadruped',
    );
    expect(m.status).toBe('prop-only');
    expect(m.missingRequired).toEqual([
      'backLeftHip',
      'backLeftKnee',
      'backRightHip',
      'backRightKnee',
    ]);
  });
});
