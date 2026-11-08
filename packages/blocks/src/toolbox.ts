/**
 * The palette as Blockly's toolbox (`14-editors.md` sections 2.1 and 3i.2): for the chosen object,
 * one tab's groups from the shared model's `palette`, each under its heading, then the control
 * blocks. It is an open flyout, as screen 02's Blocks column is, not a menu of categories.
 *
 * Each block is the shared model's new block (`newCall`, `newControl`), with its values empty
 * (`none`), drawn as the same node would be in a method (`blockStateOf`). Its ids are only for
 * the flyout: a block dragged out gets the program's own ids when it lands (`editor.ts`).
 */
import type { Expression, NodeId, Program } from '@storystage/ast';
import {
  CONTROL_KINDS,
  newCall,
  newControl,
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
      contents.push({ kind: 'block', ...blockStateOf(program, node) });
    }
  }
  if (tab === 'actions') {
    contents.push({ kind: 'label', text: WORDS['palette.control']! });
    for (const kind of CONTROL_KINDS)
      contents.push({ kind: 'block', ...blockStateOf(program, newControl(kind, mint)) });
  }
  return { kind: 'flyoutToolbox', contents };
}

export { withNewIds };
