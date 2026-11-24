import { applyEdits, nodeId, type ListenerDecl, type Program } from '@storystage/ast';
import { sampleProgram } from '@storystage/ast/testing';
import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defineBlocks } from './definitions.ts';
import { fromBlocks, toBlocks, type WorkspaceState } from './mapping.ts';

// Which keys a key listener is for (spec 02, section 6a; S6's #668): the list is a detail, shown
// as a click listener's objects are, and each key's ▾ offers only the keys its event is for.

beforeAll(() => defineBlocks());

const KEY = nodeId('keyone');
const HELD = nodeId('keybdy');

/** The sample with a scene listener for `event`, for the key `key`. */
function listening(event: string, key: string): { program: Program; listener: ListenerDecl } {
  const p = sampleProgram();
  const listener: ListenerDecl = {
    id: nodeId('keysl1'),
    kind: 'listener',
    event,
    args: {},
    details: {
      keys: {
        id: nodeId('keyset'),
        kind: 'arrayOf',
        of: { kind: 'story', name: 'Key' },
        items: [{ id: KEY, kind: 'enum', type: 'Key', value: key }],
      },
    },
    params: [],
    // A key in the body is any key: only the listener's own list is for its event (S6's review).
    body: [
      {
        id: nodeId('keyloc'),
        kind: 'local',
        name: 'held',
        type: { kind: 'story', name: 'Key' },
        value: { id: HELD, kind: 'enum', type: 'Key', value: 'w' },
      },
    ],
  };
  const program = applyEdits(p, [
    { kind: 'declare', parent: p.types[0]!.id, index: 0, node: listener, label: '' },
  ]);
  return { program, listener };
}

let ws: Blockly.Workspace | null = null;
afterEach(() => {
  ws?.dispose();
  ws = null;
});

/** The values the key's ▾ offers, once drawn in its listener. */
function offered(event: string, key: string, at = KEY): string[] {
  const { program, listener } = listening(event, key);
  ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(toBlocks(program, listener), ws);
  const field = ws.getBlockById(at)!.getField('VALUE') as Blockly.FieldDropdown;
  return field.getOptions(false).map((o) => (o as [string, string])[1]);
}

describe('a key listener’s keys in Blocks', () => {
  it('offers an arrow listener only the arrow keys', () => {
    expect(offered('arrowKeyPress', 'up').sort()).toEqual(['down', 'left', 'right', 'up']);
  });

  it('offers a number listener only the number keys', () => {
    const digits = offered('numberKeyPress', 'digit3');
    expect(digits).toHaveLength(10);
    expect(digits.every((k) => /^digit\d$/.test(k))).toBe(true);
  });

  it('offers a key in the listener’s body every key', () => {
    const keys = offered('arrowKeyPress', 'up', HELD);
    expect(keys).toContain('w');
    expect(keys).toContain('digit3');
  });

  it('offers a key listener every key', () => {
    const keys = offered('keyPress', 'w');
    expect(keys).toContain('w');
    expect(keys).toContain('up');
    expect(keys).toContain('digit3');
  });

  it('gives back the listener with its keys, through Blockly', () => {
    const { program, listener } = listening('arrowKeyPress', 'left');
    ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(toBlocks(program, listener), ws);
    const saved = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
    expect(fromBlocks(saved).details).toEqual(listener.details);
  });
});
