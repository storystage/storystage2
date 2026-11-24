import {
  applyEdits,
  nodeId,
  type Expression,
  type ListenerDecl,
  type Program,
} from '@storystage/ast';
import { sampleProgram } from '@storystage/ast/testing';
import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defineBlocks, shapeOf } from './definitions.ts';
import { addItemAsk, takeOutItem } from './listItems.ts';
import { fromBlocks, toBlocks, type WorkspaceState } from './mapping.ts';
import { LISTENER, nodeType } from './shapes.ts';

// A listener's keys or objects, one at a time (the owner, 24 Nov 2026; spec 14, 2.3 item 5):
// the listener reads with its own phrase ("when W or up arrow is pressed"), "or ▾" after the last
// adds another, and each item's menu takes it out.

beforeAll(() => defineBlocks());

const LIST = nodeId('keyset');
const W = nodeId('keyw01');
const UP = nodeId('keyup1');
const key = (id: string, value: string): Expression =>
  ({ id: nodeId(id), kind: 'enum', type: 'Key', value }) as Expression;

/** The sample with a scene listener for `event`, its keys `items`. */
function listening(
  event: string,
  items: Expression[],
): { program: Program; listener: ListenerDecl } {
  const p = sampleProgram();
  const listener: ListenerDecl = {
    id: nodeId('keysl1'),
    kind: 'listener',
    event,
    args: {},
    details: { keys: { id: LIST, kind: 'arrayOf', of: { kind: 'story', name: 'Key' }, items } },
    params: [],
    body: [],
  };
  const program = applyEdits(p, [
    { kind: 'declare', parent: p.types[0]!.id, index: 0, node: listener, label: '' },
  ]);
  return { program, listener };
}

const words = (parts: readonly { kind: string; text?: string; input?: string }[]) =>
  parts.map((p) => (p.kind === 'words' ? p.text : p.kind === 'value' ? `[${p.input}]` : p.kind));

let ws: Blockly.Workspace | null = null;
afterEach(() => {
  ws?.dispose();
  ws = null;
});

describe('a listener’s keys in Blocks, one at a time', () => {
  it('reads with the listener’s own phrase, its keys joined by “or”', () => {
    const { program, listener } = listening('keyPress', [key('keyw01', 'w'), key('keyup1', 'up')]);
    const state = toBlocks(program, listener);
    const header = state.blocks.blocks[0]!;
    expect(words(shapeOf(LISTENER, header.extraState).parts)).toEqual([
      'when',
      '[DETAIL_keys]',
      'is pressed',
      'statements',
    ]);
    const list = header.inputs!['DETAIL_keys']!.block!;
    expect(words(shapeOf(nodeType('arrayOf'), list.extraState).parts)).toEqual([
      '[ITEM_0]',
      'or',
      '[ITEM_1]',
    ]);
    expect(fromBlocks(state).details).toEqual(listener.details);
  });

  it('keeps the listener and its keys through Blockly', () => {
    const { program, listener } = listening('keyPress', [key('keyw01', 'w'), key('keyup1', 'up')]);
    ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(toBlocks(program, listener), ws);
    const saved = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
    expect(fromBlocks(saved).details).toEqual(listener.details);
  });

  it('reads an empty list as the event, with “which keys” after it', () => {
    const { program, listener } = listening('arrowKeyPress', []);
    const header = toBlocks(program, listener).blocks.blocks[0]!;
    expect(words(shapeOf(LISTENER, header.extraState).parts)).toEqual([
      'when an arrow key is pressed',
      'which keys',
      '[DETAIL_keys]',
      'statements',
    ]);
  });

  it('asks for another key past the last, named for the detail', () => {
    const { program } = listening('keyPress', [key('keyw01', 'w')]);
    expect(addItemAsk(program, LIST)).toEqual({
      place: { kind: 'value', node: LIST, slot: 'items', param: '1' },
      label: 'which keys',
    });
    expect(addItemAsk(program, W)).toBeNull();
  });

  it('takes a key out as one step, named for it, and the last one with its detail', () => {
    const { program } = listening('keyPress', [key('keyw01', 'w'), key('keyup1', 'up')]);
    const out = takeOutItem(program, UP)!;
    expect(out.words).toBe('Take up arrow out');
    expect(out.change.ok).toBe(true);
    if (!out.change.ok) return;
    const after = applyEdits(program, out.change.edits);
    const held = after.types[0]!.listeners.find((l) => l.id === nodeId('keysl1'))!;
    expect(held.details.keys).toMatchObject({ items: [{ value: 'w' }] });
    const last = takeOutItem(after, W)!;
    expect(last.change.ok).toBe(true);
    if (!last.change.ok) return;
    const none = applyEdits(after, last.change.edits).types[0]!.listeners.find(
      (l) => l.id === nodeId('keysl1'),
    )!;
    expect(none.details.keys).toBeUndefined();
  });

  it('offers no “take out” for a value that isn’t a listener’s key or object', () => {
    const { program } = listening('keyPress', [key('keyw01', 'w')]);
    expect(takeOutItem(program, LIST)).toBeNull();
  });
});
