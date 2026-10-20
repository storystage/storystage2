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
 * microphone audio other than lines the learner chose to record (decision 0005, CLAUDE.md rule 3).
 */
import type { NodeId, Program } from '@storystage/ast';
import type { Facing } from '@storystage/backstage';
import type { BackstageId, Micros, SceneSetup, ShotType, StandIn } from '@storystage/story-api';

export const FORMAT_VERSION = '1.0.0';

export type SceneId = string & { readonly __sceneId: true };
export type FrameId = string & { readonly __frameId: true };
export type LineId = string & { readonly __lineId: true };
export const sceneId = (s: string) => s as SceneId;
export const frameId = (s: string) => s as FrameId;
export const lineId = (s: string) => s as LineId;

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
  /** The order scenes play in, and how each one ends. */
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

/**
 * Checks that every reference inside a production points at something that exists: scenes in
 * the running order, cards, frames, script lines and pins. Part of import hardening (WP8.4).
 * Returns developer-facing problems; an empty list means the references are sound.
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
  for (const { scene } of p.manifest.runningOrder)
    if (!scenes.has(scene))
      problems.push(`The running order lists scene ${scene}, which doesn't exist.`);
  for (const s of scenes) if (!cards.has(s)) problems.push(`Scene ${s} has no storyboard card.`);
  for (const c of cards) if (!scenes.has(c)) problems.push(`Card ${c} has no scene.`);
  for (const f of p.frames)
    if (!scenes.has(f.scene))
      problems.push(`Frame ${f.id} belongs to scene ${f.scene}, which doesn't exist.`);
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
