/**
 * Adding, deleting, moving, renaming and duplicating scenes, each as one step across everything a scene touches: its
 * type in the program, its set-up, its storyboard card, its frames and lines, and its place in
 * the running order (spec section 2). Written by S5 for the Storyboard (WP10a), from WP8.2.
 *
 * Each function is pure: it returns the production after the step, with the program edits it
 * made and the edits that undo them, for the production's undo session (WP8.2) to hold. Labels
 * are the learner's words for the step ("Add scene 4"), from the caller's translation file.
 */
import {
  EditRefused,
  applyAll,
  copyNode,
  idMinter,
  newSceneType,
  walk,
  type EditOperation,
  type NodeId,
  type TypeDecl,
} from '@storystage/ast';
import { IDENTITY, type SceneSetup } from '@storystage/story-api';
import {
  SAFE_ID,
  frameId,
  lineId,
  sceneId,
  type FrameId,
  type Production,
  type SceneId,
} from './types.ts';

/** The most scenes a production holds (`docs/spec/07-ux.md`, section 6.9). */
export const SCENE_LIMIT = 50;

export interface SceneStep {
  /** The learner's words for the step, also its undo label. */
  readonly label: string;
  readonly production: Production;
  /** The program edits the step made, in order. Empty if the program didn't change. */
  readonly edits: readonly EditOperation[];
  /** The edits that undo them, in the order to apply them. */
  readonly inverses: readonly EditOperation[];
}

export type SceneRefusal =
  | { readonly code: 'needsLoglineAndSynopsis' }
  | { readonly code: 'tooManyScenes'; readonly limit: number }
  | { readonly code: 'noSuchScene' }
  | { readonly code: 'noSuchPlace' }
  /** A scene object that isn't in the scene's set-up (`objects.ts`). */
  | { readonly code: 'noSuchObject' }
  | { readonly code: 'tooManyObjects'; readonly limit: number }
  /** Code still uses the object: `uses` are the blocks that do, so the studio can say where. */
  | { readonly code: 'objectInUse'; readonly uses: readonly NodeId[] }
  /** The program refused the change; `reason` is in plain words (`EditRefused`). */
  | { readonly code: 'refused'; readonly reason: string };

export type SceneStepResult =
  | { readonly ok: true; readonly step: SceneStep }
  | { readonly ok: false; readonly refusal: SceneRefusal };

const refuse = (refusal: SceneRefusal): SceneStepResult => ({ ok: false, refusal });

/** How a new scene starts: no objects, the camera a little back from the middle. */
const NEW_SETUP: SceneSetup = {
  backdrop: {},
  objects: [],
  camera: { transform: { ...IDENTITY, position: { x: 0, y: 1.6, z: -5 } } },
  markers: [],
};

/** The first of `s1`, `s2`, … that no scene uses. */
function freeSceneId(p: Production): SceneId {
  const taken = new Set<string>(p.scenes.map((s) => s.id));
  for (let n = 1; ; n++) {
    const id = `s${n}`;
    if (!taken.has(id) && SAFE_ID.test(id)) return sceneId(id);
  }
}

/** The first of `Scene1`, `Scene2`, … that no type in the program uses. */
function freeTypeName(p: Production): string {
  const taken = new Set(p.program.types.map((t) => t.name));
  for (let n = 1; ; n++) if (!taken.has(`Scene${n}`)) return `Scene${n}`;
}

/** Applies program edits, turning a refusal into the learner's words. */
export function applyProgramEdits(
  p: Production,
  edits: readonly EditOperation[],
): { program: Production['program']; inverses: readonly EditOperation[] } | SceneRefusal {
  try {
    const { program, inverses } = applyAll(p.program, edits);
    return { program, inverses: [...inverses].reverse() };
  } catch (e) {
    if (e instanceof EditRefused) return { code: 'refused', reason: e.reason };
    throw e;
  }
}

/**
 * Adds a scene: a card with `heading`, a type extending `Scene` with an empty `myFirstMethod`,
 * an empty set-up, and a place in the running order (`at`, or the end) ending in a cut. Waits
 * for the logline and synopsis (WP10.1).
 */
export function addScene(
  p: Production,
  options: { readonly heading: string; readonly label: string; readonly at?: number },
  random: () => number = Math.random,
): SceneStepResult {
  if (p.storyboard.logline.trim() === '' || p.storyboard.synopsis.trim() === '')
    return refuse({ code: 'needsLoglineAndSynopsis' });
  if (p.scenes.length >= SCENE_LIMIT) return refuse({ code: 'tooManyScenes', limit: SCENE_LIMIT });
  const at = options.at ?? p.manifest.runningOrder.length;
  if (!Number.isInteger(at) || at < 0 || at > p.manifest.runningOrder.length)
    return refuse({ code: 'noSuchPlace' });

  const id = freeSceneId(p);
  const type: TypeDecl = newSceneType(freeTypeName(p), idMinter(p.program, random));
  const edits: EditOperation[] = [
    {
      kind: 'declare',
      label: options.label,
      parent: null,
      index: p.program.types.length,
      node: type,
    },
  ];
  const applied = applyProgramEdits(p, edits);
  if ('code' in applied) return refuse(applied);

  const runningOrder = [...p.manifest.runningOrder];
  runningOrder.splice(at, 0, { scene: id, transition: { kind: 'cut', duration: 0 } });
  return {
    ok: true,
    step: {
      label: options.label,
      edits,
      inverses: applied.inverses,
      production: {
        ...p,
        manifest: { ...p.manifest, runningOrder },
        program: applied.program,
        scenes: [...p.scenes, { id, setup: NEW_SETUP, method: type.methods[0]!.id }],
        storyboard: {
          ...p.storyboard,
          cards: [...p.storyboard.cards, { id, heading: options.heading, cast: [], arcPart: null }],
        },
      },
    },
  };
}

/**
 * Deletes a scene and everything that is only its own: its type, set-up, card, frames and lines,
 * and its place in the running order. Lines elsewhere pinned to its frames are unpinned; the
 * learner's recordings for it stay, no longer tied to a scene. Refused, in plain words, while
 * other code still uses the scene's type.
 */
export function deleteScene(p: Production, id: SceneId, label: string): SceneStepResult {
  const scene = p.scenes.find((s) => s.id === id);
  if (!scene) return refuse({ code: 'noSuchScene' });
  const type = p.program.types.find((t) => t.methods.some((m) => m.id === scene.method));
  const edits: EditOperation[] = type ? [{ kind: 'remove', label, node: type.id }] : [];
  const applied = applyProgramEdits(p, edits);
  if ('code' in applied) return refuse(applied);

  const gone = new Set<string>(p.frames.filter((f) => f.scene === id).map((f) => f.id));
  return {
    ok: true,
    step: {
      label,
      edits,
      inverses: applied.inverses,
      production: {
        ...p,
        manifest: {
          ...p.manifest,
          runningOrder: p.manifest.runningOrder.filter((r) => r.scene !== id),
          audio: p.manifest.audio.map((a) => (a.scene === id ? { ...a, scene: null } : a)),
        },
        program: applied.program,
        scenes: p.scenes.filter((s) => s.id !== id),
        storyboard: { ...p.storyboard, cards: p.storyboard.cards.filter((c) => c.id !== id) },
        frames: p.frames.filter((f) => f.scene !== id),
        script: p.script
          .filter((l) => l.scene !== id)
          .map((l) =>
            l.pinnedFrame !== null && gone.has(l.pinnedFrame) ? { ...l, pinnedFrame: null } : l,
          ),
      },
    },
  };
}

/**
 * Moves a scene to place `to` in the running order, counted after it has left its old place, as
 * the AST's `move` counts. Its transition goes with it. The program doesn't change.
 */
export function moveScene(p: Production, id: SceneId, to: number, label: string): SceneStepResult {
  const from = p.manifest.runningOrder.findIndex((r) => r.scene === id);
  if (from === -1) return refuse({ code: 'noSuchScene' });
  if (!Number.isInteger(to) || to < 0 || to >= p.manifest.runningOrder.length)
    return refuse({ code: 'noSuchPlace' });
  const runningOrder = [...p.manifest.runningOrder];
  const [entry] = runningOrder.splice(from, 1);
  runningOrder.splice(to, 0, entry!);
  return {
    ok: true,
    step: {
      label,
      edits: [],
      inverses: [],
      production: { ...p, manifest: { ...p.manifest, runningOrder } },
    },
  };
}

/** Renames a scene: its card's heading, which the Storyboard, the script and the running order show. */
export function renameScene(
  p: Production,
  id: SceneId,
  heading: string,
  label: string,
): SceneStepResult {
  if (!p.storyboard.cards.some((c) => c.id === id)) return refuse({ code: 'noSuchScene' });
  return {
    ok: true,
    step: {
      label,
      edits: [],
      inverses: [],
      production: {
        ...p,
        storyboard: {
          ...p.storyboard,
          cards: p.storyboard.cards.map((c) => (c.id === id ? { ...c, heading } : c)),
        },
      },
    },
  };
}

/** The first of `<prefix>1`, `<prefix>2`, … not in `taken`, which it then takes. */
function freeId(prefix: string, taken: Set<string>): string {
  for (let n = 1; ; n++) {
    const id = `${prefix}${n}`;
    if (!taken.has(id) && SAFE_ID.test(id)) {
      taken.add(id);
      return id;
    }
  }
}

/**
 * Duplicates a scene, placed straight after it in the running order with the same transition:
 * a copy of its type (fields, methods and listeners, with new ids), its set-up, its card with
 * `heading`, and its frames and lines with new ids. The copies' frame links follow the copied
 * blocks, and its lines stay pinned to the copied frames. Recordings aren't copied.
 */
export function duplicateScene(
  p: Production,
  id: SceneId,
  options: { readonly heading: string; readonly label: string },
  random: () => number = Math.random,
): SceneStepResult {
  const scene = p.scenes.find((s) => s.id === id);
  const card = p.storyboard.cards.find((c) => c.id === id);
  const place = p.manifest.runningOrder.findIndex((r) => r.scene === id);
  const original = p.program.types.find((t) => t.methods.some((m) => m.id === scene?.method));
  if (!scene || !card || place === -1 || !original) return refuse({ code: 'noSuchScene' });
  if (p.scenes.length >= SCENE_LIMIT) return refuse({ code: 'tooManyScenes', limit: SCENE_LIMIT });

  const newId = freeSceneId(p);
  const copy: TypeDecl = {
    ...copyNode(original, idMinter(p.program, random)),
    name: freeTypeName(p),
  };
  const copied = new Map<NodeId, NodeId>();
  walk(copy, (node) => {
    if (node.copiedFrom) copied.set(node.copiedFrom, node.id);
  });
  const edits: EditOperation[] = [
    {
      kind: 'declare',
      label: options.label,
      parent: null,
      index: p.program.types.length,
      node: copy,
    },
  ];
  const applied = applyProgramEdits(p, edits);
  if ('code' in applied) return refuse(applied);

  const frameIds = new Set<string>(p.frames.map((f) => f.id));
  const frameMap = new Map<string, FrameId>();
  const frames = p.frames
    .filter((f) => f.scene === id)
    .map((f) => {
      const fresh = frameId(freeId('f', frameIds));
      frameMap.set(f.id, fresh);
      return { ...f, id: fresh, scene: newId, links: f.links.map((l) => copied.get(l) ?? l) };
    });
  const lineIds = new Set<string>(p.script.map((l) => l.id));
  const lines = p.script
    .filter((l) => l.scene === id)
    .map((l) => ({
      ...l,
      id: lineId(freeId('l', lineIds)),
      scene: newId,
      pinnedFrame: l.pinnedFrame === null ? null : (frameMap.get(l.pinnedFrame) ?? null),
    }));

  const runningOrder = [...p.manifest.runningOrder];
  runningOrder.splice(place + 1, 0, {
    scene: newId,
    transition: p.manifest.runningOrder[place]!.transition,
  });
  return {
    ok: true,
    step: {
      label: options.label,
      edits,
      inverses: applied.inverses,
      production: {
        ...p,
        manifest: { ...p.manifest, runningOrder },
        program: applied.program,
        scenes: [...p.scenes, { id: newId, setup: scene.setup, method: copied.get(scene.method)! }],
        storyboard: {
          ...p.storyboard,
          cards: [...p.storyboard.cards, { ...card, id: newId, heading: options.heading }],
        },
        frames: [...p.frames, ...frames],
        script: [...p.script, ...lines],
      },
    },
  };
}
