/**
 * A block dragged out of the palette (`14-editors.md` sections 2.2, 2.3 and 3i.6). When it lands,
 * it is the one node in the method the program doesn't have yet. It gets the program's own ids,
 * the shared drop rule (`canDrop`) places it, and the shared cascade asks for each of its empty
 * values in order, through `ask`. The drop and the answers are then one undo step, with the drop's
 * label; Escape at any question cancels the whole drop, and nothing changes.
 */
import {
  idsOf,
  indexProgram,
  isStatement,
  mintId,
  type EditOperation,
  type Expression,
  type NodeId,
  type Program,
  type Statement,
  type StatementSlot,
} from '@storystage/ast';
import {
  canDrop,
  emptySlots,
  readyFor,
  type Place,
  type ValuePlace,
} from '@storystage/story-api/editing';
import { STORY_WORDS } from '@storystage/story-api';
import { listsOf, valuesOf } from './gestures.ts';
import type { FromBlocks } from './mapping.ts';
import { withNewIds } from './toolbox.ts';

/** A node the blocks have and the program doesn't, and where it landed. */
export interface Fresh {
  readonly place: Place;
  readonly node: Statement | Expression;
}

/** The new nodes in the blocks, outermost only: a palette drop gives exactly one. */
export function freshIn(program: Program, read: FromBlocks): Fresh[] {
  const known = indexProgram(program);
  const found: Fresh[] = [];
  const list = (parent: NodeId, slot: StatementSlot, items: readonly Statement[]) => {
    items.forEach((s, index) => {
      if (!known.has(s.id)) {
        found.push({ place: { kind: 'statement', parent, slot, index }, node: s });
        return;
      }
      for (const v of valuesOf(s)) {
        if (v.value && !known.has(v.value.id))
          found.push({
            place: {
              kind: 'value',
              node: s.id,
              slot: v.slot,
              ...(v.param ? { param: v.param } : {}),
            },
            node: v.value,
          });
      }
      for (const [inner, l] of listsOf(s)) list(s.id, inner, l);
    });
  };
  list(read.owner, 'body', read.body);
  return found;
}

/** What the editor asks the learner, and where. */
export interface AskRequest {
  /** The program as it would be with the drop and the answers so far. */
  readonly program: Program;
  readonly place: ValuePlace;
  /** What the value is for, in words ("direction"). */
  readonly label: string;
}

/** The learner's answer, or `null` for Escape. */
export type Ask = (request: AskRequest) => Promise<Expression | null>;

export type DropOutcome =
  | { readonly kind: 'edits'; readonly edits: readonly EditOperation[]; readonly label: string }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'cancelled' };

const STORY = STORY_WORDS as Readonly<Record<string, string>>;

/** The words for what a value slot is for. */
function slotWords(place: ValuePlace): string {
  const name = place.param ?? place.slot;
  return STORY[`param.${name}`] ?? STORY[`detail.${name}`] ?? name;
}

/** The node with one of its empty values filled. */
function filled(node: Statement | Expression, slot: ValuePlace, value: Expression) {
  const holder = node as unknown as Record<string, unknown>;
  if (slot.param === undefined) return { ...node, [slot.slot]: value } as typeof node;
  const values = holder[slot.slot] as Record<string, Expression>;
  return { ...node, [slot.slot]: { ...values, [slot.param]: value } } as typeof node;
}

/**
 * Places a block from the palette, then asks for its values one by one. As in Tiles, each answer
 * goes into the block itself and the drop is checked again, so the step is one insert, named for
 * the finished block ("Make cat say Hello").
 */
export async function dropFromPalette(
  program: Program,
  fresh: Fresh,
  ask: Ask | null,
): Promise<DropOutcome> {
  const taken = idsOf(program);
  const mint = () => {
    const id = mintId(taken);
    taken.add(id);
    return id;
  };
  let node = withNewIds(fresh.node, mint);
  // A loop dropped inside a loop gets an item name nothing there has ("item2"), as in Tiles,
  // rather than being refused for two `item`s.
  if (fresh.place.kind === 'statement' && isStatement(node))
    node = readyFor(program, fresh.place, node);
  let drop = canDrop(program, fresh.place, node);
  if (!drop.ok) return { kind: 'refused', reason: drop.reason };
  if (ask) {
    for (const place of emptySlots(node)) {
      const value = await ask({ program: drop.program, place, label: slotWords(place) });
      if (value === null) return { kind: 'cancelled' };
      // The answer takes the program's own ids too, whoever made it.
      node = filled(node, place, withNewIds(value, mint));
      drop = canDrop(program, fresh.place, node);
      if (!drop.ok) return { kind: 'refused', reason: drop.reason };
    }
  }
  return { kind: 'edits', edits: drop.edits, label: drop.label };
}
