/**
 * A scene's script method (spec 03, section 2; spec 14, 3a): Alice's `myFirstMethod`, which runs
 * when the scene starts. Kept apart from `methods.ts`, which words it, so `words.ts` can use it too.
 */
import type { MethodDecl, TypeDecl } from '@storystage/ast';

/** Alice's name for a scene's first method, which runs when the scene starts (spec 03, 19). */
export const SCENE_SCRIPT_METHOD = 'myFirstMethod';

/** Whether a type is a scene: it extends the Story API's `Scene`. */
const isScene = (type: TypeDecl) => type.extends?.kind === 'story' && type.extends.name === 'Scene';

/** Whether `method` is in `type` as the scene's script method. */
export const isSceneScriptIn = (type: TypeDecl, method: MethodDecl): boolean =>
  method.name === SCENE_SCRIPT_METHOD && isScene(type);
