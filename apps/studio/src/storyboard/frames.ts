/**
 * A scene's frames (`docs/spec/07-ux.md` sections 6.4, 6.5; WP10.6): adding, deleting and moving
 * them, and each frame's caption, shot and length. Pure functions from one production to the next.
 * The sketches on a frame are in `canvas.ts`.
 */
import {
  SAFE_ID,
  frameId,
  type Frame,
  type FrameId,
  type Production,
  type SceneId,
} from '@storystage/production';
import type { ShotType } from '@storystage/story-api';
import { LIMITS } from './edits.ts';

/** A frame's planned length, in whole seconds (`07-ux.md` section 6.5). */
export const FRAME_LENGTH = { min: 1, max: 30, start: 3 } as const;

/** The shots in the segmented control (Direction A); the others are under More shots. */
export const MAIN_SHOTS = ['wide', 'medium', 'closeUp'] as const satisfies readonly ShotType[];
export const MORE_SHOTS = [
  'overTheShoulder',
  'twoShot',
  'follow',
] as const satisfies readonly ShotType[];

const clampText = (text: string, limit: number) => [...text].slice(0, limit).join('');

/** The first of `f1`, `f2`, … that no frame uses. */
function freeFrameId(p: Production): FrameId {
  const taken = new Set<string>(p.frames.map((f) => f.id));
  for (let n = 1; ; n++) {
    const id = `f${n}`;
    if (!taken.has(id) && SAFE_ID.test(id)) return frameId(id);
  }
}

/** A scene's frames in order. */
export const sceneFrames = (p: Production, scene: SceneId): Frame[] =>
  p.frames.filter((f) => f.scene === scene).sort((a, b) => a.order - b.order);

/** Puts a scene's frames in the order given, numbering them from 0, and leaves the rest alone. */
function withSceneFrames(p: Production, scene: SceneId, ordered: readonly Frame[]): Production {
  const others = p.frames.filter((f) => f.scene !== scene);
  return { ...p, frames: [...others, ...ordered.map((f, order) => ({ ...f, order }))] };
}

const updateFrame = (p: Production, id: FrameId, change: (f: Frame) => Frame): Production => ({
  ...p,
  frames: p.frames.map((f) => (f.id === id ? change(f) : f)),
});

/**
 * Adds an empty frame after `after` (or at the end of the scene): a medium shot of 3 seconds.
 * `null` when the scene already has the most frames it can.
 */
export function addFrame(
  p: Production,
  scene: SceneId,
  after: FrameId | null,
): { production: Production; frame: FrameId } | null {
  const frames = sceneFrames(p, scene);
  if (frames.length >= LIMITS.framesPerScene) return null;
  const id = freeFrameId(p);
  const frame: Frame = {
    id,
    scene,
    order: 0,
    caption: '',
    shot: 'medium',
    lengthSeconds: FRAME_LENGTH.start,
    sketches: [],
    links: [],
  };
  const i = after === null ? -1 : frames.findIndex((f) => f.id === after);
  const ordered = [...frames];
  ordered.splice(i === -1 ? frames.length : i + 1, 0, frame);
  return { production: withSceneFrames(p, scene, ordered), frame: id };
}

/** Deletes a frame. Lines pinned to it stay in the script, unpinned (`07-ux.md` section 6.4). */
export function deleteFrame(p: Production, id: FrameId): Production {
  const frame = p.frames.find((f) => f.id === id);
  if (!frame) return p;
  const kept = withSceneFrames(
    { ...p, frames: p.frames.filter((f) => f.id !== id) },
    frame.scene,
    sceneFrames(p, frame.scene).filter((f) => f.id !== id),
  );
  return {
    ...kept,
    script: p.script.map((l) => (l.pinnedFrame === id ? { ...l, pinnedFrame: null } : l)),
  };
}

/** Whether deleting a frame takes anything with it, so the Storyboard asks first. */
export const frameHasContent = (p: Production, id: FrameId): boolean =>
  (p.frames.find((f) => f.id === id)?.sketches.length ?? 0) > 0 ||
  p.script.some((l) => l.pinnedFrame === id);

/** Moves a frame to place `to` within its scene, counted after it has left its old place. */
export function moveFrame(p: Production, id: FrameId, to: number): Production {
  const frame = p.frames.find((f) => f.id === id);
  if (!frame) return p;
  const rest = sceneFrames(p, frame.scene).filter((f) => f.id !== id);
  if (!Number.isInteger(to) || to < 0 || to > rest.length) return p;
  rest.splice(to, 0, frame);
  return withSceneFrames(p, frame.scene, rest);
}

export const setCaption = (p: Production, id: FrameId, caption: string): Production =>
  updateFrame(p, id, (f) => ({ ...f, caption: clampText(caption, LIMITS.caption) }));

export const setShot = (p: Production, id: FrameId, shot: ShotType): Production =>
  updateFrame(p, id, (f) => ({ ...f, shot }));

/** Whole seconds, from 1 to 30. */
export const setLength = (p: Production, id: FrameId, seconds: number): Production =>
  updateFrame(p, id, (f) => ({
    ...f,
    lengthSeconds: Math.min(FRAME_LENGTH.max, Math.max(FRAME_LENGTH.min, Math.round(seconds))),
  }));
