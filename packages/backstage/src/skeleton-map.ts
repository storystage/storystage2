/**
 * WP3.3: map a model's bones onto the joint map (`joints.ts`; `docs/spec/17-backstage.md`,
 * section 2a). The model pipelines (3.2, 3.5, 3.7) and the import pipeline (3.11) use it, so a
 * character from any source walks and gestures with the same blocks, and one that can't be
 * mapped is marked "prop only" (it can move but not walk or gesture).
 *
 * Each naming convention is tried on its own, because the same word means different bones in
 * different tools (Alice's "shoulder" is Mixamo's "arm"; Rigify's first "spine" is the hips).
 * The convention that finds the most required joints wins.
 */
import type { JointName } from '@storystage/story-api';
import { JOINT_MAP, jointFromAlice, jointsOf, type Skeleton } from './joints.ts';

export const CONVENTIONS = [
  'storystage',
  'alice',
  'mixamo',
  'unreal',
  'rigify',
  'generic',
] as const;
/**
 * - `storystage`: our own ids (VRM 1.0 bone names for humanoids), as the pipelines write them.
 * - `alice`: Alice's `JointId` names, from the converter (3.2).
 * - `mixamo`: Mixamo's names, common in files learners bring (3.11).
 * - `unreal`: the Unreal mannequin's names, also MakeHuman's "game engine" skeleton (3.5).
 * - `rigify`: Blender Rigify's deform bones.
 * - `generic`: plain names with a side before or after (`upperarm.l`, `L_UpperArm`), as UniVRM
 *   0.x and many hand-made rigs use.
 */
export type Convention = (typeof CONVENTIONS)[number];

export interface SkeletonMapping {
  readonly skeleton: Skeleton;
  readonly convention: Convention;
  readonly status: 'mapped' | 'prop-only';
  /** The model's bone for each joint, in map order, then any of the model's own joints. */
  readonly bones: Readonly<Record<string, string>>;
  /** For the manifest's `joints`: the mapped joints, or `prop-only`. */
  readonly joints: readonly JointName[] | 'prop-only';
  /** Required joints the model lacks; empty when mapped. */
  readonly missingRequired: readonly JointName[];
  /** Bones that weren't mapped to any joint, in the model's order. */
  readonly unmapped: readonly string[];
}

/** Lower case, without namespaces (`mixamorig:`, `Armature|`), rig prefixes or separators. */
export function normalizeBoneName(raw: string): string {
  return raw
    .replace(/^.*[:|]/, '')
    .replace(/^(DEF|ORG|MCH)[-_.]/i, '')
    .replace(/^J_(Bip|Adj|Sec)_(C_)?/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** A convention's names for one joint: normalised name → rank (lower is preferred). */
type Names = ReadonlyMap<string, { readonly joint: string; readonly rank: number }>;

const sides = [
  ['left', 'l'],
  ['right', 'r'],
] as const;

function dictionary(entries: readonly (readonly [string, readonly string[]])[]): Names {
  const names = new Map<string, { joint: string; rank: number }>();
  for (const [joint, aliases] of entries)
    aliases.forEach((alias, rank) => {
      if (!names.has(alias)) names.set(alias, { joint, rank });
    });
  return names;
}

/** Sided entries: `side` turns a base name into each side's spellings. */
const sided = (
  joint: string,
  bases: readonly string[],
  spell: (side: string, s: string, base: string) => readonly string[],
): (readonly [string, readonly string[]])[] =>
  sides.map(([side, s]) => [`${side}${joint}`, bases.flatMap((b) => spell(side, s, b))]);

const DIGITS = [
  ['Thumb', ['Metacarpal', 'Proximal', 'Distal']],
  ['Index', ['Proximal', 'Intermediate', 'Distal']],
  ['Middle', ['Proximal', 'Intermediate', 'Distal']],
  ['Ring', ['Proximal', 'Intermediate', 'Distal']],
  ['Little', ['Proximal', 'Intermediate', 'Distal']],
] as const;
/** Finger entries, `spell(digit name, 1-based bone number)` giving the base names. */
const fingers = (
  digit: (d: string) => readonly string[],
  spell: (side: string, s: string, base: string) => readonly string[],
) =>
  DIGITS.flatMap(([d, bones]) =>
    bones.flatMap((bone, i) =>
      sided(
        `${d}${bone}`,
        digit(d).flatMap((name) => [`${name}${i + 1}`, `${name}0${i + 1}`]),
        spell,
      ),
    ),
  );

const prefixOrSuffix = (side: string, s: string, b: string) => [
  `${side}${b}`,
  `${b}${side}`,
  `${s}${b}`,
  `${b}${s}`,
];

const MIXAMO: Names = (() => {
  const spell = (side: string, _s: string, b: string) => [`${side}${b}`];
  return dictionary([
    ['hips', ['hips']],
    ['spine', ['spine']],
    ['chest', ['spine1']],
    ['upperChest', ['spine2']],
    ['neck', ['neck']],
    ['head', ['head']],
    ...sided('Eye', ['eye'], spell),
    ...sided('Shoulder', ['shoulder'], spell),
    ...sided('UpperArm', ['arm'], spell),
    ...sided('LowerArm', ['forearm'], spell),
    ...sided('Hand', ['hand'], spell),
    ...fingers(
      (d) => [`hand${d === 'Little' ? 'pinky' : d.toLowerCase()}`],
      (side, _s, b) => [`${side}${b}`],
    ).map(([joint, names]) => [joint, names.filter((n) => !/0\d$/.test(n))] as const),
    ...sided('UpperLeg', ['upleg'], spell),
    ...sided('LowerLeg', ['leg'], spell),
    ...sided('Foot', ['foot'], spell),
    ...sided('Toes', ['toebase'], spell),
  ]);
})();

const UNREAL: Names = (() => {
  const spell = (_side: string, s: string, b: string) => [`${b}${s}`];
  return dictionary([
    ['hips', ['pelvis']],
    ['neck', ['neck01', 'neck']],
    ['head', ['head']],
    ...sided('Shoulder', ['clavicle'], spell),
    ...sided('UpperArm', ['upperarm'], spell),
    ...sided('LowerArm', ['lowerarm'], spell),
    ...sided('Hand', ['hand'], spell),
    ...fingers((d) => [d === 'Little' ? 'pinky' : d.toLowerCase()], spell).map(
      ([joint, names]) => [joint, names.filter((n) => /0\d[lr]$/.test(n))] as const,
    ),
    ...sided('UpperLeg', ['thigh'], spell),
    ...sided('LowerLeg', ['calf'], spell),
    ...sided('Foot', ['foot'], spell),
    ...sided('Toes', ['ball'], spell),
  ]);
})();

const RIGIFY: Names = (() => {
  const spell = (_side: string, s: string, b: string) => [`${b}${s}`];
  return dictionary([
    ['hips', ['spine']],
    ['spine', ['spine001']],
    ['chest', ['spine002']],
    ['upperChest', ['spine003']],
    ['neck', ['spine004']],
    ['head', ['spine006']],
    ['jaw', ['jaw']],
    ...sided('Eye', ['eye'], spell),
    ...sided('Shoulder', ['shoulder'], spell),
    ...sided('UpperArm', ['upperarm'], spell),
    ...sided('LowerArm', ['forearm'], spell),
    ...sided('Hand', ['hand'], spell),
    ...fingers(
      (d) => [d === 'Thumb' ? 'thumb' : `f${d === 'Little' ? 'pinky' : d.toLowerCase()}`],
      spell,
    ).map(([joint, names]) => [joint, names.filter((n) => /0\d[lr]$/.test(n))] as const),
    ...sided('UpperLeg', ['thigh'], spell),
    ...sided('LowerLeg', ['shin'], spell),
    ...sided('Foot', ['foot'], spell),
    ...sided('Toes', ['toe'], spell),
  ]);
})();

const GENERIC: Names = dictionary([
  ['hips', ['hips', 'pelvis', 'hip']],
  ['spine', ['spine']],
  ['chest', ['chest']],
  ['upperChest', ['upperchest']],
  ['neck', ['neck']],
  ['head', ['head']],
  ['jaw', ['jaw']],
  ...sided('Eye', ['eye'], prefixOrSuffix),
  ...sided('Shoulder', ['shoulder', 'clavicle'], prefixOrSuffix),
  ...sided('UpperArm', ['upperarm'], prefixOrSuffix),
  ...sided('LowerArm', ['lowerarm', 'forearm'], prefixOrSuffix),
  ...sided('Hand', ['wrist', 'hand'], prefixOrSuffix),
  ...fingers((d) => (d === 'Little' ? ['little', 'pinky'] : [d.toLowerCase()]), prefixOrSuffix),
  ...sided('UpperLeg', ['upperleg', 'thigh'], prefixOrSuffix),
  ...sided('LowerLeg', ['lowerleg', 'calf', 'shin'], prefixOrSuffix),
  ...sided('Foot', ['ankle', 'foot'], prefixOrSuffix),
  ...sided('Toes', ['toes', 'toe', 'toebase', 'ball'], prefixOrSuffix),
]);

function namesFor(convention: Convention, skeleton: Skeleton): Names | null {
  switch (convention) {
    case 'storystage':
      return dictionary(jointsOf(skeleton).map((d) => [d.id, [d.id.toLowerCase()]]));
    case 'alice':
      return dictionary(jointsOf(skeleton).map((d) => [d.id, d.alice.map(normalizeBoneName)]));
    default:
      if (skeleton !== 'biped') return null;
      return { mixamo: MIXAMO, unreal: UNREAL, rigify: RIGIFY, generic: GENERIC }[convention];
  }
}

/** Matches bones to joints with one convention: best rank wins, then the bone nearer the root. */
function match(
  bones: readonly string[],
  skeleton: Skeleton,
  convention: Convention,
): Map<string, string> | null {
  const names = namesFor(convention, skeleton);
  if (!names) return null;
  const best = new Map<string, { bone: string; rank: number }>();
  for (const bone of bones) {
    const hit = names.get(normalizeBoneName(bone));
    if (!hit) continue;
    const held = best.get(hit.joint);
    if (!held || hit.rank < held.rank) best.set(hit.joint, { bone, rank: hit.rank });
  }
  const found = new Map([...best].map(([joint, { bone }]) => [joint, bone]));
  if (convention === 'unreal' || convention === 'generic') numberedSpine(bones, found);
  if (convention === 'alice') ownAliceJoints(bones, skeleton, found);
  return found;
}

/**
 * A spine numbered from the hips (`spine_01` to `spine_05`) is spread over the spine, chest and
 * upper chest still free: first, middle and last.
 */
function numberedSpine(bones: readonly string[], found: Map<string, string>) {
  const used = new Set(found.values());
  const numbered = bones
    .map((bone) => ({ bone, m: /^spine(\d+)$/.exec(normalizeBoneName(bone)) }))
    .filter((x) => x.m && !used.has(x.bone))
    .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
    .map((x) => x.bone);
  const free = ['spine', 'chest', 'upperChest'].filter((j) => !found.has(j));
  const k = numbered.length;
  if (k === 0 || free.length === 0) return;
  if (k <= free.length) numbered.forEach((bone, i) => found.set(free[i]!, bone));
  else
    free.forEach((joint, i) =>
      found.set(
        joint,
        numbered[free.length === 1 ? 0 : Math.round((i * (k - 1)) / (free.length - 1))]!,
      ),
    );
}

/** Any other Alice joint the model has keeps a name made from Alice's (`SKIRT_BASE` → `skirtBase`). */
function ownAliceJoints(bones: readonly string[], skeleton: Skeleton, found: Map<string, string>) {
  const used = new Set(found.values());
  const known = new Set<string>(jointsOf(skeleton).map((d) => d.id));
  for (const bone of bones) {
    if (used.has(bone) || bone === 'ROOT' || !/^[A-Z][A-Z0-9_]*$/.test(bone)) continue;
    const id = jointFromAlice(skeleton, bone);
    if (known.has(id) || found.has(id)) continue;
    found.set(id, bone);
  }
}

/** Maps a model's bone names (root first, as in the file) onto the joint map for its class. */
export function mapSkeleton(bones: readonly string[], skeleton: Skeleton): SkeletonMapping {
  const required = JOINT_MAP[skeleton].filter((d) => d.required).map((d) => d.id);
  let pick: { convention: Convention; found: Map<string, string>; score: number[] } | null = null;
  for (const convention of CONVENTIONS) {
    const found = match(bones, skeleton, convention);
    if (!found) continue;
    const score = [required.filter((id) => found.has(id)).length, found.size];
    if (
      !pick ||
      score[0]! > pick.score[0]! ||
      (score[0] === pick.score[0] && score[1]! > pick.score[1]!)
    )
      pick = { convention, found, score };
  }
  const { convention, found } = pick!;
  const order = jointsOf(skeleton).map((d) => d.id as string);
  const ids = [
    ...order.filter((id) => found.has(id)),
    ...[...found.keys()].filter((id) => !order.includes(id)),
  ];
  const mapped: Record<string, string> = {};
  for (const id of ids) mapped[id] = found.get(id)!;
  const used = new Set(found.values());
  const missingRequired = required.filter((id) => !found.has(id));
  const status = missingRequired.length === 0 ? 'mapped' : 'prop-only';
  return {
    skeleton,
    convention,
    status,
    bones: mapped,
    joints: status === 'mapped' ? (ids as JointName[]) : 'prop-only',
    missingRequired,
    unmapped: bones.filter((b) => !used.has(b)),
  };
}
