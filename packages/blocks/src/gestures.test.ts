import {
  applyEdits,
  type Expression,
  type MethodDecl,
  type NodeId,
  type Program,
  type Statement,
} from '@storystage/ast';
import { sampleProgram } from '@storystage/ast/testing';
import { TestHost } from '@storystage/editor-contract/testing';
import * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { defineBlocks } from './definitions.ts';
import { editsFor, type GestureEdits } from './gestures.ts';
import { fromBlocks, toBlocks, type FromBlocks, type WorkspaceState } from './mapping.ts';

beforeAll(() => defineBlocks());

const program = sampleProgram();
const main = program.types[0]!.methods.find((m) => m.name === 'myFirstMethod')!;
const ids = (list: readonly Statement[]) => list.map((s) => s.id);
const blocksOf = (body: readonly Statement[]): FromBlocks => ({
  owner: main.id,
  body,
  args: {},
  details: {},
});
const methodIn = (p: Program) => p.types[0]!.methods.find((m) => m.id === main.id)!;

/** The edits, applied to the program: the method they give. */
function applied(result: GestureEdits): MethodDecl {
  if (result.kind !== 'edits') throw new Error(`expected edits, got ${result.kind}`);
  return methodIn(applyEdits(program, result.edits));
}

describe('a gesture as edit operations (3i.8)', () => {
  it('has nothing to do when the blocks say what the program says', () => {
    expect(editsFor(program, blocksOf(main.body))).toEqual({ kind: 'none' });
  });

  it('moves a statement within a method, as one move', () => {
    const [say, together, ...rest] = main.body;
    const after = [together!, say!, ...rest];
    const result = editsFor(program, blocksOf(after));
    expect(result.kind === 'edits' && result.edits.map((e) => e.kind)).toEqual(['move']);
    expect(ids(applied(result).body)).toEqual(ids(after));
  });

  it('moves a statement into a do together, and out again', () => {
    const say = main.body[0]!;
    const together = main.body[1] as Extract<Statement, { kind: 'doTogether' }>;
    const inside = { ...together, body: [say, ...together.body] };
    const after = [inside, ...main.body.slice(2)];
    const into = editsFor(program, blocksOf(after));
    expect(into.kind === 'edits' && into.edits).toMatchObject([
      { kind: 'move', node: say.id, parent: together.id, slot: 'body', index: 0 },
    ]);
    expect(applied(into).body).toEqual(after);
    if (into.kind !== 'edits') return;
    const moved = applyEdits(program, into.edits);
    const out = editsFor(moved, blocksOf(main.body));
    expect(out.kind === 'edits' && methodIn(applyEdits(moved, out.edits)).body).toEqual(main.body);
  });

  it('takes out a deleted statement, with what is inside it', () => {
    const after = main.body.filter((s) => s.kind !== 'doTogether');
    const result = editsFor(program, blocksOf(after));
    expect(result.kind === 'edits' && result.edits.map((e) => e.kind)).toEqual(['remove']);
    expect(applied(result).body).toEqual(after);
  });

  it('changes a value in its slot, keeping its id', () => {
    const say = main.body[0] as Extract<Statement, { kind: 'call' }>;
    const text = say.args.text as Extract<Expression, { kind: 'text' }>;
    const after = [
      { ...say, args: { ...say.args, text: { ...text, value: 'Goodbye' } } },
      ...main.body.slice(1),
    ];
    const result = editsFor(program, blocksOf(after));
    expect(result.kind === 'edits' && result.edits).toMatchObject([
      { kind: 'setArgument', node: say.id, slot: 'args', param: 'text' },
    ]);
    expect(applied(result).body).toEqual(after);
  });

  it('switches a statement off, and changes a note’s words', () => {
    const after = main.body.map((s): Statement =>
      s.kind === 'call'
        ? { ...s, enabled: false }
        : s.kind === 'comment'
          ? { ...s, text: 'New words' }
          : s,
    );
    const result = editsFor(program, blocksOf(after));
    expect(result.kind === 'edits' && result.edits.map((e) => e.kind).sort()).toEqual([
      'setComment',
      'setEnabled',
    ]);
    expect(applied(result).body).toEqual(after);
  });

  it('puts in a new statement, from the palette', () => {
    const fresh: Statement = { id: 'newnote' as NodeId, kind: 'comment', text: 'Hi' };
    const after = [main.body[0]!, fresh, ...main.body.slice(1)];
    const result = editsFor(program, blocksOf(after));
    expect(result.kind === 'edits' && result.edits).toMatchObject([
      { kind: 'insert', parent: main.id, slot: 'body', index: 1 },
    ]);
    expect(applied(result).body).toEqual(after);
  });

  it('moves a statement to the end as one move, not one for each it passes', () => {
    const [first, ...rest] = main.body;
    const result = editsFor(program, blocksOf([...rest, first!]));
    expect(result.kind === 'edits' && result.edits.map((e) => e.kind)).toEqual(['move']);
  });

  it('puts the blocks back when the program would refuse them', () => {
    // A variable used before it is made.
    const local = main.body.findIndex((s) => s.kind === 'local');
    const after = [...main.body];
    const [variable] = after.splice(local, 1);
    after.push(variable!);
    expect(editsFor(program, blocksOf(after))).toEqual({ kind: 'putBack' });
  });

  it('puts the blocks back for a method the program doesn’t have', () => {
    expect(editsFor(program, { ...blocksOf(main.body), owner: 'nothere' as NodeId })).toEqual({
      kind: 'putBack',
    });
  });
});

describe('a gesture on a real workspace, through the host', () => {
  it('drags a statement into a do together, as one undo step', () => {
    const host = new TestHost(program, { apply: applyEdits });
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(toBlocks(program, main), ws);
    const say = ws.getBlockById(main.body[0]!.id)!;
    const together = ws.getBlockById(main.body[1]!.id)!;
    // Drag "say" out, with nothing after it, and drop it at the top of do together's body.
    say.unplug(true);
    together.getInput('BODY')!.connection!.connect(say.previousConnection!);
    const after = fromBlocks(Blockly.serialization.workspaces.save(ws) as WorkspaceState);
    ws.dispose();

    const result = editsFor(host.program(), after);
    expect(result.kind).toBe('edits');
    if (result.kind !== 'edits') return;
    expect(host.apply(result.edits, result.label, 'blocks')).toEqual({ ok: true });
    expect(host.undoLabel()).toBe(result.label);
    const body = methodIn(host.program()).body;
    expect(ids(body)[0]).toBe(main.body[1]!.id);
    expect(ids((body[0] as Extract<Statement, { kind: 'doTogether' }>).body)[0]).toBe(
      main.body[0]!.id,
    );
    host.undo();
    expect(methodIn(host.program()).body).toEqual(main.body);
  });
});
