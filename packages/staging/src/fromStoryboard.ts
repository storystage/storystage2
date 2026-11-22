/**
 * Set the stage from the storyboard (WP10.10; M4 gate section 4): what a scene's first frame shows,
 * placed on its stage. The automatic check's geometry run backwards (spec 08 section 9.2,
 * `@storystage/check`): a sketch's side of the frame is the side of the picture, its height on
 * the frame is how near the camera it stands, and its view and flip are which way it faces.
 * Cast who appear only in later frames wait just off stage, on the side they come in from. The
 * backdrop sketch chooses a backdrop from Backstage that looks like it, and the scene's heading
 * ("Forest, night") chooses any part that neither the sketch nor the stage has. The camera moves
 * only when something already on the stage would break the first frame's shot.
 */
import {
  facing,
  heightOnPicture,
  inCamera,
  project,
  rotate,
  UNFLIPPED_FACES,
  type View,
} from '@storystage/check';
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
import type {
  BackstageId,
  SceneObjectSetup,
  StandIn,
  StoryClass,
  Transform,
  Vec3,
} from '@storystage/story-api';
import { newObjectType } from './models.ts';
import {
  STANDARD_HEIGHT,
  backdropPartOf,
  sceneFrames,
  withBackdrop,
  withCamera,
  type BackdropPart,
} from './scene.ts';

/** The stage's lens when the camera has no field of view of its own: Alice's, in turns. */
export const DEFAULT_LENS = 0.5 / (2 * Math.PI);
/** The picture's shape. */
const ASPECT = 16 / 9;
/**
 * How tall a stand-in is when it has no size: the stage's `STAND_IN_BOX` is a metre high, and
 * the check measures it so.
 */
const STAND_IN_HEIGHT = 1;
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
      /** What chose it: a backdrop sketch on the first frame, or the scene's heading. */
      readonly from: 'sketch' | 'heading';
    }
  | {
      readonly kind: 'camera';
      readonly key: 'camera';
      /** The first frame's shot, which the camera moves for. */
      readonly shot: 'closeUp' | 'wide';
      /** A close-up's subject. */
      readonly name: string | null;
      readonly transform: Transform;
    };

/** What the plan needs to know about Backstage. */
export interface PlanBackstage {
  /** A model's catalogue entry, shipped or the class's. */
  item(id: string): BackstageItem | undefined;
  /** The catalogue's backdrops, to find one like a backdrop sketch or the scene's heading. */
  readonly backdrops: readonly BackstageItem[];
}

export interface PlanOptions {
  /**
   * False to leave the camera where it is, and place everything for it: what Choose what to
   * place does when the camera is left out. Default true.
   */
  readonly moveCamera?: boolean;
}

const isMark = (item: PlacedSketch['item']) =>
  typeof item === 'string' && (item.startsWith('mark/') || item.startsWith('backdrop/'));
const keyOf = (item: BackstageId | StandIn) =>
  typeof item === 'string' ? item : `standIn:${item.standIn}`;

/** Which model an object placement is of, whichever frame it came from: for "new cast". */
export const modelKey = (p: Extract<Placement, { kind: 'object' }>) => keyOf(p.model);

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
      height: item.size?.y ?? STAND_IN_HEIGHT,
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

// The scene's heading, read for a backdrop: "Forest, night".

/** Words a heading uses that Backstage's backdrops call something else. */
const LIKE: Readonly<Record<string, string>> = {
  morning: 'day',
  afternoon: 'day',
  noon: 'day',
  midday: 'day',
  daytime: 'day',
  daylight: 'day',
  sunny: 'day',
  dawn: 'evening',
  sunrise: 'evening',
  dusk: 'evening',
  sundown: 'evening',
  twilight: 'evening',
  midnight: 'night',
  woods: 'forest',
  woodland: 'forest',
  tree: 'forest',
  trees: 'forest',
  seaside: 'beach',
  shore: 'beach',
  coast: 'beach',
  ocean: 'sea',
  underwater: 'sea',
  home: 'room',
  house: 'room',
  kitchen: 'room',
  bedroom: 'room',
  classroom: 'room',
  hall: 'room',
  office: 'room',
  street: 'town',
  city: 'town',
  village: 'town',
  arctic: 'snow',
  snowy: 'snow',
  planet: 'space',
  meadow: 'grass',
  park: 'grass',
  garden: 'grass',
};
const UNSAID = new Set(['a', 'an', 'the', 'of', 'in', 'at', 'on', 'by', 'and', 'int', 'ext']);
const stem = (w: string) =>
  w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0 && !UNSAID.has(w));

/**
 * For each backdrop part, the Backstage backdrop most like the heading's words, if any is: a word
 * in its name counts most, then one of its themes, then its description. A tie goes to the name
 * with fewer words the heading doesn't say ("Forest floor" for "woods", not "Dark forest floor"),
 * then to the first in the catalogue.
 */
export function headingBackdrops(
  heading: string,
  backdrops: readonly BackstageItem[],
): Map<BackdropPart, BackstageItem> {
  const said = wordsOf(heading).map((w) => stem(LIKE[w] ?? w));
  const best = new Map<BackdropPart, { item: BackstageItem; score: number; unsaid: number }>();
  if (said.length === 0) return new Map();
  for (const item of backdrops) {
    const part = backdropPartOf(item.class);
    if (!part) continue;
    const name = new Set(wordsOf(item.displayName).map(stem));
    const themes = new Set(item.themes.flatMap(wordsOf).map(stem));
    const about = new Set(wordsOf(item.description ?? '').map(stem));
    let score = 0;
    for (const w of said) score += name.has(w) ? 3 : themes.has(w) ? 2 : about.has(w) ? 1 : 0;
    const unsaid = [...name].filter((w) => !said.includes(w)).length;
    const was = best.get(part);
    if (score > 0 && (!was || score > was.score || (score === was.score && unsaid < was.unsaid)))
      best.set(part, { item, score, unsaid });
  }
  return new Map([...best].map(([part, { item }]) => [part, item]));
}

// The camera, for the first frame's shot.

const middleOf = (o: SceneObjectSetup, height: number): Vec3 => ({
  x: o.transform.position.x,
  y: o.transform.position.y + height / 2,
  z: o.transform.position.z,
});

/**
 * Where the camera goes so that what's already on the stage keeps the first frame's shot, or
 * `null` when it does already: nearer its subject for a close-up, along the line it sees it on
 * (so it stays where it is on the picture), or further back for a wide shot.
 */
function cameraForShot(
  camera: Transform,
  lens: number,
  shot: string,
  subject: {
    readonly object: SceneObjectSetup;
    readonly height: number;
    readonly share: number;
  } | null,
  standing: readonly { readonly object: SceneObjectSetup; readonly height: number }[],
): Transform | null {
  const tanV = Math.tan(lens * Math.PI);
  const at = (p: Vec3): Transform => ({
    ...camera,
    position: { x: round(p.x), y: round(p.y), z: round(p.z) },
  });
  if (shot === 'closeUp' && subject) {
    const middle = middleOf(subject.object, subject.height);
    const depth = inCamera(camera, middle).z;
    if (depth <= 0 || heightOnPicture(subject.height, depth, lens) >= CLOSE_UP_AT_LEAST)
      return null;
    const goes = 1 - subject.height / (2 * subject.share * tanV) / depth;
    const c = camera.position;
    return at({
      x: c.x + (middle.x - c.x) * goes,
      y: c.y + (middle.y - c.y) * goes,
      z: c.z + (middle.z - c.z) * goes,
    });
  }
  if (shot === 'wide') {
    // How far back the camera goes for the nearest to fit.
    let back = 0;
    for (const { object, height } of standing) {
      const depth = inCamera(camera, middleOf(object, height)).z;
      if (depth <= 0 || heightOnPicture(height, depth, lens) <= WIDE_AT_MOST) continue;
      back = Math.max(back, height / (2 * WIDE_AT_MOST * tanV) - depth);
    }
    if (back === 0) return null;
    const ahead = rotate(camera.rotation, { x: 0, y: 0, z: 1 });
    const c = camera.position;
    return at({ x: c.x - ahead.x * back, y: c.y - ahead.y * back, z: c.z - ahead.z * back });
  }
  return null;
}

/**
 * What the scene's storyboard shows that its stage doesn't have yet, and where each goes: the
 * first frame's characters, props and set where they're sketched, the cast of later frames off
 * stage, a backdrop like the first frame's backdrop sketch or its heading, and the camera where
 * the first frame's shot needs it. Things already on the stage are left where they are.
 */
export function storyboardPlan(
  p: Production,
  scene: SceneId,
  backstage: PlanBackstage,
  options: PlanOptions = {},
): Placement[] {
  const setup = p.scenes.find((s) => s.id === scene)?.setup;
  const [first, ...later] = sceneFrames(p, scene);
  if (!setup || !first) return [];
  const here = setup.camera.transform;
  const degrees = setup.camera.fieldOfViewDegrees;
  const lens = degrees === undefined ? DEFAULT_LENS : degrees / 360;
  const plan: Placement[] = [];

  // Objects already on the stage, each matched to a sketch of its model, left to right on both
  // (as the check matches them).
  const sketched = first.sketches.filter((s) => !isMark(s.item));
  const matched = new Map<string, SceneObjectSetup>();
  const spare = new Map<string, number>();
  for (const key of new Set(setup.objects.map((o) => keyOf(o.model)))) {
    const sketches = sketched.filter((s) => keyOf(s.item) === key).sort((a, b) => a.x - b.x);
    const standing = setup.objects
      .filter((o) => keyOf(o.model) === key)
      .sort(
        (a, b) =>
          project(here, lens, a.transform.position).x - project(here, lens, b.transform.position).x,
      );
    sketches.forEach((s, i) => {
      const object = standing[i];
      if (object) matched.set(s.id, object);
    });
    spare.set(key, Math.max(0, standing.length - sketches.length));
  }

  // The camera, for the first frame's shot: the check's subject is its first character sketch.
  // It moves only for heights Backstage knows, never for a guess.
  const known = [...matched].flatMap(([sketch, object]) => {
    const what = describe(object.model, backstage);
    return what ? [{ sketch, object, height: what.height * object.transform.scale.y }] : [];
  });
  const subjectSketch = sketched.find((s) => describe(s.item, backstage));
  const subject = subjectSketch && known.find((k) => k.sketch === subjectSketch.id);
  const moved =
    options.moveCamera === false
      ? null
      : cameraForShot(
          here,
          lens,
          first.shot,
          subject ? { ...subject, share: shareOf(subjectSketch!, 'closeUp') } : null,
          known,
        );
  const camera = moved ?? here;

  for (const s of [...sketched].sort((a, b) => a.x - b.x)) {
    const what = describe(s.item, backstage);
    if (!what || matched.has(s.id)) continue;
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
      if (!what || what.section !== 'cast' || (spare.get(key) ?? 0) > 0) continue;
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
      from: 'sketch',
    });
  }
  // Then the heading, for a part that neither the sketches nor the stage has.
  const heading = p.storyboard.cards.find((c) => c.id === scene)?.heading ?? '';
  for (const [part, item] of headingBackdrops(heading, backstage.backdrops))
    if (!parts.has(part) && setup.backdrop[part] === undefined)
      plan.push({
        kind: 'backdrop',
        key: `backdrop:${part}`,
        name: item.displayName,
        part,
        id: item.id as BackstageId,
        from: 'heading',
      });

  if (moved)
    plan.push({
      kind: 'camera',
      key: 'camera',
      shot: first.shot === 'closeUp' ? 'closeUp' : 'wide',
      name:
        first.shot === 'closeUp' ? (describe(subjectSketch!.item, backstage)?.name ?? null) : null,
      transform: moved,
    });
  return plan;
}

/**
 * The plan, or the part of it chosen, placed as one step ("Set up scene 1 from the storyboard"):
 * each object added as `addObject` adds one, of the learner's class for its model if there is one
 * (decision 0074), then the backdrop and the camera. Undo takes it all away at once.
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
    if (place.kind === 'camera') {
      now = withCamera(now, scene, place.transform);
      continue;
    }
    const added = addObject(
      now,
      scene,
      {
        model: place.model,
        class: place.class,
        name: place.name,
        transform: place.transform,
        type: newObjectType(now, place),
      },
      label,
    );
    if (!added.ok) return { ok: false, refusal: added.refusal, name: place.name };
    edits.push(...added.step.edits);
    inverses = [...added.step.inverses, ...inverses];
    now = added.step.production;
  }
  return { ok: true, step: { label, production: now, edits, inverses } };
}

/**
 * What Choose what to place places: the plan's chosen part, or, with the camera left out, the
 * same things placed for the camera where it is.
 */
export function chosenPlan(
  p: Production,
  scene: SceneId,
  backstage: PlanBackstage,
  plan: readonly Placement[],
  chosen: ReadonlySet<string>,
): Placement[] {
  const camera = plan.some((x) => x.kind === 'camera');
  const from =
    camera && !chosen.has('camera')
      ? storyboardPlan(p, scene, backstage, { moveCamera: false })
      : plan;
  return from.filter((x) => chosen.has(x.key));
}
