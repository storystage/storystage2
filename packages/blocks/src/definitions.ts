/**
 * Blockly block types from the shapes (`14-editors.md` section 3i.1). Each block builds its row
 * from its shape, and rebuilds it when its `extraState` arrives (a call's details, a list's
 * length), so the saved form alone says what slots a block has.
 */
import * as Blockly from 'blockly/core';
import type { TypeRef } from '@storystage/ast';
import type { EnumName, TypeName } from '@storystage/story-api';
import type { Extra } from './mapping.ts';
import {
  ENTRY_NAMES,
  ENUM_NAMES,
  EXPRESSION_KINDS,
  LISTENER,
  METHOD,
  STATEMENT_KINDS,
  USER_CALL,
  USER_FUNCTION,
  FROM_SCRIPT,
  entryNamed,
  enumShape,
  enumType,
  expressionShape,
  fromScriptShape,
  listenerShape,
  methodShape,
  nodeType,
  statementShape,
  storyShape,
  storyStatementType,
  storyValueType,
  userCallShape,
  type Shape,
} from './shapes.ts';

/** A list's item type as a type name, for its slots' checks; `null` for the learner's own. */
const typeName = (ref: TypeRef | undefined): TypeName | null => {
  if (!ref) return null;
  if (ref.kind === 'story') return ref.name as TypeName;
  if (ref.kind === 'array') {
    const of = typeName(ref.of);
    return of ? (`${of}[]` as TypeName) : null;
  }
  return null;
};

/** The shape of a block of `type`, given what it carries. */
export function shapeOf(type: string, extra: Extra = {}): Shape {
  if (type === METHOD) return methodShape();
  if (type === FROM_SCRIPT) return fromScriptShape();
  if (type === LISTENER) return listenerShape(extra.event ?? '', extra.details ?? []);
  if (type === USER_CALL || type === USER_FUNCTION)
    return userCallShape(
      type === USER_CALL ? 'statement' : 'value',
      extra.params ?? [],
      extra.details ?? [],
    );
  if (type.startsWith('ss_storyfn_'))
    return storyShape(type.slice('ss_storyfn_'.length), extra.details ?? []);
  if (type.startsWith('ss_story_'))
    return storyShape(type.slice('ss_story_'.length), extra.details ?? []);
  if (type.startsWith('ss_enum_')) return enumShape(type.slice('ss_enum_'.length) as EnumName);
  const kind = type.slice('ss_'.length);
  if ((STATEMENT_KINDS as readonly string[]).includes(kind))
    return statementShape(kind as (typeof STATEMENT_KINDS)[number], {
      hasValue: extra.hasValue,
      constant: extra.constant,
    });
  return expressionShape(kind, { count: extra.count, of: typeName(extra.of) });
}

/** Every block type this package defines. */
export function blockTypes(): string[] {
  return [
    METHOD,
    LISTENER,
    USER_CALL,
    USER_FUNCTION,
    FROM_SCRIPT,
    ...ENTRY_NAMES.map((name) =>
      entryNamed(name)!.kind === 'procedure' ? storyStatementType(name) : storyValueType(name),
    ),
    ...ENUM_NAMES.map(enumType),
    ...STATEMENT_KINDS.map(nodeType),
    ...EXPRESSION_KINDS.map(nodeType),
  ];
}

interface StoryBlock extends Blockly.Block {
  ssExtra: Extra;
}

/** Lays out a block's row from its shape, replacing whatever it had. */
function build(block: StoryBlock, shape: Shape) {
  while (block.inputList.length > 0) block.removeInput(block.inputList[0]!.name);
  let pending: Blockly.Field[] = [];
  let rows = 0;
  const flush = (input: Blockly.Input) => {
    for (const f of pending) input.appendField(f, f.name);
    pending = [];
  };
  for (const part of shape.parts) {
    switch (part.kind) {
      case 'words':
        pending.push(new Blockly.FieldLabel(part.text));
        break;
      case 'label':
        pending.push(new Blockly.FieldLabel(block.ssExtra.label ?? ''));
        break;
      case 'number': {
        const f = new Blockly.FieldNumber(0, undefined, undefined, part.whole ? 1 : 0);
        f.name = part.field;
        pending.push(f);
        break;
      }
      case 'text': {
        const f = new Blockly.FieldTextInput('');
        f.name = part.field;
        pending.push(f);
        break;
      }
      case 'choice': {
        const f = new Blockly.FieldDropdown(part.options);
        f.name = part.field;
        pending.push(f);
        break;
      }
      case 'value': {
        const input = block.appendValueInput(part.input).setCheck(part.check);
        flush(input);
        break;
      }
      case 'statements': {
        if (pending.length > 0) flush(block.appendDummyInput(`ROW_${rows++}`));
        block.appendStatementInput(part.input);
        break;
      }
    }
  }
  if (pending.length > 0) flush(block.appendDummyInput(`ROW_${rows}`));
}

/** Registers every block type with Blockly. Safe to call more than once. */
export function defineBlocks(): void {
  for (const type of blockTypes()) {
    if (Blockly.Blocks[type]) continue;
    Blockly.Blocks[type] = {
      init(this: StoryBlock) {
        this.ssExtra = {};
        const shape = defaultShape(type);
        if (shape.role === 'statement') {
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
        } else if (shape.role === 'value') {
          this.setOutput(true, shape.output ?? null);
        }
        this.setInputsInline(true);
        build(this, shape);
      },
      saveExtraState(this: StoryBlock) {
        return Object.keys(this.ssExtra).length > 0 ? this.ssExtra : null;
      },
      loadExtraState(this: StoryBlock, extra: Extra) {
        this.ssExtra = extra;
        const shape = shapeOf(type, extra);
        if (shape.role === 'value') this.setOutput(true, shape.output ?? null);
        build(this, shape);
      },
    };
  }
}

/** A block's shape before its `extraState` arrives (a listener with no event yet, say). */
function defaultShape(type: string): Shape {
  try {
    return shapeOf(type);
  } catch {
    return { type, role: 'header', parts: [] };
  }
}
