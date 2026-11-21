/**
 * Sounds in the code (decision 0076, workplan 7.17): a `playAudio` block names its sound as
 * text holding what a music cue's `sound` holds, an imported clip's id (`sn1`) or a shelf
 * sound's Backstage id (spec 03, section 1.7). The studio refuses to remove an imported sound
 * while the code still names it, and shows where.
 */
import { walkProgram, type NodeId, type Program } from '@storystage/ast';
import { referenceTypeAt } from './words.ts';

/**
 * Every value naming `sound` where a sound goes: a block's argument, an input's, or a variable's
 * starting value of type `Audio`. Text that only happens to read "sn1" elsewhere isn't one.
 */
export function soundUses(program: Program, sound: string): readonly NodeId[] {
  const uses: NodeId[] = [];
  walkProgram(program, (n) => {
    if (n.kind === 'text' && n.value === sound && referenceTypeAt(program, n.id) === 'Audio')
      uses.push(n.id);
  });
  return uses;
}
