/**
 * WP3.3: the joint map (`docs/spec/17-backstage.md`, section 2a; `docs/spec/10-crosswalk.md`).
 * Every model from every source is mapped onto it, so one block, gesture or walk works on every
 * character of a class.
 *
 * - Humanoids (`biped`) use the **VRM 1.0 bone names** as ids, with an **H-Anim 2.0** (ISO/IEC
 *   19774) joint for each. Alice's two-joint wrist and hand, and ankle and foot, fold onto the
 *   one standard bone, and the ring finger is added.
 * - Animals (`quadruped`, `flyer`, `swimmer`, `slitherer`), which no standard covers, use Alice's
 *   joint sets: StoryStage's open extension. They share the face joints with humanoids (`head`,
 *   `jaw`, the eyes), so "look at" and "speak line" work on every class.
 * - Alice's friendly words ("left elbow", "mouth") are the words on the blocks.
 * - Extra joints that many Alice models add (lower lip, ears, tails, hair, horns, fins) are
 *   optional for every class; any other joint a model has is named from its Alice name.
 *
 * Owner: S4. The Story API (S6) and the stage (S3) read joint names from here.
 */
import { jointName, type JointName, type StoryClass } from '@storystage/story-api';

export const SKELETONS = ['biped', 'quadruped', 'flyer', 'swimmer', 'slitherer'] as const;
export type Skeleton = (typeof SKELETONS)[number];

const SKELETON_OF: Partial<Record<StoryClass, Skeleton>> = {
  Biped: 'biped',
  Quadruped: 'quadruped',
  Flyer: 'flyer',
  Swimmer: 'swimmer',
  Slitherer: 'slitherer',
};

/** The joint set a Story API class uses, or null for classes without joints (props, text). */
export const skeletonOf = (cls: StoryClass): Skeleton | null => SKELETON_OF[cls] ?? null;

export interface JointDef {
  /** The internal id. For humanoids, the VRM 1.0 bone name. */
  readonly id: JointName;
  /** The word on the blocks, Alice's where Alice has one ("left elbow"). */
  readonly word: string;
  /** The joint it hangs from, or null if it hangs from the model itself. */
  readonly parent: JointName | null;
  /** Alice's `JointId` names that map here; the first is preferred when a model has several. */
  readonly alice: readonly string[];
  /** The id is a VRM 1.0 humanoid bone. */
  readonly vrm: boolean;
  /** The H-Anim 2.0 joint (humanoids only). */
  readonly hanim?: string;
  /** A model of this class needs it to walk and gesture; without it, it is "prop only". */
  readonly required: boolean;
}

interface Options {
  readonly vrm?: boolean;
  readonly hanim?: string;
  readonly required?: boolean;
}

const j = (
  id: string,
  word: string,
  parent: string | null,
  alice: readonly string[],
  o: Options = {},
): JointDef => ({
  id: jointName(id),
  word,
  parent: parent === null ? null : jointName(parent),
  alice,
  vrm: o.vrm ?? false,
  ...(o.hanim === undefined ? {} : { hanim: o.hanim }),
  required: o.required ?? false,
});

interface Side {
  /** `left` or `right`: the id prefix and the word. */
  readonly s: string;
  /** `LEFT` or `RIGHT`, in Alice's names. */
  readonly S: string;
  /** `l` or `r`, in H-Anim's names. */
  readonly h: string;
}
const SIDES: readonly Side[] = [
  { s: 'left', S: 'LEFT', h: 'l' },
  { s: 'right', S: 'RIGHT', h: 'r' },
];
const both = (f: (side: Side) => readonly JointDef[]) => SIDES.flatMap(f);
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

const VRM = { vrm: true } as const;
const VRM_REQUIRED = { vrm: true, required: true } as const;

/** Thumb and fingers: VRM's three bones, Alice's base, knuckle and tip, H-Anim's hand joints. */
const DIGITS = [
  {
    vrm: 'Thumb',
    alice: 'THUMB',
    word: 'thumb',
    bones: ['Metacarpal', 'Proximal', 'Distal'],
    hanim: ['carpometacarpal_1', 'metacarpophalangeal_1', 'carpal_interphalangeal_1'],
  },
  ...(
    [
      ['Index', 'INDEX_FINGER', 'index finger', 2],
      ['Middle', 'MIDDLE_FINGER', 'middle finger', 3],
      ['Ring', 'RING_FINGER', 'ring finger', 4],
      ['Little', 'PINKY_FINGER', 'little finger', 5],
    ] as const
  ).map(([vrm, alice, word, n]) => ({
    vrm,
    alice,
    word,
    bones: ['Proximal', 'Intermediate', 'Distal'],
    hanim: [
      `metacarpophalangeal_${n}`,
      `carpal_proximal_interphalangeal_${n}`,
      `carpal_distal_interphalangeal_${n}`,
    ],
  })),
];

const biped: readonly JointDef[] = [
  j('hips', 'pelvis', null, ['PELVIS_LOWER_BODY'], { ...VRM_REQUIRED, hanim: 'sacroiliac' }),
  j('spine', 'spine base', 'hips', ['SPINE_BASE'], { ...VRM_REQUIRED, hanim: 'vl5' }),
  j('chest', 'spine middle', 'spine', ['SPINE_MIDDLE'], { ...VRM, hanim: 'vt10' }),
  j('upperChest', 'spine upper', 'chest', ['SPINE_UPPER'], { ...VRM, hanim: 'vt1' }),
  j('neck', 'neck', 'upperChest', ['NECK'], { ...VRM, hanim: 'vc4' }),
  j('head', 'head', 'neck', ['HEAD'], { ...VRM_REQUIRED, hanim: 'skullbase' }),
  j('jaw', 'mouth', 'head', ['MOUTH'], { ...VRM, hanim: 'temporomandibular' }),
  ...both(({ s, S, h }) => [
    j(`${s}Eye`, `${s} eye`, 'head', [`${S}_EYE`], { ...VRM, hanim: `${h}_eyeball_joint` }),
    // Not a VRM bone: VRM uses the blink expression. Kept so Alice's models keep their eyelids.
    j(`${s}Eyelid`, `${s} eyelid`, 'head', [`${S}_EYELID`], { hanim: `${h}_eyelid_joint` }),
  ]),
  ...both(({ s, S, h }) => [
    // The naming trap: Alice's "shoulder" is VRM's upper arm; VRM's shoulder is the collarbone.
    j(`${s}Shoulder`, `${s} collarbone`, 'upperChest', [`${S}_CLAVICLE`], {
      ...VRM,
      hanim: `${h}_sternoclavicular`,
    }),
    j(`${s}UpperArm`, `${s} shoulder`, `${s}Shoulder`, [`${S}_SHOULDER`], {
      ...VRM_REQUIRED,
      hanim: `${h}_shoulder`,
    }),
    j(`${s}LowerArm`, `${s} elbow`, `${s}UpperArm`, [`${S}_ELBOW`], {
      ...VRM_REQUIRED,
      hanim: `${h}_elbow`,
    }),
    j(`${s}Hand`, `${s} wrist`, `${s}LowerArm`, [`${S}_WRIST`, `${S}_HAND`], {
      ...VRM_REQUIRED,
      hanim: `${h}_radiocarpal`,
    }),
    ...DIGITS.flatMap((d) =>
      d.bones.map((bone, i) =>
        j(
          `${s}${d.vrm}${bone}`,
          `${s} ${d.word}${['', ' knuckle', ' tip'][i]}`,
          i === 0 ? `${s}Hand` : `${s}${d.vrm}${d.bones[i - 1]}`,
          [`${S}_${d.alice}${['', '_KNUCKLE', '_TIP'][i]}`],
          { ...VRM, hanim: `${h}_${d.hanim[i]}` },
        ),
      ),
    ),
  ]),
  ...both(({ s, S, h }) => [
    j(`${s}UpperLeg`, `${s} hip`, 'hips', [`${S}_HIP`], { ...VRM_REQUIRED, hanim: `${h}_hip` }),
    j(`${s}LowerLeg`, `${s} knee`, `${s}UpperLeg`, [`${S}_KNEE`], {
      ...VRM_REQUIRED,
      hanim: `${h}_knee`,
    }),
    j(`${s}Foot`, `${s} ankle`, `${s}LowerLeg`, [`${S}_ANKLE`, `${S}_FOOT`], {
      ...VRM_REQUIRED,
      hanim: `${h}_talocrural`,
    }),
    j(`${s}Toes`, `${s} toes`, `${s}Foot`, [`${S}_TOES`], {
      ...VRM,
      hanim: `${h}_metatarsophalangeal_2`,
    }),
  ]),
];

/** Head, mouth, eyes and eyelids: the same ids on every class. */
const face = (neck: string): readonly JointDef[] => [
  j('head', 'head', neck, ['HEAD'], { required: true }),
  j('jaw', 'mouth', 'head', ['MOUTH']),
  ...both(({ s, S }) => [
    j(`${s}Eye`, `${s} eye`, 'head', [`${S}_EYE`]),
    j(`${s}Eyelid`, `${s} eyelid`, 'head', [`${S}_EYELID`]),
  ]),
];

const spine = (parent: string | null, upper = true): readonly JointDef[] => [
  j('spineBase', 'spine base', parent, ['SPINE_BASE'], { required: true }),
  j('spineMiddle', 'spine middle', 'spineBase', ['SPINE_MIDDLE']),
  ...(upper ? [j('spineUpper', 'spine upper', 'spineMiddle', ['SPINE_UPPER'])] : []),
];

/** A chain of joints Alice numbers from 0 (`TAIL_0`, `TAIL_1`…): `tail`, `tail2`… */
const chain = (
  base: string,
  word: string,
  alice: string,
  parent: string | null,
  count: number,
): JointDef[] =>
  Array.from({ length: count }, (_, i) =>
    j(
      i === 0 ? base : `${base}${i + 1}`,
      i === 0 ? word : `${word} ${i + 1}`,
      i === 0 ? parent : i === 1 ? base : `${base}${i}`,
      [`${alice}_${i}`],
    ),
  );

const quadruped: readonly JointDef[] = [
  ...spine(null),
  j('neck', 'neck', 'spineUpper', ['NECK']),
  ...face('neck'),
  ...both(({ s, S }) => [j(`${s}Ear`, `${s} ear`, 'head', [`${S}_EAR`])]),
  ...both(({ s, S }) => {
    const leg = (part: string, word: string, parent: string, required = false) =>
      j(
        `front${cap(s)}${part}`,
        `front ${s} ${word}`,
        parent,
        [`FRONT_${S}_${part.toUpperCase()}`],
        {
          required,
        },
      );
    const p = `front${cap(s)}`;
    return [
      leg('Clavicle', 'collarbone', 'spineUpper'),
      leg('Shoulder', 'shoulder', `${p}Clavicle`, true),
      leg('Knee', 'knee', `${p}Shoulder`, true),
      leg('Ankle', 'ankle', `${p}Knee`),
      leg('Foot', 'foot', `${p}Ankle`),
      leg('Toe', 'toe', `${p}Foot`),
    ];
  }),
  j('pelvis', 'pelvis', null, ['PELVIS_LOWER_BODY']),
  ...chain('tail', 'tail', 'TAIL', 'pelvis', 4),
  ...both(({ s, S }) => {
    const leg = (part: string, parent: string, required = false) =>
      j(
        `back${cap(s)}${part}`,
        `back ${s} ${part.toLowerCase()}`,
        parent,
        [`BACK_${S}_${part.toUpperCase()}`],
        { required },
      );
    const p = `back${cap(s)}`;
    return [
      leg('Hip', 'pelvis', true),
      leg('Knee', `${p}Hip`, true),
      leg('Hock', `${p}Knee`),
      leg('Ankle', `${p}Hock`),
      leg('Foot', `${p}Ankle`),
      leg('Toe', `${p}Foot`),
    ];
  }),
];

const wings = (required: boolean): readonly JointDef[] =>
  both(({ s, S }) => {
    const p = `${s}Wing`;
    return [
      j(`${p}Shoulder`, `${s} wing shoulder`, 'spineUpper', [`${S}_WING_SHOULDER`], { required }),
      j(`${p}Elbow`, `${s} wing elbow`, `${p}Shoulder`, [`${S}_WING_ELBOW`]),
      j(`${p}Wrist`, `${s} wing wrist`, `${p}Elbow`, [`${S}_WING_WRIST`]),
      j(`${p}Tip`, `${s} wing tip`, `${p}Wrist`, [`${S}_WING_TIP`]),
    ];
  });

const flyer: readonly JointDef[] = [
  ...spine(null),
  j('neck', 'neck', 'spineUpper', ['NECK_0']),
  j('upperNeck', 'upper neck', 'neck', ['NECK_1']),
  ...face('upperNeck'),
  j('lowerLip', 'lower lip', 'jaw', ['LOWER_LIP']),
  ...wings(true),
  j('pelvis', 'pelvis', null, ['PELVIS_LOWER_BODY']),
  ...chain('tail', 'tail', 'TAIL', 'pelvis', 3),
  ...both(({ s, S }) => [
    j(`${s}Hip`, `${s} hip`, 'pelvis', [`${S}_HIP`]),
    j(`${s}Knee`, `${s} knee`, `${s}Hip`, [`${S}_KNEE`]),
    j(`${s}Ankle`, `${s} ankle`, `${s}Knee`, [`${S}_ANKLE`]),
    j(`${s}Foot`, `${s} foot`, `${s}Ankle`, [`${S}_FOOT`]),
  ]),
];

const swimmer: readonly JointDef[] = [
  j('neck', 'neck', null, ['NECK']),
  ...face('neck'),
  ...both(({ s, S }) => [j(`front${cap(s)}Fin`, `front ${s} fin`, 'neck', [`FRONT_${S}_FIN`])]),
  ...spine(null, false),
  j('tail', 'tail', 'spineMiddle', ['TAIL'], { required: true }),
];

const slitherer: readonly JointDef[] = [
  ...spine(null),
  j('neck', 'neck', 'spineUpper', ['NECK']),
  ...face('neck'),
  j('tail', 'tail', null, ['TAIL_0']),
];

export const JOINT_MAP: Readonly<Record<Skeleton, readonly JointDef[]>> = {
  biped,
  quadruped,
  flyer,
  swimmer,
  slitherer,
};

/**
 * Optional joints that several Alice models add beyond their class's set, open to every class.
 * Where a class already has a joint with the same id, the class's own wins (`jointsOf`).
 */
export const EXTRA_JOINTS: readonly JointDef[] = [
  j('lowerLip', 'lower lip', 'jaw', ['LOWER_LIP']),
  j('jawTip', 'jaw tip', 'jaw', ['JAW_TIP']),
  ...both(({ s, S }) => [
    j(`${s}Eyebrow`, `${s} eyebrow`, 'head', [`${S}_EYEBROW`]),
    j(`${s}Ear`, `${s} ear`, 'head', [`${S}_EAR`]),
    j(`${s}EarMiddle`, `${s} ear middle`, `${s}Ear`, [`${S}_EAR_MIDDLE`]),
    j(`${s}EarTip`, `${s} ear tip`, `${s}Ear`, [`${S}_EAR_TIP`]),
    j(`${s}Horn`, `${s} horn`, 'head', [`${S}_HORN`]),
    j(`${s}HornTip`, `${s} horn tip`, `${s}Horn`, [`${S}_HORN_TIP`]),
    j(`${s}Toe`, `${s} toe`, `${s}Foot`, [`${S}_TOE`]),
  ]),
  // Alice numbers tails from TAIL_0; a few models have a single TAIL.
  j('tail', 'tail', 'pelvis', ['TAIL_0', 'TAIL']),
  ...chain('tail', 'tail', 'TAIL', 'pelvis', 8).slice(1),
  j('tailTip', 'tail tip', 'tail', ['TAIL_TIP']),
  ...chain('hair', 'hair', 'HAIR', 'head', 7),
  ...chain('tongue', 'tongue', 'TONGUE', 'jaw', 4),
  ...chain('trunk', 'trunk', 'TRUNK', 'head', 6),
  ...wings(false),
  ...both(({ s, S }) => {
    const front = `front${cap(s)}Fin`;
    const back = `back${cap(s)}Fin`;
    return [
      j(`${front}Middle`, `front ${s} fin middle`, front, [`FRONT_${S}_FIN_MIDDLE`]),
      j(`${front}Tip`, `front ${s} fin tip`, front, [`FRONT_${S}_FIN_TIP`]),
      j(back, `back ${s} fin`, 'tail', [`BACK_${S}_FIN`]),
      j(`${back}Middle`, `back ${s} fin middle`, back, [`BACK_${S}_FIN_MIDDLE`]),
      j(`${back}Tip`, `back ${s} fin tip`, back, [`BACK_${S}_FIN_TIP`]),
    ];
  }),
  j('backTopFinTip', 'back top fin tip', 'tail', ['BACK_TOP_FIN_TIP']),
  j('backBottomFinTip', 'back bottom fin tip', 'tail', ['BACK_BOTTOM_FIN_TIP']),
];

const memo = new Map<Skeleton, readonly JointDef[]>();

/** A class's joints and then the extras it doesn't already have. */
export function jointsOf(skeleton: Skeleton): readonly JointDef[] {
  let all = memo.get(skeleton);
  if (!all) {
    const own = JOINT_MAP[skeleton];
    const ids = new Set(own.map((d) => d.id));
    all = [...own, ...EXTRA_JOINTS.filter((d) => !ids.has(d.id))];
    memo.set(skeleton, all);
  }
  return all;
}

export const findJoint = (skeleton: Skeleton, id: JointName): JointDef | undefined =>
  jointsOf(skeleton).find((d) => d.id === id);

/**
 * The joint for one of Alice's `JointId` names, for the model converter (3.2) and the `.a3p`
 * reader (WP9). A name the map doesn't list becomes the model's own joint, named from Alice's:
 * `PLUMAGE_CENTER_TIP` is `plumageCenterTip`; a numbered chain `HAIR_0`, `HAIR_1` is `hair`,
 * `hair2`.
 */
export function jointFromAlice(skeleton: Skeleton, alice: string): JointName {
  const known = jointsOf(skeleton).find((d) => d.alice.includes(alice));
  if (known) return known.id;
  const numbered = /^(.*)_(\d+)$/.exec(alice);
  const [stem, n] = numbered ? [numbered[1]!, Number(numbered[2])] : [alice, 0];
  const camel = stem
    .toLowerCase()
    .split('_')
    .map((w, i) => (i === 0 ? w : cap(w)))
    .join('');
  return jointName(n === 0 ? camel : `${camel}${n + 1}`);
}

/** The word on the blocks for a joint; for a model's own joint, its id split into words. */
export function jointWord(skeleton: Skeleton, id: JointName): string {
  const known = findJoint(skeleton, id);
  if (known) return known.word;
  return id
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .toLowerCase();
}
