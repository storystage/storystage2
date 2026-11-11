/**
 * A frame's check status (spec 08 sections 9.6 and 9.7): its `basis`, whether its saved result is
 * stale, Checked or Look at, and keeping a flag. Cheap enough to call for every frame on every
 * render: the program's and each set-up's share of `basis` are hashed once and cached.
 */
import type { Program } from '@storystage/ast';
import type { CheckItem, Frame, FrameId, Production, Scene } from '@storystage/production';

/** A short, stable hash of text (53 bits, as hex). Not for security: only to see a change. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const programs = new WeakMap<Program, string>();
const setups = new WeakMap<Scene, string>();

const programHash = (p: Program) => {
  let h = programs.get(p);
  if (h === undefined) programs.set(p, (h = hash(JSON.stringify(p))));
  return h;
};
const setupHash = (s: Scene) => {
  let h = setups.get(s);
  if (h === undefined) setups.set(s, (h = hash(JSON.stringify(s))));
  return h;
};

/** What a frame's check result depends on, without the result itself. */
const frameWithoutCheck = ({ check: _, ...rest }: Frame) => rest;

/**
 * The frame's `basis`: the program, the scene's set-up, the frame and the frames beside it, the
 * script lines pinned to it, and the other script lines its result's items name (a speak line's).
 * A result whose `basis` differs is stale. `items` are the result's: the saved ones by default.
 */
export function basisFor(
  production: Production,
  frame: Frame,
  items: readonly CheckItem[] = frame.check?.items ?? [],
): string {
  const scene = production.scenes.find((s) => s.id === frame.scene);
  const siblings = production.frames
    .filter((f) => f.scene === frame.scene)
    .sort((a, b) => a.order - b.order);
  const at = siblings.findIndex((f) => f.id === frame.id);
  const near = siblings.slice(Math.max(0, at - 1), at + 2).map(frameWithoutCheck);
  const lines = production.script.filter((l) => l.pinnedFrame === frame.id);
  const named = new Set(items.flatMap((i) => (i.line ? [i.line] : [])));
  const others = production.script.filter((l) => named.has(l.id) && l.pinnedFrame !== frame.id);
  return hash(
    [
      programHash(production.program),
      scene ? setupHash(scene) : '',
      JSON.stringify(near),
      JSON.stringify(lines),
      // Only when there are any, so a result without speak lines keeps the basis it had.
      ...(others.length > 0 ? [JSON.stringify(others)] : []),
    ].join('|'),
  );
}

export interface CheckState {
  /** The saved result no longer fits what's there. */
  readonly stale: boolean;
  /** Flags not kept, which hold the frame back. */
  readonly flags: number;
  /** Flags the learner chose to keep. */
  readonly kept: number;
}

/** The state of a frame's saved result, or `null` if it has none. */
export function checkState(frame: Frame, production: Production): CheckState | null {
  const check = frame.check;
  if (!check) return null;
  const kept = new Set(check.kept);
  const flags = check.items.filter((i) => i.outcome === 'flag');
  return {
    stale: check.basis !== basisFor(production, frame),
    flags: flags.filter((i) => !kept.has(i.id)).length,
    kept: flags.filter((i) => kept.has(i.id)).length,
  };
}

/**
 * Checked when the result isn't stale and every flag is kept; Look at when a flag isn't kept;
 * `null` when there's no result, or a stale one, so the frame shows the studio's own status.
 */
export function frameStatus(frame: Frame, production: Production): 'checked' | 'lookAt' | null {
  const state = checkState(frame, production);
  if (!state || state.stale) return null;
  return state.flags > 0 ? 'lookAt' : 'checked';
}

/**
 * The production with a flag kept, or let go: the learner's own choice, for an undoable step
 * ("Keep the flag on frame 2.3"). Unchanged if the frame has no result.
 */
export function keepFlag(
  production: Production,
  frame: FrameId,
  itemId: string,
  keep: boolean,
): Production {
  return {
    ...production,
    frames: production.frames.map((f) => {
      if (f.id !== frame || !f.check) return f;
      const kept = f.check.kept.filter((id) => id !== itemId);
      return { ...f, check: { ...f.check, kept: keep ? [...kept, itemId] : kept } };
    }),
  };
}
