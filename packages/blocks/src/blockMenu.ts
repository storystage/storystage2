/**
 * A block's menu (`14-editors.md` sections 2.3 and 3i.7): switch a statement off or on, add a
 * detail it hasn't got, take one out, duplicate it, delete it. Each is the shared model's edit
 * (`canDrop`, `labelFor`), so it reads as Tiles' does and is one undo step. Nothing here touches
 * Blockly: `editor.ts` puts these in Blockly's menu and its keys.
 */
import {
  EditRefused,
  applyAll,
  copyNode,
  idMinter,
  indexProgram,
  isStatement,
  type EditOperation,
  type Expression,
  type NodeId,
  type Program,
  type StatementSlot,
} from '@storystage/ast';
import { DETAILS, STORY_WORDS } from '@storystage/story-api';
import { canDrop, detailsToAdd, labelFor, type ValuePlace } from '@storystage/story-api/editing';
import blockWords from './strings/en-GB.json' with { type: 'json' };

const WORDS = blockWords as Readonly<Record<string, string>>;
const STORY = STORY_WORDS as Readonly<Record<string, string>>;

const fillIn = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/gu, (_, k: string) => values[k] ?? `{${k}}`);

/** What the menu offers for a block. */
export type MenuAction =
  | { readonly kind: 'switch' }
  | { readonly kind: 'addDetail'; readonly detail: string }
  | { readonly kind: 'removeDetail'; readonly detail: string }
  | { readonly kind: 'moveUp' }
  | { readonly kind: 'moveDown' }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'delete' };

export interface MenuItem {
  readonly action: MenuAction;
  /** The menu's words for it ("Switch off", "Add detail: how long"). */
  readonly words: string;
}

export type MenuChange =
  | { readonly ok: true; readonly edits: readonly EditOperation[]; readonly label: string }
  | { readonly ok: false; readonly reason: string };

const detailWords = (detail: string) => STORY[`detail.${detail}`] ?? detail;

/** Where a statement sits in its list, if it is one. */
function placeOf(program: Program, node: NodeId) {
  const at = indexProgram(program).get(node);
  if (!at || !isStatement(at.node) || at.parent === null || typeof at.key !== 'number') return null;
  const list = (indexProgram(program).get(at.parent)?.node as unknown as Record<string, unknown[]>)[
    at.slot
  ];
  return {
    statement: at.node,
    parent: at.parent,
    slot: at.slot as StatementSlot,
    index: at.key,
    length: list?.length ?? 0,
  };
}

/** The details a block has been given that the learner may take out (not the script's line). */
function detailsGiven(program: Program, node: NodeId): readonly string[] {
  const found = indexProgram(program).get(node)?.node;
  if (!found || !('details' in found)) return [];
  return Object.keys(found.details).filter((d) => !DETAILS[d]?.fromScript);
}

/** The menu for a block, in order. A method's own block offers only its details (a listener's). */
export function menuFor(program: Program, node: NodeId): readonly MenuItem[] {
  const items: MenuItem[] = [];
  const place = placeOf(program, node);
  if (place)
    items.push({
      action: { kind: 'switch' },
      words: WORDS[place.statement.enabled === false ? 'menu.switchOn' : 'menu.switchOff']!,
    });
  for (const d of detailsToAdd(program, node))
    items.push({
      action: { kind: 'addDetail', detail: d.name },
      words: fillIn(WORDS['menu.addDetail']!, { detail: d.words }),
    });
  for (const d of detailsGiven(program, node))
    items.push({
      action: { kind: 'removeDetail', detail: d },
      words: fillIn(WORDS['menu.removeDetail']!, { detail: detailWords(d) }),
    });
  if (place) {
    // One place up or down in its list, as Tiles' Alt+↑ and Alt+↓ (14-editors 3d).
    if (place.index > 0) items.push({ action: { kind: 'moveUp' }, words: WORDS['menu.moveUp']! });
    if (place.index < place.length - 1)
      items.push({ action: { kind: 'moveDown' }, words: WORDS['menu.moveDown']! });
    items.push({ action: { kind: 'duplicate' }, words: WORDS['menu.duplicate']! });
    items.push({ action: { kind: 'delete' }, words: WORDS['menu.delete']! });
  }
  return items;
}

/** An edit before it has its label: `Omit` taken over each kind, not the union. */
type Unlabelled = {
  [K in EditOperation['kind']]: Omit<Extract<EditOperation, { kind: K }>, 'label'>;
}[EditOperation['kind']];

/** One edit, checked, with the shared label. */
function single(program: Program, edit: Unlabelled): MenuChange {
  const labelled = { ...edit, label: '' } as EditOperation;
  const label = labelFor(program, labelled);
  const done = { ...labelled, label } as EditOperation;
  try {
    applyAll(program, [done]);
  } catch (e) {
    if (e instanceof EditRefused) return { ok: false, reason: e.reason };
    throw e;
  }
  return { ok: true, edits: [done], label };
}

const gone = (): MenuChange => ({ ok: false, reason: WORDS['menu.gone']! });

/** Where an added detail's value goes, for the cascade to ask about. */
export const detailPlace = (node: NodeId, detail: string): ValuePlace => ({
  kind: 'value',
  node,
  slot: 'details',
  param: detail,
});

/**
 * The edits for a menu action. Adding a detail needs its value, which the cascade asks for
 * first (`detailPlace`); without one, adding it is refused.
 */
export function changeFor(
  program: Program,
  node: NodeId,
  action: MenuAction,
  value?: Expression,
): MenuChange {
  const place = placeOf(program, node);
  switch (action.kind) {
    case 'switch':
      if (!place) return gone();
      return single(program, {
        kind: 'setEnabled',
        node,
        enabled: place.statement.enabled === false,
      });
    case 'addDetail': {
      if (!value) return gone();
      const drop = canDrop(program, detailPlace(node, action.detail), value);
      return drop.ok
        ? { ok: true, edits: drop.edits, label: drop.label }
        : { ok: false, reason: drop.reason };
    }
    case 'moveUp':
    case 'moveDown': {
      if (!place) return gone();
      const index = place.index + (action.kind === 'moveUp' ? -1 : 1);
      if (index < 0) return { ok: false, reason: WORDS['menu.top']! };
      if (index >= place.length) return { ok: false, reason: WORDS['menu.bottom']! };
      return single(program, { kind: 'move', node, parent: place.parent, slot: place.slot, index });
    }
    case 'removeDetail':
      return single(program, {
        kind: 'setArgument',
        node,
        slot: 'details',
        param: action.detail,
        value: null,
      });
    case 'duplicate': {
      if (!place) return gone();
      const copy = copyNode(place.statement, idMinter(program));
      const drop = canDrop(
        program,
        { kind: 'statement', parent: place.parent, slot: place.slot, index: place.index + 1 },
        copy,
      );
      return drop.ok
        ? { ok: true, edits: drop.edits, label: drop.label }
        : { ok: false, reason: drop.reason };
    }
    case 'delete':
      if (!place) return gone();
      return single(program, { kind: 'remove', node });
  }
}
