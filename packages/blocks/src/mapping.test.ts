import type { ListenerDecl, MethodDecl, Program, Statement } from '@storystage/ast';
import { nodeId } from '@storystage/ast';
import { sampleProgram } from '@storystage/ast/testing';
import * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { defineBlocks } from './definitions.ts';
import {
  BlocksMismatch,
  SWITCHED_OFF,
  fromBlocks,
  toBlocks,
  type WorkspaceState,
} from './mapping.ts';

beforeAll(() => defineBlocks());

/** Every method and listener in a program. */
const owners = (p: Program): (MethodDecl | ListenerDecl)[] =>
  p.types.flatMap((t) => [...t.methods, ...t.listeners]);

/** Every node kind under a list of statements, to show the sample covers them all. */
function kinds(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) kinds(v, into);
  else if (value && typeof value === 'object') {
    const kind = (value as { kind?: unknown }).kind;
    if (typeof kind === 'string' && 'id' in value) into.add(kind);
    for (const v of Object.values(value)) kinds(v, into);
  }
  return into;
}

/** The workspace after Blockly has loaded it and saved it again. */
function throughBlockly(state: WorkspaceState): WorkspaceState {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, ws);
  const saved = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
  ws.dispose();
  return saved;
}

const expected = (o: MethodDecl | ListenerDecl) =>
  o.kind === 'listener'
    ? { owner: o.id, body: o.body, args: o.args, details: o.details }
    : { owner: o.id, body: o.body, args: {}, details: {} };

describe('a method as blocks and back (3i.8)', () => {
  const program = sampleProgram();

  it('uses a sample that holds every statement and expression kind', () => {
    const all = kinds(owners(program).map((o) => o.body));
    for (const kind of [
      'doInOrder',
      'doTogether',
      'count',
      'while',
      'forEach',
      'eachTogether',
      'if',
      'local',
      'assign',
      'comment',
      'call',
      'return',
    ])
      expect(all, kind).toContain(kind);
    for (const kind of [
      'number',
      'wholeNumber',
      'boolean',
      'text',
      'enum',
      'none',
      'this',
      'fieldRef',
      'variableRef',
      'functionCall',
      'arithmetic',
      'compare',
      'logic',
      'not',
      'join',
      'arrayOf',
      'arrayItem',
      'arrayLength',
    ])
      expect(all, kind).toContain(kind);
  });

  it('gives back exactly the same method, for every method and listener', () => {
    for (const owner of owners(program))
      expect(fromBlocks(toBlocks(program, owner))).toEqual(expected(owner));
  });

  it('gives back the same method after Blockly has loaded and saved the blocks', () => {
    for (const owner of owners(program)) {
      expect(fromBlocks(throughBlockly(toBlocks(program, owner)))).toEqual(expected(owner));
    }
  });

  it('shows a speak line’s script line as a fixed block, and keeps its id (spec 06, 4.1)', () => {
    const owner = owners(program).find(
      (o) => o.kind === 'method' && o.body.some((s) => s.kind === 'call'),
    )!;
    const at = owner.body.findIndex((s) => s.kind === 'call');
    const call = owner.body[at] as Statement & { kind: 'call' };
    const speak: Statement = {
      ...call,
      callee: { kind: 'story', name: 'speakLine' },
      args: { text: { id: nodeId('speakw'), kind: 'text', value: 'Here is the key.' } },
      details: { line: { id: nodeId('speakn'), kind: 'text', value: 'l7' } },
    };
    const body = owner.body.map((s, i) => (i === at ? speak : s));
    const withSpeak = { ...owner, body } as MethodDecl;
    const types = program.types.map((t) => ({
      ...t,
      methods: t.methods.map((m) => (m.id === owner.id ? withSpeak : m)),
    }));
    const state = toBlocks({ ...program, types }, withSpeak);
    const json = JSON.stringify(state);
    expect(json).toContain('"type":"ss_fromscript"');
    expect(json).toContain('"line":"l7"');
    expect(fromBlocks(state)).toEqual(expected(withSpeak));
    expect(fromBlocks(throughBlockly(state))).toEqual(expected(withSpeak));
  });

  it('gives each block its node’s id, and the method’s header can’t be deleted', () => {
    const owner = owners(program).find((o) => o.body.length > 0)!;
    const [header] = toBlocks(program, owner).blocks.blocks;
    expect(header!.id).toBe(owner.id);
    expect(header!.deletable).toBe(false);
    expect(header!.inputs!.BODY!.block!.id).toBe(owner.body[0]!.id);
  });

  it('keeps a switched-off statement switched off', () => {
    const owner = owners(program).find((o) => o.body.some((s) => s.kind === 'call'))!;
    const off = owner.body.map((s): Statement =>
      s.kind === 'call' ? { ...s, enabled: false } : s,
    );
    const changed = { ...owner, body: off } as typeof owner;
    const state = toBlocks(program, changed);
    expect(JSON.stringify(state)).toContain(SWITCHED_OFF);
    expect(fromBlocks(throughBlockly(state)).body).toEqual(off);
  });

  it('shows the names the program gives, without reading them back', () => {
    const owner = owners(program).find((o) => JSON.stringify(o.body).includes('variableRef'))!;
    const state = toBlocks(program, owner);
    const json = JSON.stringify(state);
    expect(json).toMatch(/"label":"[^"]+"/);
    const renamed = JSON.parse(
      json.replace(/"label":"[^"]*"/g, '"label":"anything"'),
    ) as WorkspaceState;
    expect(fromBlocks(renamed)).toEqual(expected(owner));
  });

  it('says so when the blocks and the program disagree', () => {
    expect(() => fromBlocks({ blocks: { languageVersion: 0, blocks: [] } })).toThrow(
      BlocksMismatch,
    );
  });
});
