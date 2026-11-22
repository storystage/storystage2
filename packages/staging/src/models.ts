/**
 * Which objects are of the same model, and so of the same learner's class (decision 0074). The
 * program doesn't know models, so these read the set-ups. Here, where Set the stage from the
 * storyboard and the studio's Code editor and Backstage can share them.
 */
import type { Production, SceneId } from '@storystage/production';
import type { SceneObjectSetup, StoryClass } from '@storystage/story-api';
import { fieldTypeFor } from '@storystage/story-api/editing';

type Model = SceneObjectSetup['model'];
type SceneType = Production['program']['types'][number];

/** Whether two objects are of the same model: the same Backstage id, or stand-ins alike. */
const sameModel = (a: Model, b: Model): boolean =>
  typeof a === 'string' || typeof b === 'string' ? a === b : a.standIn === b.standIn;

/** The type holding scene `scene`'s script method: the scene's own class in the code. */
export function sceneType(p: Production, scene: SceneId): SceneType | undefined {
  const script = p.scenes.find((s) => s.id === scene)?.method;
  return p.program.types.find((t) => t.methods.some((m) => m.id === script));
}

/** Every field, in every scene, whose set-up object is of model `model`. */
export function modelFields(p: Production, model: Model): SceneType['fields'][number]['id'][] {
  return p.scenes.flatMap((s) => {
    const type = sceneType(p, s.id);
    if (!type) return [];
    const names = new Set<string>(
      s.setup.objects.filter((o) => sameModel(o.model, model)).map((o) => o.id),
    );
    return type.fields.filter((f) => names.has(f.name)).map((f) => f.id);
  });
}

/**
 * `addObject`'s `type` for a new object: the learner's class for its model once there is one, so
 * it has that class's moves, else its Story API class. `name` is the model's name in Backstage; a
 * stand-in's is its label, as the Code editor names it.
 */
export function newObjectType(
  p: Production,
  object: { readonly model: Model; readonly class: StoryClass; readonly name: string },
) {
  const { model } = object;
  const name = typeof model === 'string' ? object.name : model.standIn;
  return fieldTypeFor(p.program, { name, storyClass: object.class }, modelFields(p, model));
}
