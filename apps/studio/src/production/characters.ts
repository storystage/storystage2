/**
 * A character's own moves in the Code editor (decision 0074, workplan 7.14; `07-ux.md` section
 * 7.3): which model a scene's object is, every object of that model in every scene, and the
 * learner's class for it with its moves as tabs. A stand-in counts as a model by its label, as an
 * Alice world's characters come in as stand-ins until Backstage has them. The program doesn't
 * know models, so these read the set-ups; S6's `classFor` makes the class.
 */
import type { MethodDecl, NodeId, TypeDecl } from '@storystage/ast';
import type { Production, SceneId } from '@storystage/production';
import { modelFields, newObjectType, sceneType } from '@storystage/staging';
import type { BackstageId, SceneObjectSetup, StoryClass } from '@storystage/story-api';
import { classOf, splitWords, type CharacterModel } from '@storystage/story-api/editing';

export { modelFields, sceneType };

/** A model's name as learners see it, from Backstage, or `null` when it isn't known. */
export type ModelName = (model: BackstageId) => string | null;

type Model = SceneObjectSetup['model'];

/**
 * A model's name: a stand-in's label; a Backstage model's from Backstage, else from the film's
 * packed models (one not checked yet, or that failed its check, is only there), else the last part
 * of its id (`class/Biped/big-robot` is "big robot", as the studio names a missing model).
 */
const nameOf = (p: Production, modelName: ModelName, model: Model): string =>
  typeof model !== 'string'
    ? model.standIn
    : (modelName(model) ??
      p.manifest.models.find((m) => m.item.id === model)?.item.displayName ??
      (model.split('/').pop() ?? model).replace(/-/g, ' '));

/**
 * The type of an object the Prompter adds (`RunnerSetup.objectType`): its character's class,
 * found by the same name the Code editor makes it with.
 */
export const addedObjectType = (
  p: Production,
  { model, class: storyClass }: { readonly model: Model; readonly class: StoryClass },
  modelName: ModelName,
) => newObjectType(p, { model, class: storyClass, name: nameOf(p, modelName, model) });

/** A model in the film: its name and Story API class, and its class if made. */
export interface Character {
  readonly model: CharacterModel;
  /** Every object of the model, in every scene: the fields `classFor` makes of its class. */
  readonly fields: readonly NodeId[];
  /** The learner's class for it, once the first move has made it. */
  readonly type: NodeId | null;
}

function character(p: Production, object: SceneObjectSetup, modelName: ModelName): Character {
  const model: CharacterModel = {
    name: nameOf(p, modelName, object.model),
    storyClass: object.class,
  };
  const fields = modelFields(p, object.model);
  // The class its objects are already of, whatever the model is called now (S6's #624).
  return { model, fields, type: classOf(p.program, model, fields)?.id ?? null };
}

/** The character scene `scene`'s field `field` is, or `null` for a field with no set-up object. */
export function characterOf(
  p: Production,
  scene: SceneId,
  field: NodeId,
  modelName: ModelName,
): Character | null {
  const decl = sceneType(p, scene)?.fields.find((f) => f.id === field);
  const object = p.scenes
    .find((s) => s.id === scene)
    ?.setup.objects.find((o) => o.id === decl?.name);
  return object ? character(p, object, modelName) : null;
}

/**
 * The character a learner's class `type` is for, from an object of it in any scene; with none
 * left, from the class itself ("Penguin extends Animal": penguin).
 */
export function characterOfClass(p: Production, type: TypeDecl, modelName: ModelName): Character {
  for (const s of p.scenes) {
    const fields = sceneType(p, s.id)?.fields ?? [];
    for (const o of s.setup.objects) {
      const f = fields.find((x) => x.name === o.id);
      if (f?.type.kind === 'user' && f.type.type === type.id)
        return { ...character(p, o, modelName), type: type.id };
    }
  }
  const storyClass = type.extends.kind === 'story' ? type.extends.name : '';
  return { model: { name: classWords(type), storyClass }, fields: [], type: type.id };
}

/** A learner's class's method, with the class it's in. */
export interface ClassMethod {
  readonly method: MethodDecl;
  readonly type: TypeDecl;
}

/**
 * The moves of the learner's classes the scene's objects are of, a class once however many of
 * its objects the scene has, in the order the objects come.
 */
export function classMethods(p: Production, scene: SceneId): ClassMethod[] {
  const seen = new Set<NodeId>();
  const out: ClassMethod[] = [];
  for (const f of sceneType(p, scene)?.fields ?? []) {
    if (f.type.kind !== 'user' || seen.has(f.type.type)) continue;
    seen.add(f.type.type);
    const type = p.program.types.find((t) => t.id === (f.type as { type: NodeId }).type);
    if (type) out.push(...type.methods.map((method) => ({ method, type })));
  }
  return out;
}

/** A learner's class as the code editor names it: "penguin", "emperor penguin" (as Tiles does). */
export const classWords = (type: TypeDecl): string => splitWords(type.name);

/** Whether `type` is one of the program's scenes' classes. */
export const isSceneType = (p: Production, type: NodeId): boolean =>
  p.scenes.some((s) => sceneType(p, s.id)?.id === type);
