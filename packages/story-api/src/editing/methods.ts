/**
 * What the editors call a method (spec 14, section 2): "Type.method", as it's declared, except a
 * scene's script method, which reads "When the scene starts" (the owner's choice, 21 Nov 2026).
 * The code keeps Alice's name for it, `myFirstMethod`; only the words learners see change.
 */
import type { MethodDecl, NodeId, Program, TypeDecl } from '@storystage/ast';
import { indexOf } from './cache.ts';
import { isSceneScriptIn } from './scene-script.ts';
import { fill, word } from './words.ts';

export { isSceneScriptIn, SCENE_SCRIPT_METHOD } from './scene-script.ts';

/**
 * Whether `method` is a scene's script method: `myFirstMethod` in a type extending `Scene`. The
 * editors get the program, not the production's scenes, so it goes by the name every scene's
 * method is made with (`newSceneType`, Alice import, the study's films).
 */
export function isSceneScript(program: Program, method: NodeId): boolean {
  const at = indexOf(program).get(method);
  if (at?.node.kind !== 'method' || at.parent === null) return false;
  const type = indexOf(program).get(at.parent)?.node;
  return type?.kind === 'type' && isSceneScriptIn(type, at.node);
}

/** A method's title in `type`: "When the scene starts", or "Scene1.walkAround". */
export const methodTitleIn = (type: TypeDecl, method: MethodDecl): string =>
  isSceneScriptIn(type, method)
    ? word('method.sceneScript')
    : fill(word('method.title'), { type: type.name, method: method.name });

/** A method's title, from its id; its name if it isn't in a type. */
export function methodTitle(program: Program, method: NodeId): string {
  const at = indexOf(program).get(method);
  if (at?.node.kind !== 'method') return String(method);
  const type = at.parent === null ? undefined : indexOf(program).get(at.parent)?.node;
  return type?.kind === 'type' ? methodTitleIn(type, at.node) : at.node.name;
}
