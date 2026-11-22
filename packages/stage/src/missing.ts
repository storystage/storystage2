/**
 * What a loaded scene couldn't find (spec 03 sections 1.3 and 2.2), in the contract's order, so
 * both stages give the same list: the backdrop's parts first, then for each object in set-up
 * order its model, or the posed joints its model hasn't got.
 */
import type { JointName, ObjectId, SceneSetup } from '@storystage/story-api';
import type { Missing } from './contract.ts';

/**
 * `found` is what loading turned up, in any order: the backdrop's parts and the models it
 * couldn't find (any joint entries in it are worked out again). `jointsOf` gives the joints each
 * object's loaded model has. An object shown as a stand-in, because it is one or because its
 * model is missing, has no joints to turn, so its pose is never reported.
 */
export function inOrder(
  setup: SceneSetup,
  found: readonly Missing[],
  jointsOf: (object: ObjectId) => readonly JointName[],
): Missing[] {
  const backdrop = found.filter((m) => m.kind === 'backdrop');
  const lostModels = new Set(found.flatMap((m) => (m.kind === 'model' ? [m.object] : [])));
  const out: Missing[] = [...backdrop];
  for (const o of setup.objects) {
    if (typeof o.model !== 'string') continue;
    if (lostModels.has(o.id)) {
      out.push({ kind: 'model', object: o.id, model: o.model });
      continue;
    }
    const has = jointsOf(o.id);
    for (const joint of Object.keys(o.joints ?? {}) as JointName[])
      if (!has.includes(joint)) out.push({ kind: 'joint', object: o.id, joint });
  }
  return out;
}
