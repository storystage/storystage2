import {
  NODE_ID_PATTERN,
  applyEdits,
  type Expression,
  type NodeId,
  type Statement,
} from '@storystage/ast';
import { sampleProgram } from '@storystage/ast/testing';
import { newCall, newControl } from '@storystage/story-api/editing';
import * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { defineBlocks } from './definitions.ts';
import { dropFromPalette, freshIn, type Ask } from './drops.ts';
import { storyStatementType } from './shapes.ts';
import { toolboxFor } from './toolbox.ts';

beforeAll(() => defineBlocks());

const program = sampleProgram();
const scene = program.types[0]!;
const main = scene.methods.find((m) => m.name === 'myFirstMethod')!;
const catField = scene.fields.find((f) => f.name === 'cat')!;
let n = 0;
const mint = () => `new${++n}` as NodeId;
const cat = (): Expression => ({
  id: mint(),
  kind: 'fieldRef',
  target: { id: mint(), kind: 'this' },
  field: catField.id,
});
const blocksOf = (body: readonly Statement[]) => ({ owner: main.id, body, args: {}, details: {} });

describe('the palette as a toolbox (3i.2)', () => {
  it('offers the object’s actions in Alice’s categories, then the control blocks', () => {
    const toolbox = toolboxFor(program, cat(), scene.id, 'actions');
    const labels = toolbox.contents.flatMap((c) => (c.kind === 'label' ? [c.text] : []));
    expect(labels[0]).toBe('say, think');
    expect(labels.at(-1)).toBe('control');
    const types = toolbox.contents.flatMap((c) => (c.kind === 'block' ? [c.type] : []));
    expect(types).toContain(storyStatementType('say'));
    expect(types).toContain(storyStatementType('move'));
    expect(types).toContain('ss_doTogether');
    expect(types.some((t) => t.startsWith('ss_storyfn_'))).toBe(false);
  });

  it('offers questions on the questions tab, with no control blocks', () => {
    const toolbox = toolboxFor(program, cat(), scene.id, 'questions');
    const types = toolbox.contents.flatMap((c) => (c.kind === 'block' ? [c.type] : []));
    expect(types.length).toBeGreaterThan(0);
    expect(types.every((t) => t.startsWith('ss_storyfn_'))).toBe(true);
  });

  it('gives every block in it its own id, and Blockly draws each one', () => {
    const toolbox = toolboxFor(program, cat(), scene.id, 'actions');
    const blocks = toolbox.contents.filter((c) => c.kind === 'block');
    const ids = blocks.map((b) => JSON.stringify(b).match(/"id":"[^"]+"/g)).flat();
    expect(new Set(ids).size).toBe(ids.length);
    const ws = new Blockly.Workspace();
    for (const { kind: _, ...state } of blocks)
      expect(() => Blockly.serialization.blocks.append(state as never, ws)).not.toThrow();
    ws.dispose();
  });
});

describe('a block dropped from the palette (3i.6)', () => {
  /** A new `say` on the cat, as the palette makes it, with its words still empty. */
  const newSay = () => newCall(program, cat(), { kind: 'story', name: 'say' }, false, mint);

  it('is found where it landed, and nothing is found when nothing is new', () => {
    const say = newSay() as Statement;
    const found = freshIn(
      program,
      blocksOf([...main.body.slice(0, 1), say, ...main.body.slice(1)]),
    );
    expect(found).toEqual([
      { place: { kind: 'statement', parent: main.id, slot: 'body', index: 1 }, node: say },
    ]);
    expect(freshIn(program, blocksOf(main.body))).toEqual([]);
  });

  it('asks for each empty value, then is one insert named for the finished block', async () => {
    const say = newSay() as Statement;
    const asked: string[] = [];
    const ask: Ask = async ({ label }) => {
      asked.push(label);
      return { id: mint(), kind: 'text', value: 'Hello' };
    };
    const outcome = await dropFromPalette(
      program,
      freshIn(program, blocksOf([...main.body, say]))[0]!,
      ask,
    );
    expect(asked).toEqual(['words']);
    expect(outcome.kind).toBe('edits');
    if (outcome.kind !== 'edits') return;
    expect(outcome.edits.map((e) => e.kind)).toEqual(['insert']);
    expect(outcome.label).toMatch(/say Hello/);
    const after = applyEdits(program, outcome.edits);
    const added = after.types[0]!.methods.find((m) => m.id === main.id)!.body.at(-1)!;
    expect(JSON.stringify(added)).toContain('"value":"Hello"');
    // Every node in it has an id the program made, not the palette's or Blockly's.
    for (const id of JSON.stringify(added).match(/"id":"([^"]+)"/g)!) {
      const value = id.slice(6, -1);
      expect(value.startsWith('new')).toBe(false);
      expect(value).toMatch(new RegExp(NODE_ID_PATTERN));
    }
  });

  it('adds nothing when the learner presses Escape at a question', async () => {
    const say = newSay() as Statement;
    const outcome = await dropFromPalette(
      program,
      freshIn(program, blocksOf([...main.body, say]))[0]!,
      async () => null,
    );
    expect(outcome).toEqual({ kind: 'cancelled' });
  });

  it('keeps its empty values when there is no one to ask', async () => {
    const control = newControl('count', mint);
    const outcome = await dropFromPalette(
      program,
      freshIn(program, blocksOf([...main.body, control]))[0]!,
      null,
    );
    expect(outcome.kind === 'edits' && outcome.edits.map((e) => e.kind)).toEqual(['insert']);
  });

  it('is refused, in plain words, where the drop rule refuses it', async () => {
    // A block from the palette can't go into a value's place.
    const say = newSay() as Statement;
    const outcome = await dropFromPalette(
      program,
      { place: { kind: 'value', node: main.body[0]!.id, slot: 'args', param: 'text' }, node: say },
      null,
    );
    expect(outcome.kind).toBe('refused');
    expect(outcome.kind === 'refused' && outcome.reason).toMatch(/\w/);
  });
});
