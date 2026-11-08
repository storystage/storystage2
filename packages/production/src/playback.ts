/**
 * WP8.3: which scene plays next, and how one scene gives way to the next
 * (`docs/spec/03-production-format.md`, section 3). Pure: the player (Storyboard play, the
 * Screening room, the export) asks, and the runtime and the stage do the playing.
 *
 * Agreed with S6 (the Story API's `goToScene`, `crossfade` and `fadeToBlack`) and S3 (the stage
 * draws fades and crossfades) on 8 Nov 2026; the runtime's part is S2's.
 */
import type { Program } from '@storystage/ast';
import type { Micros } from '@storystage/story-api';
import type { Production, SceneId, Transition } from './types.ts';

/** Play stops after this many scene starts: `goToScene` can go backwards, so a film might never end. */
export const SCENE_START_LIMIT = 200;

/**
 * Events that wait on the viewer. A scene with a listener for one of these doesn't end
 * when its script method finishes: "when the cat is clicked, go to scene 2" must wait for the
 * click. Other listeners (timers, collisions, proximity, view) don't keep a scene going.
 */
export const VIEWER_EVENTS = [
  'clickOnScreen',
  'clickOnObject',
  'keyPress',
  'arrowKeyPress',
] as const;

/** Why a scene ended. */
export type SceneEnding =
  /** Its script method and its last stage command have finished, and nothing waits on the viewer. */
  | { readonly kind: 'finished' }
  /** `goToScene(scene)`: no more of this scene's code runs. */
  | { readonly kind: 'goToScene'; readonly scene: string }
  /** `crossfade(scene; duration)`. */
  | { readonly kind: 'crossfade'; readonly scene: string; readonly duration: Micros }
  /** `fadeToBlack(; duration)`: the scene ends, and the next in running order fades in. */
  | { readonly kind: 'fadeToBlack'; readonly duration: Micros };

export type NextScene =
  | { readonly kind: 'scene'; readonly scene: SceneId; readonly transition: Transition }
  /** The film is over. `fadeOut` is set when it ends by fading to black. */
  | { readonly kind: 'end'; readonly fadeOut: Micros | null }
  /** `goToScene` or `crossfade` named a scene the production doesn't have. */
  | { readonly kind: 'noSuchScene'; readonly scene: string }
  | { readonly kind: 'tooManyScenes'; readonly limit: number };

/** The scene a production starts with: the first in running order, or none. */
export function firstScene(p: Production): SceneId | null {
  return p.manifest.runningOrder[0]?.scene ?? null;
}

/**
 * What plays after `ended`, which ended as `ending`, with `started` scene starts so far (the
 * first scene counts as one).
 *
 * - **Finished:** the next scene in running order, with the ended scene's transition. After the
 *   last scene, the film ends; the last scene's transition is ignored.
 * - **`goToScene`:** that scene, with the ended scene's transition. Play carries on in running
 *   order from there.
 * - **`crossfade`:** that scene, with a crossfade of the given duration, whatever the running
 *   order says.
 * - **`fadeToBlack`:** the next scene in running order, with a fade to black of the given
 *   duration; after the last scene, the film ends in black.
 */
export function nextScene(
  p: Production,
  ended: SceneId,
  ending: SceneEnding,
  started: number,
): NextScene {
  const order = p.manifest.runningOrder;
  const at = order.findIndex((r) => r.scene === ended);
  const own: Transition = at === -1 ? CUT : order[at]!.transition;
  const following = at === -1 ? undefined : order[at + 1];

  let next: { scene: SceneId; transition: Transition } | null;
  switch (ending.kind) {
    case 'finished':
      next = following ? { scene: following.scene, transition: own } : null;
      if (!next) return { kind: 'end', fadeOut: null };
      break;
    case 'fadeToBlack': {
      const fade: Transition = { kind: 'fadeToBlack', duration: ending.duration };
      if (!following) return { kind: 'end', fadeOut: ending.duration };
      next = { scene: following.scene, transition: fade };
      break;
    }
    case 'goToScene':
    case 'crossfade': {
      const target = order.find((r) => r.scene === ending.scene);
      if (!target) return { kind: 'noSuchScene', scene: ending.scene };
      const transition: Transition =
        ending.kind === 'crossfade' ? { kind: 'crossfade', duration: ending.duration } : own;
      next = { scene: target.scene, transition };
      break;
    }
  }
  if (started >= SCENE_START_LIMIT) return { kind: 'tooManyScenes', limit: SCENE_START_LIMIT };
  return { kind: 'scene', ...next };
}

const CUT: Transition = { kind: 'cut', duration: 0 };

/**
 * Whether a scene waits on the viewer: its type has a listener for a `VIEWER_EVENTS` event. Such a scene ends only at `goToScene`, `crossfade` or `fadeToBlack`, or when play is
 * stopped. In an export, which has no viewer, it runs to the length cap, so the Screening room
 * says so.
 */
export function waitsForViewer(program: Program, p: Production, scene: SceneId): boolean {
  const method = p.scenes.find((s) => s.id === scene)?.method;
  const type = program.types.find((t) => t.methods.some((m) => m.id === method));
  return (type?.listeners ?? []).some((l) =>
    (VIEWER_EVENTS as readonly string[]).includes(l.event),
  );
}
