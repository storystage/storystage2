/**
 * What setting the stage needs of a scene, kept with it so the studio and the Prompter share one
 * step: a scene's frames in order, a sketch's standard height on its frame, and a scene's
 * backdrop parts and camera. Pure functions from one production to the next.
 */
import type { Frame, Production, SceneId } from '@storystage/production';
import type { SceneSetup, Transform } from '@storystage/story-api';

/** A scene's frames in order. */
export const sceneFrames = (p: Production, scene: SceneId): Frame[] =>
  p.frames.filter((f) => f.scene === scene).sort((a, b) => a.order - b.order);

/** A sketch's height on its frame at size 1, as a share of the frame's height (07-ux 6.5). */
export const STANDARD_HEIGHT = 0.3;

/** The parts of a backdrop a Backstage item can set: its class says which (`Ground`, `Sky`…). */
export const BACKDROP_PARTS = ['ground', 'sky', 'lighting'] as const;
export type BackdropPart = (typeof BACKDROP_PARTS)[number];

/** Which part a backdrop item sets, from its class, or `null`. */
export function backdropPartOf(storyClass: string): BackdropPart | null {
  const part = storyClass.toLowerCase();
  return (BACKDROP_PARTS as readonly string[]).includes(part) ? (part as BackdropPart) : null;
}

/** The production with one scene's ground, sky or lighting set to a Backstage item. */
export function withBackdrop(
  p: Production,
  scene: SceneId,
  part: BackdropPart,
  id: string,
): Production {
  return {
    ...p,
    scenes: p.scenes.map((s) =>
      s.id !== scene
        ? s
        : { ...s, setup: { ...s.setup, backdrop: { ...s.setup.backdrop, [part]: id } } },
    ),
  };
}

/** One scene's set-up changed by `change`. */
export function withSetup(
  p: Production,
  scene: SceneId,
  change: (setup: SceneSetup) => SceneSetup,
): Production {
  return {
    ...p,
    scenes: p.scenes.map((s) => (s.id !== scene ? s : { ...s, setup: change(s.setup) })),
  };
}

/** The production with the scene's camera moved: Move the camera here, or its handles. */
export function withCamera(p: Production, scene: SceneId, transform: Transform): Production {
  return withSetup(p, scene, (setup) => ({ ...setup, camera: { ...setup.camera, transform } }));
}
