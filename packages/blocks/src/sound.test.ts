import { applyEdits, nodeId, type Expression, type Program, type Statement } from '@storystage/ast';
import { sampleProgram } from '@storystage/ast/testing';
import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defineBlocks } from './definitions.ts';
import { editsFor } from './gestures.ts';
import { fromBlocks, toBlocks, type WorkspaceState } from './mapping.ts';
import { SOUND } from './shapes.ts';
import { soundsFor } from './sounds.ts';

// A block's sound (decision 0076, workplan 7.17; spec 14, 3a): chosen from the film's sounds by
// label, written as its id, the text Story API section 8 has.

beforeAll(() => defineBlocks());

const PLAY = nodeId('playsd');
const VALUE = nodeId('soundv');

/** The sample with the cat playing `sound` first in its script. */
function withPlay(sound: string): Program {
  const p = sampleProgram();
  const main = p.types[0]!.methods.find((m) => m.name === 'myFirstMethod')!;
  const cat = p.types[0]!.fields.find((f) => f.name === 'cat')!;
  const play: Statement = {
    id: PLAY,
    kind: 'call',
    target: {
      id: nodeId('catply'),
      kind: 'fieldRef',
      target: { id: nodeId('thisply'), kind: 'this' },
      field: cat.id,
    },
    callee: { kind: 'story', name: 'playAudio' },
    args: { audioSource: { id: VALUE, kind: 'text', value: sound } as Expression },
    details: {},
  };
  return applyEdits(p, [
    { kind: 'insert', parent: main.id, slot: 'body', index: 0, label: '', node: play },
  ]);
}

const mainOf = (p: Program) => p.types[0]!.methods.find((m) => m.name === 'myFirstMethod')!;

const SOUNDS = [
  { value: 'sn1', words: 'Splash' },
  { value: 'sn2', words: 'Door' },
];
const STUDIO = {
  references: (type: string) => (type === 'Audio' ? SOUNDS : []),
  referenceWord: (type: string, value: string) =>
    type === 'Audio' ? SOUNDS.find((s) => s.value === value)?.words : undefined,
};

let ws: Blockly.Workspace | null = null;
afterEach(() => {
  ws?.dispose();
  ws = null;
});

/** The method loaded into a workspace that has the film's sounds. */
function loaded(p: Program, sounds = STUDIO): Blockly.Workspace {
  ws = new Blockly.Workspace();
  soundsFor(ws, sounds);
  Blockly.serialization.workspaces.load(toBlocks(p, mainOf(p)), ws);
  return ws;
}

describe('a block’s sound in Blocks (7.17)', () => {
  it('draws a play block’s sound as a sound chip, and reads it back as its text', () => {
    const p = withPlay('sn1');
    const state = toBlocks(p, mainOf(p));
    expect(JSON.stringify(state)).toContain(`"type":"${SOUND}"`);
    expect(fromBlocks(state).body).toEqual(mainOf(p).body);
  });

  it('shows the sound by its label, and offers the film’s sounds by theirs', () => {
    const field = loaded(withPlay('sn1')).getBlockById(VALUE)!.getField('VALUE')!;
    expect(field.getText()).toBe('Splash');
    expect((field as Blockly.FieldDropdown).getOptions(false)).toEqual([
      ['Splash', 'sn1'],
      ['Door', 'sn2'],
    ]);
  });

  it('keeps a sound the film no longer has, shown as it is written', () => {
    const p = withPlay('sn9');
    const space = loaded(p);
    expect(space.getBlockById(VALUE)!.getField('VALUE')!.getText()).toBe('sn9');
    const saved = Blockly.serialization.workspaces.save(space) as WorkspaceState;
    expect(fromBlocks(saved).body).toEqual(mainOf(p).body);
  });

  it('keeps the sound through a workspace without the film’s sounds', () => {
    const p = withPlay('sn1');
    ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(toBlocks(p, mainOf(p)), ws);
    const saved = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
    expect(fromBlocks(saved).body).toEqual(mainOf(p).body);
  });

  it('changes the sound as one step, named by the sounds’ labels', () => {
    const p = withPlay('sn1');
    const space = loaded(p);
    space.getBlockById(VALUE)!.getField('VALUE')!.setValue('sn2');
    const after = fromBlocks(Blockly.serialization.workspaces.save(space) as WorkspaceState);
    const result = editsFor(p, after, STUDIO);
    expect(result.kind).toBe('edits');
    if (result.kind !== 'edits') return;
    expect(result.edits).toHaveLength(1);
    expect(result.label).toContain('Door');
    expect(result.label).not.toMatch(/sn\d/);
    const played = mainOf(applyEdits(p, result.edits)).body[0] as Statement & { kind: 'call' };
    expect(played.args.audioSource).toMatchObject({ kind: 'text', value: 'sn2' });
  });
});
