/**
 * The Storyboard's own edits (`docs/spec/07-ux.md` section 6): pure functions from one production
 * to the next. Changes that touch the program as well (adding, deleting and moving scenes) are in
 * `@storystage/production`'s `scenes.ts`.
 */
import { newProgram } from '@storystage/ast';
import { micros } from '@storystage/story-api';
import {
  FORMAT_VERSION,
  type Frame,
  type Production,
  type SceneId,
  type Storyboard,
  type Transition,
} from '@storystage/production';
import { sameTemplate, type ArcTemplateDef } from './arc.ts';

/** How long each piece of text may be, and how many of each thing (`07-ux.md` section 6.9). */
export const LIMITS = {
  title: 80,
  logline: 200,
  synopsis: 1000,
  heading: 80,
  caption: 200,
  line: 500,
  scenes: 50,
  framesPerScene: 30,
  sketchesPerFrame: 30,
} as const;

const clamp = (text: string, limit: number) => [...text].slice(0, limit).join('');

/**
 * A new, empty production: no scenes yet, so the learner starts with the script header. Saving
 * and opening are WP8.4; until then the studio starts here.
 */
export function newProduction(appVersion = '0.0.0'): Production {
  return {
    manifest: {
      format: 'storystage',
      formatVersion: FORMAT_VERSION,
      createdWith: { app: 'StoryStage', version: appVersion },
      title: '',
      origin: 'storystage',
      runningOrder: [],
      audio: [],
      models: [],
    },
    program: { ...newProgram(), types: [] },
    scenes: [],
    storyboard: {
      logline: '',
      synopsis: '',
      arc: { template: 'threePart', parts: ['beginning', 'middle', 'end'] },
      cards: [],
    },
    script: [],
    frames: [],
  };
}

export const setTitle = (p: Production, title: string): Production => ({
  ...p,
  manifest: { ...p.manifest, title: clamp(title, LIMITS.title) },
});

const withStoryboard = (p: Production, change: Partial<Storyboard>): Production => ({
  ...p,
  storyboard: { ...p.storyboard, ...change },
});

export const setLogline = (p: Production, logline: string): Production =>
  withStoryboard(p, { logline: clamp(logline, LIMITS.logline) });

export const setSynopsis = (p: Production, synopsis: string): Production =>
  withStoryboard(p, { synopsis: clamp(synopsis, LIMITS.synopsis) });

/**
 * Changes the arc. A card keeps its part only if the new arc has a part of that name
 * (`07-ux.md` section 6.3).
 */
export function setArc(p: Production, arc: ArcTemplateDef): Production {
  if (sameTemplate(p.storyboard.arc.template, arc.template)) return p;
  const parts = new Set(arc.parts);
  return withStoryboard(p, {
    arc: { template: arc.template, parts: [...arc.parts] },
    cards: p.storyboard.cards.map((c) =>
      c.arcPart !== null && !parts.has(c.arcPart) ? { ...c, arcPart: null } : c,
    ),
  });
}

/** Puts a scene's card in one of the arc's parts, or in none. A part the arc hasn't got is ignored. */
export function setCardArcPart(p: Production, scene: SceneId, part: string | null): Production {
  if (part !== null && !p.storyboard.arc.parts.includes(part)) return p;
  return withStoryboard(p, {
    cards: p.storyboard.cards.map((c) => (c.id === scene ? { ...c, arcPart: part } : c)),
  });
}

/** Scenes wait for a logline and a synopsis (WP10.1). */
export const canAddScene = (storyboard: Storyboard): boolean =>
  storyboard.logline.trim() !== '' && storyboard.synopsis.trim() !== '';

/** How many scenes, and the frames' planned lengths added up, in whole seconds. */
export function planLength(p: Production): { scenes: number; seconds: number } {
  return {
    scenes: p.scenes.length,
    seconds: Math.round(p.frames.reduce((sum, f) => sum + f.lengthSeconds, 0)),
  };
}

/** A scene's heading: place and time, "Forest, night" (`07-ux.md` section 6.4). */
export function setCardHeading(p: Production, scene: SceneId, heading: string): Production {
  const text = clamp(heading, LIMITS.heading);
  return withStoryboard(p, {
    cards: p.storyboard.cards.map((c) => (c.id === scene ? { ...c, heading: text } : c)),
  });
}

/** How long each kind of transition takes (WP8.3); a cut takes none. */
export const TRANSITION_SECONDS: Readonly<Record<Transition['kind'], number>> = {
  cut: 0,
  fadeToBlack: 1,
  crossfade: 0.5,
};

/** How a scene ends: a cut, a fade to black or a crossfade into the next one. */
export function setTransition(p: Production, scene: SceneId, kind: Transition['kind']): Production {
  return {
    ...p,
    manifest: {
      ...p.manifest,
      runningOrder: p.manifest.runningOrder.map((r) =>
        r.scene === scene
          ? { ...r, transition: { kind, duration: micros(TRANSITION_SECONDS[kind]) } }
          : r,
      ),
    },
  };
}

/** A scene's number: its place in the running order, from 1. */
export const sceneNumber = (p: Production, scene: SceneId): number =>
  p.manifest.runningOrder.findIndex((r) => r.scene === scene) + 1;

/** A scene's frames in order, numbered "2.1", "2.2" from the scene's number. */
export function framesOf(p: Production, scene: SceneId): { frame: Frame; number: string }[] {
  const n = sceneNumber(p, scene);
  return p.frames
    .filter((f) => f.scene === scene)
    .sort((a, b) => a.order - b.order)
    .map((frame, i) => ({ frame, number: `${n}.${i + 1}` }));
}

/** A scene's planned length: its frames' lengths added up, in whole seconds. */
export const sceneSeconds = (p: Production, scene: SceneId): number =>
  Math.round(p.frames.filter((f) => f.scene === scene).reduce((s, f) => s + f.lengthSeconds, 0));
