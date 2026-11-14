/**
 * Frames linked to blocks (WP10.8; `03-production-format.md` section 7): a frame lists the blocks
 * that play it, by node id. A link to a block that has gone stays in the file, so undo can bring
 * the block back to its frame; the frame just isn't linked while the block is gone.
 */
import { indexProgram, type NodeId } from '@storystage/ast';
import type { Frame, FrameId, Production } from '@storystage/production';

/** The statement lists a block can sit in: a method's or a container's body, an if's two arms. */
const STATEMENT_SLOTS = new Set(['body', 'then', 'else']);

/**
 * The block a frame links to for `node`: the statement holding it (a value inside a block links
 * its block), or `null` for something that isn't in a statement, such as a method.
 */
export function linkableBlock(p: Production, node: NodeId): NodeId | null {
  const index = indexProgram(p.program);
  for (let at: NodeId | null = node; at !== null;) {
    const place = index.get(at);
    if (!place) return null;
    if (STATEMENT_SLOTS.has(place.slot)) return at;
    at = place.parent;
  }
  return null;
}

/** The frame's links whose blocks are still in the program, in the frame's order. */
export function liveLinks(p: Production, frame: Frame): NodeId[] {
  if (frame.links.length === 0) return [];
  const index = indexProgram(p.program);
  return frame.links.filter((l) => index.has(l));
}

/** `p` with `block` linked to the frame, or unlinked from it. The same `p` if nothing changes. */
export function withLink(
  p: Production,
  frame: FrameId,
  block: NodeId,
  linked: boolean,
): Production {
  let changed = false;
  const frames = p.frames.map((f) => {
    if (f.id !== frame || f.links.includes(block) === linked) return f;
    changed = true;
    return { ...f, links: linked ? [...f.links, block] : f.links.filter((l) => l !== block) };
  });
  return changed ? { ...p, frames } : p;
}
