/**
 * **Use the new words** (spec 08 section 9.7, spec 06 section 4.1): the edit that puts a speak
 * line's script words into its block, for the studio's undoable step. The script stays the
 * learner's, and code changes only when they choose this.
 */
import { indexProgram, mintId, type SetArgument } from '@storystage/ast';
import type { CheckItem, Production } from '@storystage/production';
import { numberedLines } from './runner.ts';

/**
 * The `setArgument` edit giving the item's `speakLine` block its script line's words, labelled
 * "Use the script's words for line 2.3"; `null` when the item isn't a speak line's, or its block or
 * line is gone.
 */
export function scriptWords(production: Production, item: CheckItem): SetArgument | null {
  if (!item.id.startsWith('speak:') || !item.node || !item.line) return null;
  const line = numberedLines(production).get(item.line);
  if (!line) return null;
  const index = indexProgram(production.program);
  const block = index.get(item.node)?.node;
  if (
    !block ||
    block.kind !== 'call' ||
    block.callee.kind !== 'story' ||
    block.callee.name !== 'speakLine'
  )
    return null;
  return {
    kind: 'setArgument',
    node: item.node,
    slot: 'args',
    param: 'text',
    value: { id: mintId(new Set(index.keys())), kind: 'text', value: line.text },
    label: `Use the script’s words for line ${line.number}`,
  };
}
