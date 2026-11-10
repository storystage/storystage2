/**
 * Each frame's status on the Production stage's frame strip (`07-ux.md` sections 2.3 and 7.1):
 * Planned, Staged, Coded and Rehearsed are the studio's; Checked and Look at are the automatic
 * check's (`@storystage/check`, spec 08 section 9.6), and win while its result isn't stale.
 */
import { indexProgram, type NodeId } from '@storystage/ast';
import { basisFor, frameStatus } from '@storystage/check';
import type { Frame, FrameId, Production, SceneId } from '@storystage/production';
import type { FrameStatus } from '@storystage/ui';
import { sceneFrames } from '../storyboard/frames.ts';

/**
 * Frames played by Rehearse, each with what it depended on then (the check's `basis`): the
 * program, the scene's set-up, the frame and its neighbours, and its pinned lines. A change to
 * any of them makes it no longer Rehearsed ("played since its last change"). Kept for the
 * session, not in the film.
 */
export type Rehearsed = ReadonlyMap<FrameId, string>;

export const NONE_REHEARSED: Rehearsed = new Map();

/** A sketch's item as a Backstage id, or `null` for a stand-in, a mark or a backdrop. */
function modelOf(item: Frame['sketches'][number]['item']): string | null {
  if (typeof item !== 'string') return null;
  if (item.startsWith('mark/') || item.startsWith('backdrop/')) return null;
  return item;
}

/**
 * Staged: something is on the stage, and every character the frame sketches (a model that is a
 * set-up object's or on the scene card's cast, as the check counts them) is a set-up object.
 */
export function isStaged(p: Production, frame: Frame): boolean {
  const setup = p.scenes.find((s) => s.id === frame.scene)?.setup;
  if (!setup || setup.objects.length === 0) return false;
  const placed = new Set<string>(
    setup.objects.flatMap((o) => (typeof o.model === 'string' ? [o.model] : [])),
  );
  const cast = new Set<string>(
    (p.storyboard.cards.find((c) => c.id === frame.scene)?.cast ?? []).flatMap((c) =>
      typeof c === 'string' ? [c] : [],
    ),
  );
  return frame.sketches.every((s) => {
    const model = modelOf(s.item);
    // A sketched model on neither list is a prop drawn for the picture: it doesn't hold it back.
    return model === null || placed.has(model) || !cast.has(model);
  });
}

/** Every node id in a program, once per program (the strip asks for every frame each render). */
const nodeIds = new WeakMap<Production['program'], ReadonlySet<string>>();
function idsIn(program: Production['program']): ReadonlySet<string> {
  let ids = nodeIds.get(program);
  if (!ids) {
    ids = new Set(indexProgram(program).keys());
    nodeIds.set(program, ids);
  }
  return ids;
}

/** Coded: the frame is linked to blocks that are still in the program. */
export function isCoded(p: Production, frame: Frame): boolean {
  if (frame.links.length === 0) return false;
  const ids = idsIn(p.program);
  return frame.links.some((l) => ids.has(l));
}

/** A frame's status: the check's while it stands, otherwise how far the studio has got. */
export function frameProgress(p: Production, frame: Frame, rehearsed: Rehearsed): FrameStatus {
  const checked = frameStatus(frame, p);
  if (checked) return checked;
  if (rehearsed.get(frame.id) === basisFor(p, frame)) return 'rehearsed';
  if (isCoded(p, frame)) return 'coded';
  if (isStaged(p, frame)) return 'staged';
  return 'planned';
}

/**
 * The frames a Rehearse run of `scene` reached: each whose linked blocks include one that ran,
 * and, when the run got to the scene's end, those with no links (spec 08 section 9.7).
 */
export function framesReached(
  p: Production,
  scene: SceneId,
  ran: ReadonlySet<NodeId>,
  reachedEnd: boolean,
): Frame[] {
  return sceneFrames(p, scene).filter((f) =>
    f.links.length === 0 ? reachedEnd : f.links.some((l) => ran.has(l)),
  );
}

/** `rehearsed` with these frames played now, against the production as it is. */
export function withRehearsed(
  rehearsed: Rehearsed,
  p: Production,
  frames: readonly Frame[],
): Rehearsed {
  const changed = frames
    .map((f) => [f.id, basisFor(p, f)] as const)
    .filter(([id, basis]) => rehearsed.get(id) !== basis);
  // The same map when nothing is new, so a run reporting every frame doesn't re-render the App.
  if (changed.length === 0) return rehearsed;
  return new Map([...rehearsed, ...changed]);
}
