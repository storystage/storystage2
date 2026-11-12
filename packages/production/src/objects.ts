/**
 * Adding, removing and changing a scene's objects (07-ux section 7.2; spec 03 section 2.1), for
 * the Production stage's Backstage rail and its Objects in this scene list (S5, M2). A scene
 * object is a field in the scene's type and an entry in its set-up, so adding or removing one
 * changes both as one step, which the production's session holds (`session.step`), with the
 * program edits it made and the edits that undo them, as `scenes.ts`'s steps do.
 */
import {
  idMinter,
  walkProgram,
  type EditOperation,
  type FieldDecl,
  type NodeId,
  type TypeDecl,
} from '@storystage/ast';
import type {
  BackstageId,
  ObjectId,
  SceneObjectSetup,
  StandIn,
  StoryClass,
  Transform,
} from '@storystage/story-api';
import { applyProgramEdits, type SceneRefusal, type SceneStepResult } from './scenes.ts';
import type { Production, Scene, SceneId } from './types.ts';

/**
 * The most objects one scene holds: a guard against runaway adding, well above what the device
 * budget lets a scene draw (spec 17 section 4), which is what binds in practice.
 */
export const OBJECT_LIMIT = 100;

const refuse = (refusal: SceneRefusal): SceneStepResult => ({ ok: false, refusal });

/** The scene and the type its script method is in. */
function sceneAndType(p: Production, id: SceneId): { scene: Scene; type: TypeDecl } | null {
  const scene = p.scenes.find((s) => s.id === id);
  if (!scene) return null;
  const type = p.program.types.find((t) => t.methods.some((m) => m.id === scene.method));
  return type ? { scene, type } : null;
}

/**
 * A name for a new object, from `wanted` (a model's display name: "Woolly mammoth skeleton"):
 * a valid field name in the code ("woollyMammothSkeleton", starting with a letter, letters,
 * numbers and _ only), made unique in the scene's type by a number ("owl2"). Only the scene's own
 * type need be free of it, so the same character in another scene can have the same name, and
 * with it the same voice (`manifest.voices`) and the same place in the automatic check.
 */
export function objectName(p: Production, scene: SceneId, wanted: string): string | null {
  const found = sceneAndType(p, scene);
  if (!found) return null;
  const words = wanted
    .normalize('NFKD')
    // Accents off ("Café" is "cafe"), and apostrophes out, so "Scott's" stays one word.
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  let base = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
    .slice(0, 40);
  if (!/^\p{L}/u.test(base)) base = `thing${base}`;
  const taken = new Set(
    [...found.type.fields, ...found.type.methods, ...found.type.listeners].map((m) =>
      'name' in m ? (m.name as string).toLowerCase() : '',
    ),
  );
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}${n}`.toLowerCase())) return `${base}${n}`;
}

export interface NewObject {
  /** A Backstage item, or a stand-in. */
  readonly model: BackstageId | StandIn;
  /** Its Story API class (`BackstageItem.class`): the field's type in the code. */
  readonly class: StoryClass;
  /** The name wanted, from its display name: made a valid, unique field name (`objectName`). */
  readonly name: string;
  readonly transform: Transform;
}

/**
 * Adds an object to scene `scene`: a field of its class in the scene's type (as the example's
 * `penguin: Flyer`), and an entry in the set-up with its model and place, as one step ("Add owl").
 * The step's production names it; `objectName` says what name it will get.
 */
export function addObject(
  p: Production,
  scene: SceneId,
  object: NewObject,
  label: string,
  random: () => number = Math.random,
): SceneStepResult {
  const found = sceneAndType(p, scene);
  if (!found) return refuse({ code: 'noSuchScene' });
  if (found.scene.setup.objects.length >= OBJECT_LIMIT)
    return refuse({ code: 'tooManyObjects', limit: OBJECT_LIMIT });
  const name = objectName(p, scene, object.name)!;
  const field: FieldDecl = {
    id: idMinter(p.program, random)(),
    kind: 'field',
    name,
    type: { kind: 'story', name: object.class },
    initial: null,
  };
  const edits: EditOperation[] = [
    { kind: 'declare', label, parent: found.type.id, index: found.type.fields.length, node: field },
  ];
  const applied = applyProgramEdits(p, edits);
  if ('code' in applied) return refuse(applied);
  const entry: SceneObjectSetup = {
    id: name as ObjectId,
    model: object.model,
    class: object.class,
    transform: object.transform,
  };
  return {
    ok: true,
    step: {
      label,
      edits,
      inverses: applied.inverses,
      production: {
        ...p,
        program: applied.program,
        scenes: p.scenes.map((s) =>
          s.id === scene
            ? { ...s, setup: { ...s.setup, objects: [...s.setup.objects, entry] } }
            : s,
        ),
      },
    },
  };
}

/** The blocks that use scene `scene`'s object `name`: every `fieldRef` to its field. */
export function objectUses(p: Production, scene: SceneId, name: string): NodeId[] {
  const field = objectField(p, scene, name);
  if (!field) return [];
  const uses: NodeId[] = [];
  walkProgram(p.program, (node) => {
    if (node.kind === 'fieldRef' && node.field === field.id) uses.push(node.id);
  });
  return uses;
}

/** The field that holds scene `scene`'s object `name`, if there is one. */
function objectField(p: Production, scene: SceneId, name: string): FieldDecl | null {
  const found = sceneAndType(p, scene);
  return found?.type.fields.find((f) => f.name === name) ?? null;
}

/**
 * Removes scene `scene`'s object `name`: its field and its set-up entry, as one step. Anything
 * that rode on it rides on the scene. Refused while code uses it, with the blocks that do
 * (`uses`), so the studio can say where (07-ux section 7.2), as deleting a scene is refused.
 */
export function removeObject(
  p: Production,
  scene: SceneId,
  name: string,
  label: string,
): SceneStepResult {
  const found = sceneAndType(p, scene);
  if (!found) return refuse({ code: 'noSuchScene' });
  if (!found.scene.setup.objects.some((o) => o.id === name))
    return refuse({ code: 'noSuchObject' });
  const uses = objectUses(p, scene, name);
  if (uses.length > 0) return refuse({ code: 'objectInUse', uses });
  const field = objectField(p, scene, name);
  const edits: EditOperation[] = field ? [{ kind: 'remove', label, node: field.id }] : [];
  const applied = applyProgramEdits(p, edits);
  if ('code' in applied) return refuse(applied);
  return {
    ok: true,
    step: {
      label,
      edits,
      inverses: applied.inverses,
      production: {
        ...p,
        program: applied.program,
        scenes: p.scenes.map((s) =>
          s.id === scene
            ? {
                ...s,
                setup: {
                  ...s.setup,
                  objects: s.setup.objects
                    .filter((o) => o.id !== name)
                    .map((o) => (o.vehicle === name ? { ...o, vehicle: null } : o)),
                },
              }
            : s,
        ),
      },
    },
  };
}

/** What `setObject` may change: where an object starts, and how it looks. */
export interface ObjectChange {
  readonly transform?: Transform;
  /** 0 (invisible) to 1. */
  readonly opacity?: number;
  /** A paint name from the Story API's list, or a `#rrggbb` colour. */
  readonly paint?: string;
}

/**
 * Changes how scene `scene`'s object `name` starts ("Move owl"): its set-up only, so the program
 * doesn't change. A step like the others, for `session.step`; `withObject` gives the production
 * alone, for `session.change`.
 */
export function setObject(
  p: Production,
  scene: SceneId,
  name: string,
  change: ObjectChange,
  label: string,
): SceneStepResult {
  const next = withObject(p, scene, name, change);
  if ('code' in next) return refuse(next);
  return { ok: true, step: { label, edits: [], inverses: [], production: next } };
}

/** The production with scene `scene`'s object `name` changed, or why it can't be. */
export function withObject(
  p: Production,
  scene: SceneId,
  name: string,
  change: ObjectChange,
): Production | SceneRefusal {
  const found = p.scenes.find((s) => s.id === scene);
  if (!found) return { code: 'noSuchScene' };
  if (!found.setup.objects.some((o) => o.id === name)) return { code: 'noSuchObject' };
  if (change.opacity !== undefined && !(change.opacity >= 0 && change.opacity <= 1))
    return { code: 'refused', reason: 'Opacity goes from 0 (invisible) to 1.' };
  return {
    ...p,
    scenes: p.scenes.map((s) =>
      s.id === scene
        ? {
            ...s,
            setup: {
              ...s.setup,
              objects: s.setup.objects.map((o) => (o.id === name ? { ...o, ...change } : o)),
            },
          }
        : s,
    ),
  };
}
