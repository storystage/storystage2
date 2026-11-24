/**
 * A listener's keys or objects, one at a time (the owner's choice of 24 Nov 2026; `14-editors.md`
 * section 2.3 item 5), as Tiles has them: "or ▾" after the last item asks for another, and each
 * item's menu takes it out, through the shared model's `addItemPlace` and `itemChange`. Taking out
 * the last takes the detail out, so a listener is never left with an empty list.
 */
import type { NodeId, Program } from '@storystage/ast';
import { STORY_WORDS } from '@storystage/story-api';
import {
  addItemPlace,
  describer,
  fill,
  itemChange,
  listDetailOf,
  type MenuChange,
  type ValuePlace,
  type WordsOptions,
} from '@storystage/story-api/editing';
import { indexProgram } from '@storystage/ast';
import blockWords from './strings/en-GB.json' with { type: 'json' };

const WORDS = blockWords as Readonly<Record<string, string>>;
const STORY = STORY_WORDS as Readonly<Record<string, string>>;

/** The detail's own words ("which keys"). */
const detailWords = (detail: string) => STORY[`detail.${detail}`] ?? detail;

/** What "or ▾" on `list` asks for, or null when it isn't a listener's list detail. */
export function addItemAsk(
  program: Program,
  list: NodeId,
): { readonly place: ValuePlace; readonly label: string } | null {
  const detail = listDetailOf(program, list);
  const place = detail && addItemPlace(program, list);
  return place ? { place, label: detailWords(detail.detail) } : null;
}

/** "or ▾"'s accessible name: "or, add another to which keys". */
export function addItemName(program: Program, list: NodeId): string | null {
  const detail = listDetailOf(program, list);
  return detail ? fill(WORDS['block.addItemName']!, { detail: detailWords(detail.detail) }) : null;
}

/**
 * The item menu's "Take up arrow out" for `item`, with its change and where focus goes after it,
 * when `item` is one of a listener's keys or objects; else null. Focus stays on the list, or goes
 * to the listener when the last item takes the list with it (S6's review of #675).
 */
export function takeOutItem(
  program: Program,
  item: NodeId,
  options: WordsOptions = {},
): { readonly words: string; readonly change: MenuChange; readonly then: NodeId } | null {
  const at = indexProgram(program).get(item);
  if (!at?.parent || at.slot !== 'items' || typeof at.key !== 'number') return null;
  const detail = listDetailOf(program, at.parent);
  if (!detail) return null;
  const list = indexProgram(program).get(at.parent)?.node;
  const last = list?.kind === 'arrayOf' && list.items.length === 1;
  return {
    then: last ? detail.listener.id : at.parent,
    words: fill(WORDS['block.removeItem']!, {
      item: describer(program, options)(at.node as never),
    }),
    change: itemChange(program, at.parent, at.key, null, options),
  };
}
