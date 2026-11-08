import { ENTRIES, ENUMS } from '@storystage/story-api';
import * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { blockTypes, defineBlocks, shapeOf } from './definitions.ts';
import {
  METHOD,
  STATEMENT_KINDS,
  EXPRESSION_KINDS,
  argInput,
  detailInput,
  nodeType,
  storyStatementType,
  storyValueType,
  TARGET,
} from './shapes.ts';

beforeAll(() => defineBlocks());

const inputsOf = (block: Blockly.Block) =>
  block.inputList.map((i) => i.name).filter((n) => !n.startsWith('ROW_'));

describe('a block for everything a program holds (3i.1)', () => {
  it('has a block for every Story API entry, with a slot for its target and each parameter', () => {
    const ws = new Blockly.Workspace();
    for (const entry of ENTRIES) {
      const type =
        entry.kind === 'procedure' ? storyStatementType(entry.name) : storyValueType(entry.name);
      expect(blockTypes()).toContain(type);
      const block = ws.newBlock(type);
      expect(inputsOf(block)).toEqual([TARGET, ...entry.params.map((p) => argInput(p.name))]);
      expect(block.outputConnection !== null).toBe(entry.kind === 'function');
      expect(block.previousConnection !== null).toBe(entry.kind === 'procedure');
    }
    ws.dispose();
  });

  it('has a block for every statement and expression kind, and every enumeration', () => {
    const types = blockTypes();
    for (const kind of [...STATEMENT_KINDS, ...EXPRESSION_KINDS])
      expect(types).toContain(nodeType(kind));
    for (const name of Object.keys(ENUMS)) expect(types).toContain(`ss_enum_${name}`);
  });

  it('words a block from the Story API’s words, target first', () => {
    const ws = new Blockly.Workspace();
    const move = ws.newBlock(storyStatementType('move'));
    expect(move.toString()).toBe('? move ? ?');
    ws.dispose();
  });

  it('adds a slot for each detail a call carries', () => {
    const shape = shapeOf(storyStatementType('move'), { details: ['duration'] });
    const slots = shape.parts.flatMap((p) => (p.kind === 'value' ? [p.input] : []));
    expect(slots).toEqual([
      TARGET,
      argInput('direction'),
      argInput('amount'),
      detailInput('duration'),
    ]);
    const words = shape.parts.flatMap((p) => (p.kind === 'words' ? [p.text] : []));
    expect(words).toContain('how long');
  });

  it('defines each block once, however often it is asked', () => {
    defineBlocks();
    expect(Blockly.Blocks[METHOD]).toBeDefined();
  });
});

describe('types on every connection (3i.3)', () => {
  const connects = (slotType: string, slot: string, valueType: string) => {
    const ws = new Blockly.Workspace();
    const parent = ws.newBlock(slotType);
    const child = ws.newBlock(valueType);
    const input = parent.getInput(slot)!.connection!;
    const ok = ws.connectionChecker.canConnect(input, child.outputConnection!, false);
    ws.dispose();
    return ok;
  };

  it('refuses a number where an object goes, and takes an object where one goes', () => {
    expect(connects(storyStatementType('move'), TARGET, nodeType('number'))).toBe(false);
    // An object whose class can't be known here fits, and the drop rule decides on drop.
    expect(connects(storyStatementType('move'), TARGET, nodeType('this'))).toBe(true);
  });

  it('takes a value that fits: a whole number where a number goes, not the other way', () => {
    expect(connects(storyStatementType('move'), argInput('amount'), nodeType('wholeNumber'))).toBe(
      true,
    );
    expect(connects(storyStatementType('move'), argInput('amount'), nodeType('text'))).toBe(false);
    expect(connects(nodeType('count'), 'TIMES', nodeType('number'))).toBe(false);
    expect(connects(nodeType('count'), 'TIMES', nodeType('wholeNumber'))).toBe(true);
  });

  it('takes only a direction where a direction goes', () => {
    expect(
      connects(storyStatementType('move'), argInput('direction'), 'ss_enum_MoveDirection'),
    ).toBe(true);
    expect(
      connects(storyStatementType('move'), argInput('direction'), 'ss_enum_TurnDirection'),
    ).toBe(false);
  });

  it('takes only true or false in a condition', () => {
    expect(connects(nodeType('if'), 'CONDITION', nodeType('compare'))).toBe(true);
    expect(connects(nodeType('if'), 'CONDITION', nodeType('number'))).toBe(false);
  });
});
