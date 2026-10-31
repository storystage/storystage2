/**
 * WP0.8 contract: the production and storyboard data. One `.storystage` file holds a whole
 * production: its scenes and their code, the running order, the storyboard, the script and
 * the frames (decision 0011; WP8.1 writes the full format spec, `docs/spec/03-production-format.md`).
 *
 * Owner: S2 until the format spec (8.1) merges, then S4. A change here is a `contract` pull
 * request. Users: the Storyboard (S5), the Production stage, the Screening room and export (S2),
 * the Prompter's storyboard tools (S7), Alice import (S6) and the self-test (S1).
 *
 * **Never stored in a production:** API keys, Prompter conversations, camera images, and
 * microphone audio other than lines the learner chose to record (decision 0005, CLAUDE.md rule 3;
 * spec section 1.1).
 */
import {
  indexProgram,
  type NodeId,
  type Problem,
  type Program,
  type TypeDecl,
} from '@storystage/ast';
import type { Facing } from '@storystage/backstage';
import type { BackstageId, Micros, SceneSetup, ShotType, StandIn } from '@storystage/story-api';

export const FORMAT_VERSION = '1.0.0';

export type SceneId = string & { readonly __sceneId: true };
export type FrameId = string & { readonly __frameId: true };
export type LineId = string & { readonly __lineId: true };
export const sceneId = (s: string) => s as SceneId;
export const frameId = (s: string) => s as FrameId;
export const lineId = (s: string) => s as LineId;

/** Scene and frame ids become file names in the zip, so nothing else may get through. */
export const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Where each part lives inside the `.storystage` zip (WP8.1). */
export const ZIP_LAYOUT = {
  manifest: 'manifest.json',
  program: 'program.json',
  scene: (id: SceneId) => `scenes/${id}.json`,
  storyboard: 'storyboard.json',
  script: 'script.fountain',
  frame: (id: FrameId) => `frames/${id}.json`,
  audio: 'audio/',
} as const;

/** How one scene gives way to the next (WP8.3). */
export interface Transition {
  readonly kind: 'cut' | 'fadeToBlack' | 'crossfade';
  /** Ignored for a cut. */
  readonly duration: Micros;
}

/** `manifest.json`. */
export interface ProductionManifest {
  readonly format: 'storystage';
  readonly formatVersion: string;
  readonly createdWith: { readonly app: 'StoryStage'; readonly version: string };
  readonly title: string;
  /** Where it came from. An imported Alice world can relax the storyboard rule (WP9.3, 10.8). */
  readonly origin: 'storystage' | 'alice';
  /** The order scenes play in, and how each one ends. Every scene is in it exactly once. */
  readonly runningOrder: readonly { readonly scene: SceneId; readonly transition: Transition }[];
  /** Learner-recorded audio in `audio/` (narration, lines), by file name. */
  readonly audio: readonly {
    readonly file: string;
    readonly scene: SceneId | null;
    readonly label: string;
  }[];
}

/** Arc templates (WP10.2): free, 3-part, 5-part, or a curriculum template by id (WP16). */
export type ArcTemplate = 'free' | 'threePart' | 'fivePart' | { readonly curriculum: string };

/** A scene's card on the storyboard (WP10.3). */
export interface SceneCard {
  readonly id: SceneId;
  /** Place and time, as a script heading: "Forest, night". */
  readonly heading: string;
  readonly cast: readonly (BackstageId | StandIn)[];
  /** Which part of the arc it belongs to, by the template's part name. */
  readonly arcPart: string | null;
}

/** `storyboard.json`. */
export interface Storyboard {
  readonly logline: string;
  readonly synopsis: string;
  readonly arc: { readonly template: ArcTemplate; readonly parts: readonly string[] };
  readonly cards: readonly SceneCard[];
}

/** A script line under a scene heading (WP10.4). Stored as `script.fountain`. */
export interface ScriptLine {
  readonly id: LineId;
  readonly scene: SceneId;
  readonly kind: 'action' | 'dialogue';
  /** For dialogue: the character's name as written in the script. */
  readonly character: string | null;
  readonly text: string;
  /** The frame this line is pinned to, if any. */
  readonly pinnedFrame: FrameId | null;
}

/** A sketch placed on a frame (WP10.6). Positions are fractions of the frame, from the top left. */
export interface PlacedSketch {
  readonly id: string;
  readonly item: BackstageId | StandIn;
  readonly facing: Facing;
  readonly pose: string | null;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly flipped: boolean;
  readonly layer: number;
}

/** `frames/<id>.json`: one storyboard frame (WP10.6) and its links to code (WP10.8). */
export interface Frame {
  readonly id: FrameId;
  readonly scene: SceneId;
  /** Position within the scene, from 0. */
  readonly order: number;
  readonly caption: string;
  readonly shot: ShotType;
  readonly lengthSeconds: number;
  readonly sketches: readonly PlacedSketch[];
  /** The blocks this frame is linked to. */
  readonly links: readonly NodeId[];
}

/** `scenes/<id>.json`: how a scene starts, and the method that runs it (WP8.2). */
export interface Scene {
  readonly id: SceneId;
  readonly setup: SceneSetup;
  /** The scene's script method in `program.json`. */
  readonly method: NodeId;
}

/** A whole production in memory, as read from or written to a `.storystage` file. */
export interface Production {
  readonly manifest: ProductionManifest;
  readonly program: Program;
  readonly scenes: readonly Scene[];
  readonly storyboard: Storyboard;
  readonly script: readonly ScriptLine[];
  readonly frames: readonly Frame[];
}

/** Each scene's script method, the type holding it and the problems with it (spec section 2). */
function checkSceneTypes(p: Production, problems: string[]): void {
  const index = indexProgram(p.program);
  const owners = new Map<string, SceneId>();
  for (const scene of p.scenes) {
    const at = index.get(scene.method);
    if (!at || at.node.kind !== 'method') {
      problems.push(`Scene ${scene.id}'s method ${scene.method} doesn't exist.`);
      continue;
    }
    const type = index.get(at.parent!)!.node as TypeDecl;
    if (type.extends.kind !== 'story' || type.extends.name !== 'Scene') {
      problems.push(`Scene ${scene.id}'s method isn't in a type extending Scene.`);
      continue;
    }
    const owner = owners.get(type.id);
    if (owner) problems.push(`Scenes ${owner} and ${scene.id} share a type.`);
    owners.set(type.id, scene.id);
    checkObjects(scene, type, problems);
  }
}

/** The scene's objects and its fields with no value of their own have to match. */
function checkObjects(scene: Scene, type: TypeDecl, problems: string[]): void {
  const fields = new Map(
    type.fields.filter((f) => f.initial === null && f.name !== 'camera').map((f) => [f.name, f]),
  );
  for (const object of scene.setup.objects) {
    const field = fields.get(object.id);
    if (!field) {
      problems.push(`Scene ${scene.id} sets up ${object.id}, which has no field.`);
      continue;
    }
    fields.delete(object.id);
    if (field.type.kind === 'story' && field.type.name !== object.class)
      problems.push(
        `Scene ${scene.id}: ${object.id} is a ${object.class} in the set-up and a ${field.type.name} in code.`,
      );
  }
  for (const name of fields.keys())
    problems.push(`Scene ${scene.id} has a field ${name}, but no object in its set-up.`);
}

/**
 * Checks that every reference inside a production points at something that exists: scenes in
 * the running order, cards, frames, script lines and pins, and between scenes and the program
 * (spec section 2). Links to blocks aren't checked: a removed block may come back on undo. Part
 * of import hardening (WP8.4). Returns developer-facing problems; an empty list means the
 * references are sound.
 */
export function checkReferences(p: Production): string[] {
  const problems: string[] = [];
  const scenes = new Set(p.scenes.map((s) => s.id));
  const cards = new Set(p.storyboard.cards.map((c) => c.id));
  const frames = new Set(p.frames.map((f) => f.id));
  const dup = (kind: string, ids: readonly string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`Two ${kind} have the id ${id}.`);
      seen.add(id);
    }
  };
  dup(
    'scenes',
    p.scenes.map((s) => s.id),
  );
  dup(
    'frames',
    p.frames.map((f) => f.id),
  );
  dup(
    'script lines',
    p.script.map((l) => l.id),
  );
  for (const s of scenes)
    if (!SAFE_ID.test(s)) problems.push(`Scene id ${s} is not safe as a file name.`);
  for (const f of frames)
    if (!SAFE_ID.test(f)) problems.push(`Frame id ${f} is not safe as a file name.`);
  for (const { scene } of p.manifest.runningOrder)
    if (!scenes.has(scene))
      problems.push(`The running order lists scene ${scene}, which doesn't exist.`);
  for (const s of scenes) {
    const times = p.manifest.runningOrder.filter((r) => r.scene === s).length;
    if (times === 0) problems.push(`Scene ${s} is not in the running order.`);
    if (times > 1) problems.push(`Scene ${s} is in the running order twice.`);
  }
  checkSceneTypes(p, problems);
  for (const s of scenes) if (!cards.has(s)) problems.push(`Scene ${s} has no storyboard card.`);
  for (const c of cards) if (!scenes.has(c)) problems.push(`Card ${c} has no scene.`);
  const places = new Map<string, FrameId>();
  for (const f of p.frames) {
    if (!scenes.has(f.scene))
      problems.push(`Frame ${f.id} belongs to scene ${f.scene}, which doesn't exist.`);
    const place = `${f.scene} ${f.order}`;
    const other = places.get(place);
    if (other)
      problems.push(
        `Frames ${other} and ${f.id} are both at place ${f.order} in scene ${f.scene}.`,
      );
    places.set(place, f.id);
  }
  for (const l of p.script) {
    if (!scenes.has(l.scene))
      problems.push(`Line ${l.id} is under scene ${l.scene}, which doesn't exist.`);
    if (l.pinnedFrame !== null && !frames.has(l.pinnedFrame))
      problems.push(`Line ${l.id} is pinned to frame ${l.pinnedFrame}, which doesn't exist.`);
  }
  for (const a of p.manifest.audio)
    if (a.file.includes('/') || a.file.includes('\\') || a.file.startsWith('.'))
      problems.push(`Audio file name ${a.file} must be a plain name inside audio/.`);
  return problems;
}

/**
 * The `check` for an `EditSession`: an edit can't remove a scene's script method. Deleting a
 * scene is the production's own step (WP8.2, spec section 2.1).
 */
export function sceneMethodCheck(scenes: readonly Scene[]): (program: Program) => Problem[] {
  return (program) => {
    const index = indexProgram(program);
    return scenes
      .filter((scene) => !index.has(scene.method))
      .map((scene) => ({
        code: 'outside',
        message: `Scene ${scene.id}'s script method is gone.`,
        node: scene.method,
        reason: 'Every scene needs its first method, so this one has to stay.',
      }));
  };
}
