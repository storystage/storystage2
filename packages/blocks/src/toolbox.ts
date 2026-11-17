/**
 * The palette as Blockly's toolbox (`14-editors.md` sections 2.1 and 3i.2): for the chosen object,
 * one tab's groups from the shared model's `palette`, each under its heading, then the control
 * blocks. It is an open flyout, as screen 02's Blocks column is, not a menu of categories.
 *
 * Each block is the shared model's new block (`newCall`, `newControl`), with its values empty
 * (`none`), drawn as the same node would be in a method (`blockStateOf`). Its ids are only for
 * the flyout: a block dragged out gets the program's own ids when it lands (`editor.ts`).
 *
 * Each also carries which entry it is (`paletteEntry`), in Blockly's `data`, drawn as its
 * `data-callee`: what a test reads to compare the palette with Tiles' (section 5.6).
 */
import type { Callee, Expression, NodeId, Program, Statement } from '@storystage/ast';
import {
  CONTROL_KINDS,
  type ControlKind,
  newCall,
  newControl,
  newLocal,
  palette,
  type PaletteTab,
} from '@storystage/story-api/editing';
import { blockStateOf, type BlockState } from './mapping.ts';
import blockWords from './strings/en-GB.json' with { type: 'json' };

const WORDS = blockWords as Readonly<Record<string, string>>;

export interface ToolboxDefinition {
  readonly kind: 'flyoutToolbox';
  readonly contents: readonly (
    { readonly kind: 'label'; readonly text: string } | ({ readonly kind: 'block' } & BlockState)
  )[];
}

/**
 * The control group's blocks, in the order of Tiles' control bar (spec 14, 3a and 5.6): the
 * control kinds, then variable and set, then the note. Variable and set ask their question when
 * they're dropped (`editor.ts`), as Tiles' tiles do.
 */
export type ControlEntry = ControlKind | 'variable' | 'assign';
export const CONTROL_GROUP: readonly ControlEntry[] = [
  ...CONTROL_KINDS.filter((k) => k !== 'comment'),
  'variable',
  'assign',
  'comment',
];

/** A control group block as the flyout draws it: variable and set stand in until asked. */
function controlBlock(kind: ControlEntry, mint: () => NodeId): Statement {
  if (kind === 'variable')
    return newLocal(WORDS['palette.variableName']!, { kind: 'story', name: 'Number' }, mint);
  if (kind === 'assign')
    return {
      id: mint(),
      kind: 'assign',
      target: { id: mint(), kind: 'none' },
      value: { id: mint(), kind: 'none' },
    } as unknown as Statement;
  return newControl(kind, mint);
}

/** Which palette entry a block is: `story:move`, `user:<method id>` or `control:doTogether`. */
export const paletteEntry = (entry: Callee | ControlEntry): string =>
  typeof entry === 'string'
    ? `control:${entry}`
    : entry.kind === 'story'
      ? `story:${entry.name}`
      : `user:${entry.method}`;

/** Ids for the flyout's blocks: `p1`, `p2`… (a block dragged out is given program ids). */
function flyoutIds(): () => NodeId {
  let n = 0;
  return () => `pal${++n}` as NodeId;
}

/** A copy of `node` with every node in it given a new id. */
function withNewIds<T>(node: T, mint: () => NodeId): T {
  if (Array.isArray(node)) return node.map((n) => withNewIds(n, mint)) as T;
  if (node === null || typeof node !== 'object') return node;
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) copy[k] = withNewIds(v, mint);
  if ('kind' in copy && 'id' in copy) copy.id = mint();
  return copy as T;
}

/**
 * A palette block's values as shadow blocks, as Blockly means a palette's defaults to be: drawn the
 * same, but named for screen readers as part of their block, not blocks of their own (Blockly
 * names a nested block a figure, which a palette's list may not hold). `fromBlocks` reads either.
 */
function withShadows(state: BlockState): BlockState {
  if (!state.inputs) return state;
  const inputs: NonNullable<BlockState['inputs']> = {};
  for (const [name, slot] of Object.entries(state.inputs)) {
    const child = slot.block ?? slot.shadow;
    // A statement list's blocks stay blocks; only values become shadows.
    inputs[name] =
      child && !name.startsWith('BODY') && name !== 'THEN' && name !== 'ELSE'
        ? { shadow: withShadows(child) }
        : slot;
  }
  return { ...state, inputs };
}

/** The palette for `target`, seen from a method of the type `self`, on `tab`. */
export function toolboxFor(
  program: Program,
  target: Expression,
  self: NodeId,
  tab: PaletteTab,
): ToolboxDefinition {
  const mint = flyoutIds();
  const contents: ToolboxDefinition['contents'][number][] = [];
  for (const group of palette(program, target, self, tab)) {
    contents.push({ kind: 'label', text: group.words });
    for (const item of group.items) {
      const node = newCall(
        program,
        withNewIds(target, mint),
        item.callee,
        tab === 'questions',
        mint,
        undefined,
        self,
      );
      contents.push({
        kind: 'block',
        ...withShadows(blockStateOf(program, node)),
        data: paletteEntry(item.callee),
      });
    }
  }
  if (tab === 'actions') {
    contents.push({ kind: 'label', text: WORDS['palette.control']! });
    for (const kind of CONTROL_GROUP)
      contents.push({
        kind: 'block',
        ...withShadows(blockStateOf(program, controlBlock(kind, mint))),
        data: paletteEntry(kind),
      });
  }
  return { kind: 'flyoutToolbox', contents };
}

export { withNewIds };
