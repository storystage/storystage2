/**
 * Set the stage from the storyboard (WP10.10; M4 gate section 4): what a scene's first frame shows,
 * placed on its stage. The automatic check's geometry run backwards (spec 08 section 9.2,
 * `@storystage/check`): a sketch's side of the frame is the side of the picture, its height on
 * the frame is how near the camera it stands, and its view and flip are which way it faces.
 * Cast who appear only in later frames wait just off stage, on the side they come in from. The
 * backdrop sketch chooses a backdrop from Backstage that looks like it.
 */
import { facing, type View } from '@storystage/check';
import { UNFLIPPED_FACES } from '@storystage/check';
import type { BackstageItem } from '@storystage/backstage';
import {
  addObject,
  type PlacedSketch,
  type Production,
  type SceneId,
  type SceneRefusal,
  type SceneStep,
} from '@storystage/production';
import { backdropSketchFor } from '@storystage/sketches';
import type { BackstageId, StandIn, StoryClass, Transform, Vec3 } from '@storystage/story-api';
import { sceneFrames } from '../storyboard/frames.ts';
import { STANDARD_HEIGHT } from '../storyboard/FramePicture.tsx';
import { backdropPartOf, withBackdrop, type BackdropPart } from './setup.ts';

/** The stage's lens when the camera has no field of view of its own: Alice's, in turns. */
export const DEFAULT_LENS = 0.5 / (2 * Math.PI);
/** The picture's shape. */
const ASPECT = 16 / 9;
/** How tall something is when nothing says: a person. */
const USUAL_HEIGHT = 1.6;
/** Nearer than this, or further, and a sketch's size is taken as a guess too far. */
const NEAREST = 1.5;
const FURTHEST = 60;
/** How far off stage someone waits, past the picture's edge, as a share of its width. */
const OFF_STAGE = 0.2;
/** How much of the picture's height a character takes in a wide shot, at most, and a close-up, at least (as the check judges). */
const WIDE_AT_MOST = 0.55;
const CLOSE_UP_AT_LEAST = 0.45;

/** One thing the storyboard shows, and where it goes. */
export type Placement =
  | {
      readonly kind: 'object';
      /** Stable, for Choose what to place. */
      readonly key: string;
      readonly section: 'cast' | 'props' | 'set';
      readonly name: string;
      readonly model: BackstageId | StandIn;
      readonly class: StoryClass;
      readonly transform: Transform;
      /** In a later frame only: waits just off stage. */
      readonly offStage: boolean;
    }
  | {
      readonly kind: 'backdrop';
      readonly key: string;
      readonly name: string;
      readonly part: BackdropPart;
      readonly id: BackstageId;
    };

/** What the plan needs to know about Backstage. */
export interface PlanBackstage {
  /** A model's catalogue entry, shipped or the class's. */
  item(id: string): BackstageItem | undefined;
  /** The catalogue's backdrops, to find one like a backdrop sketch. */
  readonly backdrops: readonly BackstageItem[];
}

const isMark = (item: PlacedSketch['item']) =>
  typeof item === 'string' && (item.startsWith('mark/') || item.startsWith('backdrop/'));
const keyOf = (item: BackstageId | StandIn) =>
  typeof item === 'string' ? item : `standIn:${item.standIn}`;
const sameModel = (a: BackstageId | StandIn, b: BackstageId | StandIn) => keyOf(a) === keyOf(b);

/** How far round from facing the camera each view is, in radians. */
const TURN: Record<View, number> = {
  front: 0,
  threeQuarter: Math.PI / 4,
  side: Math.PI / 2,
  back: Math.PI,
};

const yaw = (angle: number) => ({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
const round = (n: number) => Math.round(n * 1000) / 1000;

/** The camera's heading and its left on the ground (its +X is the picture's left). */
function groundAxes(camera: Transform) {
  const { x, y, z, w } = camera.rotation;
  // The camera's +Z and +X, turned by its rotation.
  const ahead = { x: 2 * (x * z + w * y), z: 1 - 2 * (x * x + y * y) };
  const left = { x: 1 - 2 * (y * y + z * z), z: 2 * (x * z - w * y) };
  const a = Math.hypot(ahead.x, ahead.z) || 1;
  const l = Math.hypot(left.x, left.z) || 1;
  return { ahead: { x: ahead.x / a, z: ahead.z / a }, left: { x: left.x / l, z: left.z / l } };
}

/**
 * Where something `height` metres tall stands to look as a sketch does: across the picture at
 * `x` (0 its left, 1 its right), filling `share` of the picture's height, facing as `view` says.
 */
export function placeLike(
  camera: Transform,
  lens: number,
  height: number,
  x: number,
  share: number,
  view: View,
  towards: 'left' | 'right' | null,
): Transform {
  const tanV = Math.tan(lens * Math.PI);
  const tanH = tanV * ASPECT;
  const depth = Math.min(FURTHEST, Math.max(NEAREST, height / (2 * Math.max(share, 0.01) * tanV)));
  const across = (0.5 - x) * 2 * tanH * depth;
  const { ahead, left } = groundAxes(camera);
  const position: Vec3 = {
    x: round(camera.position.x + ahead.x * depth + left.x * across),
    y: 0,
    z: round(camera.position.z + ahead.z * depth + left.z * across),
  };
  // Facing the camera, then turned by the view, the way the sketch faces across the picture.
  const toCamera = Math.atan2(camera.position.x - position.x, camera.position.z - position.z);
  const scale = { x: 1, y: 1, z: 1 };
  const turned = [toCamera + TURN[view], toCamera - TURN[view]].map((a) => ({
    position,
    rotation: yaw(a),
    scale,
  }));
  if (!towards || view === 'front' || view === 'back') return turned[0]!;
  return turned.find((t) => facing(t, camera).towards === towards) ?? turned[0]!;
}

/** Which way an unflipped or flipped sketch faces across the picture. */
const towardsOf = (s: PlacedSketch): 'left' | 'right' =>
  s.flipped === (UNFLIPPED_FACES === 'left') ? 'right' : 'left';

/** What a model or stand-in is, for placing it. */
function describe(item: BackstageId | StandIn, backstage: PlanBackstage) {
  if (typeof item !== 'string')
    return {
      section: 'cast' as const,
      name: item.standIn,
      class: 'Biped' as StoryClass,
      height: item.size?.y ?? USUAL_HEIGHT,
    };
  const found = backstage.item(item);
  if (!found) return null;
  const section = found.section === 'backdrops' ? null : found.section;
  if (!section) return null;
  return {
    section,
    name: found.displayName,
    class: found.class as StoryClass,
    height: found.defaultSize.height,
  };
}

/** How much of the picture's height a sketch fills, kept within what the frame's shot allows. */
function shareOf(s: PlacedSketch, shot: string): number {
  const share = STANDARD_HEIGHT * s.scale;
  if (shot === 'wide') return Math.min(share, WIDE_AT_MOST);
  if (shot === 'closeUp') return Math.max(share, CLOSE_UP_AT_LEAST);
  return share;
}

/**
 * What the scene's storyboard shows that its stage doesn't have yet, and where each goes: the
 * first frame's characters, props and set where they're sketched, the cast of later frames off
 * stage, and a backdrop like the first frame's backdrop sketch. Things already on the stage are
 * left where they are.
 */
export function storyboardPlan(
  p: Production,
  scene: SceneId,
  backstage: PlanBackstage,
): Placement[] {
  const setup = p.scenes.find((s) => s.id === scene)?.setup;
  const [first, ...later] = sceneFrames(p, scene);
  if (!setup || !first) return [];
  const camera = setup.camera.transform;
  const degrees = setup.camera.fieldOfViewDegrees;
  const lens = degrees === undefined ? DEFAULT_LENS : degrees / 360;
  const plan: Placement[] = [];
  // Objects already standing in for a model: each matches one sketch of it, left to right.
  const taken = new Map<string, number>();
  const onStage = (item: BackstageId | StandIn) => {
    const key = keyOf(item);
    const have = setup.objects.filter((o) => sameModel(o.model, item)).length;
    const used = taken.get(key) ?? 0;
    taken.set(key, used + 1);
    return used < have;
  };

  const sketched = [...first.sketches].filter((s) => !isMark(s.item)).sort((a, b) => a.x - b.x);
  for (const s of sketched) {
    const what = describe(s.item, backstage);
    if (!what || onStage(s.item)) continue;
    plan.push({
      kind: 'object',
      key: `sketch:${s.id}`,
      section: what.section,
      name: what.name,
      model: s.item,
      class: what.class,
      transform: placeLike(
        camera,
        lens,
        what.height,
        s.x,
        shareOf(s, first.shot),
        s.facing as View,
        towardsOf(s),
      ),
      offStage: false,
    });
  }

  // Cast first seen in a later frame wait off stage, on the side they're first sketched,
  // facing in.
  const placed = new Set(sketched.map((s) => keyOf(s.item)));
  for (const frame of later)
    for (const s of frame.sketches) {
      const key = keyOf(s.item);
      if (isMark(s.item) || placed.has(key)) continue;
      placed.add(key);
      const what = describe(s.item, backstage);
      if (!what || what.section !== 'cast' || onStage(s.item)) continue;
      const fromLeft = s.x < 0.5;
      plan.push({
        kind: 'object',
        key: `later:${key}`,
        section: 'cast',
        name: what.name,
        model: s.item,
        class: what.class,
        transform: placeLike(
          camera,
          lens,
          what.height,
          fromLeft ? -OFF_STAGE : 1 + OFF_STAGE,
          shareOf(s, frame.shot),
          'side',
          fromLeft ? 'right' : 'left',
        ),
        offStage: true,
      });
    }

  // The backdrop: for each part, the first Backstage backdrop whose sketch is the one drawn.
  const drawn = new Set<string>(
    first.sketches.flatMap((s) =>
      typeof s.item === 'string' && s.item.startsWith('backdrop/') ? [s.item] : [],
    ),
  );
  const parts = new Set<BackdropPart>();
  for (const item of backstage.backdrops) {
    const part = backdropPartOf(item.class);
    if (!part || parts.has(part) || !drawn.has(backdropSketchFor(item).id)) continue;
    parts.add(part);
    if (setup.backdrop[part] === item.id) continue;
    plan.push({
      kind: 'backdrop',
      key: `backdrop:${part}`,
      name: item.displayName,
      part,
      id: item.id as BackstageId,
    });
  }
  return plan;
}

/**
 * The plan, or the part of it chosen, placed as one step ("Set up scene 1 from the storyboard"):
 * each object added as \`addObject\` adds one, then the backdrop. Undo takes it all away at once.
 */
export function placeFromStoryboard(
  p: Production,
  scene: SceneId,
  plan: readonly Placement[],
  label: string,
): { ok: true; step: SceneStep } | { ok: false; refusal: SceneRefusal; name: string } {
  let now = p;
  const edits: SceneStep['edits'][number][] = [];
  let inverses: SceneStep['inverses'][number][] = [];
  for (const place of plan) {
    if (place.kind === 'backdrop') {
      now = withBackdrop(now, scene, place.part, place.id);
      continue;
    }
    const added = addObject(
      now,
      scene,
      { model: place.model, class: place.class, name: place.name, transform: place.transform },
      label,
    );
    if (!added.ok) return { ok: false, refusal: added.refusal, name: place.name };
    edits.push(...added.step.edits);
    inverses = [...added.step.inverses, ...inverses];
    now = added.step.production;
  }
  return { ok: true, step: { label, production: now, edits, inverses } };
}
