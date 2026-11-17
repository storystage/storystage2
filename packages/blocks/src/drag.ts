/**
 * What a drag moves in Blocks (`14-editors.md` section 3i.6; the owner's choice, 17 Nov 2026): the
 * one statement grabbed, with what's inside it, as Tiles and Alice move it. Blockly's own drag
 * takes every block under it too, and moves one only with Ctrl held, which an iPad hasn't got.
 *
 * Blockly's public drag strategy, with its protected `shouldHealStack` overridden (3i.12): the
 * blocks under the one dragged close up behind it, as Ctrl-dragging does. Blockly's keyboard move
 * (M) goes through the same strategy, so it moves one statement as well.
 */
import * as Blockly from 'blockly/core';

export class OneStatementDrag extends Blockly.dragging.BlockDragStrategy {
  protected override shouldHealStack(): boolean {
    return true;
  }
}

/** Gives a block the drag that moves it alone. */
export function dragsAlone(block: Blockly.BlockSvg): void {
  block.setDragStrategy(new OneStatementDrag(block));
}
