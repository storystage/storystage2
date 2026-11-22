/**
 * Where the learner is: the current scene and frame, shared by the three tabs (`07-ux.md` section
 * 1: the current frame stays the same when the learner changes tab). The App keeps what was chosen;
 * `currentPlace` makes it real for the production as it is now, since a scene or frame can go
 * (deleted, or undone).
 */
import type { FrameId, Production, SceneId } from '@storystage/production';
import { sceneFrames } from './frames.ts';

export interface Place {
  readonly scene: SceneId | null;
  readonly frame: FrameId | null;
}

export const NOWHERE: Place = { scene: null, frame: null };

/** The chosen scene, or the first if it has gone; the chosen frame if in it, or its first. */
export function currentPlace(p: Production, chosen: Place): Place {
  const order = p.manifest.runningOrder.map((r) => r.scene);
  const scene =
    chosen.scene !== null && order.includes(chosen.scene) ? chosen.scene : (order[0] ?? null);
  const frames = scene ? sceneFrames(p, scene) : [];
  const frame = frames.some((f) => f.id === chosen.frame) ? chosen.frame : (frames[0]?.id ?? null);
  return { scene, frame };
}
