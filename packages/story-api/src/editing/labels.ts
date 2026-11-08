/**
 * Spec 14, section 2.4: an undo label for each edit, from the Story API's words, naming what
 * changed: "Make cat say Hello", "Change 1 to 2 in cat move". S2's `defaultLabel` is the fallback.
 */
import { defaultLabel, indexProgram } from '@storystage/ast';
import type { EditOperation, Expression, Program } from '@storystage/ast';
import { describer, fill, word, type WordsOptions } from './words.ts';

/** Plain words for one edit, about to be made to `program`. */
export function labelFor(
  program: Program,
  edit: EditOperation,
  options: WordsOptions = {},
): string {
  const describe = describer(program, options);
  const index = indexProgram(program);
  const node = (id: string) => index.get(id as never)?.node;

  switch (edit.kind) {
    case 'insert': {
      const owner = describe.ownerOf(edit.parent);
      const what = owner ? describe.inside(edit.node, owner) : describe(edit.node);
      return fill(word(edit.node.kind === 'call' ? 'label.make' : 'label.add'), { what });
    }
    case 'remove': {
      const removed = node(edit.node);
      return removed
        ? fill(word('label.delete'), { what: describe(removed) })
        : defaultLabel(program, edit);
    }
    case 'move': {
      const moved = node(edit.node);
      const from = index.get(edit.node);
      const where = node(edit.parent);
      if (!moved || !where) return defaultLabel(program, edit);
      const what = describe(moved);
      return from?.parent === edit.parent && from.slot === edit.slot
        ? fill(word('label.moveTo'), { what })
        : fill(word('label.moveInto'), { what, where: describe.short(where) });
    }
    case 'setArgument': {
      const changed = node(edit.node);
      if (!changed) return defaultLabel(program, edit);
      const what = describe.short(changed);
      const holder = changed as unknown as Record<string, unknown>;
      const slot = holder[edit.slot];
      const before = (
        edit.param === undefined
          ? slot
          : (slot as Record<string, unknown> | undefined)?.[edit.param]
      ) as Expression | null | undefined;
      const owner = describe.ownerOf(changed.id);
      const words = (e: Expression) => (owner ? describe.inside(e, owner) : describe(e));
      if (edit.slot === 'details' && edit.param) {
        const detail = word(`detail.${edit.param}`);
        if (edit.value === null) return fill(word('label.removeDetail'), { detail, what });
        if (!before) return fill(word('label.addDetail'), { detail, what });
      }
      if (edit.value === null) return defaultLabel(program, edit);
      const to = words(edit.value);
      return !before || before.kind === 'none'
        ? fill(word('label.choose'), { to, what })
        : fill(word('label.change'), { from: words(before), to, what });
    }
    case 'setEnabled': {
      const target = node(edit.node);
      if (!target) return defaultLabel(program, edit);
      return fill(word(edit.enabled ? 'label.switchOn' : 'label.switchOff'), {
        what: describe(target),
      });
    }
    case 'setComment':
      return word('label.comment');
    default:
      return defaultLabel(program, edit);
  }
}
