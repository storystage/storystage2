/**
 * "add detail ▾" at the end of a statement's row (`14-editors.md` sections 2.3 and 3i.5), as
 * Tiles has it: pressed, or Enter with focus on it, it asks which detail to add, then its value.
 * A field of our own, built as Blockly's guide to custom fields says (a subclass of `Field`,
 * through its public and protected hooks only, 3i.12). It holds no value and isn't saved, so the
 * program never sees it: the editor adds it when it draws a block that can take a detail. The same
 * field, with other words, is "or ▾" after a listener's last key or object (24 Nov 2026).
 */
import * as Blockly from 'blockly/core';
import blockWords from './strings/en-GB.json' with { type: 'json' };

const WORDS = blockWords as Readonly<Record<string, string>>;

/** The input it sits in, after the block's own. */
export const ADD_DETAIL_INPUT = 'SS_ADD_DETAIL';

export class AddDetailField extends Blockly.Field<string> {
  override SERIALIZABLE = false;
  override EDITABLE = true;

  private readonly onPress: (block: Blockly.BlockSvg) => void;
  private readonly ariaName: string;

  constructor(
    onPress: (block: Blockly.BlockSvg) => void,
    text = WORDS['block.addDetail']!,
    name = WORDS['block.addDetailName']!,
  ) {
    super(text);
    this.onPress = onPress;
    this.ariaName = name;
  }

  protected override initView() {
    super.initView();
    this.fieldGroup_?.classList.add('ss-add-detail');
    // A button that opens a menu (Blockly's guide: a clickable field's role is `button`).
    // Blockly hides the field's text from screen readers, so the button is named here.
    const button = this.getFocusableElement();
    button.setAttribute('role', 'button');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-label', this.ariaName);
  }

  /** Read as what it does, not as the arrow it shows. */
  override getAriaValue() {
    return this.ariaName;
  }

  override getAriaTypeName() {
    return null;
  }

  protected override showEditor_() {
    const block = this.getSourceBlock();
    if (block instanceof Blockly.BlockSvg) this.onPress(block);
  }
}
