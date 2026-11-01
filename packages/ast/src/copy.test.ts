import { describe, expect, it } from 'vitest';
import { idMinter } from './build.ts';
import { copyNode } from './copy.ts';
import { nodeId } from './ids.ts';
import type { MethodDecl, Statement, TypeDecl } from './nodes.ts';
import { ids, sampleProgram } from './testing.ts';
import { validateProgram } from './validate.ts';
import { indexProgram, walk } from './walk.ts';

const sample = sampleProgram();
const scene = sample.types[0]!;
const mint = () => idMinter(sample);
const statementAt = (id: typeof ids.say) => indexProgram(sample).get(id)!.node as Statement;

describe('copyNode', () => {
  it('gives every node a new id and records where it came from', () => {
    const original = statementAt(ids.together);
    const copy = copyNode(original, mint());
    const before: string[] = [];
    const after: { id: string; from?: string }[] = [];
    walk(original, (n) => before.push(n.id));
    walk(copy, (n) => after.push({ id: n.id, ...(n.copiedFrom ? { from: n.copiedFrom } : {}) }));
    expect(after.map((a) => a.from)).toEqual(before);
    for (const { id } of after) expect(before).not.toContain(id);
  });

  it('records the nearest source, not the first', () => {
    const copy = copyNode(statementAt(ids.say), mint());
    expect(copyNode(copy, mint()).copiedFrom).toBe(copy.id);
  });

  it('leaves the original alone', () => {
    const before = JSON.stringify(sample);
    copyNode(statementAt(ids.together), mint());
    expect(JSON.stringify(sample)).toBe(before);
  });

  it('points references inside the copy at the copy', () => {
    const block: Statement = {
      id: nodeId('blocka'),
      kind: 'doInOrder',
      body: [
        {
          id: nodeId('locala'),
          kind: 'local',
          name: 'a',
          type: { kind: 'story', name: 'Number' },
          value: { id: nodeId('valuea'), kind: 'number', value: 1 },
        },
        {
          id: nodeId('assign'),
          kind: 'assign',
          target: { id: nodeId('refera'), kind: 'variableRef', variable: nodeId('locala') },
          value: { id: nodeId('valueb'), kind: 'number', value: 2 },
        },
      ],
    };
    const copy = copyNode(block, mint()) as typeof block;
    const [local, assign] = copy.body as [Statement, Statement & { kind: 'assign' }];
    expect((assign.target as { variable: string }).variable).toBe(local.id);
  });

  it('leaves references to things outside the copy as they were', () => {
    const copy = copyNode(statementAt(ids.say), mint()) as Statement & { kind: 'call' };
    expect(copy.target).toMatchObject({ kind: 'fieldRef', field: ids.cat });
  });

  it('keeps a copied method calling itself, and its arguments keyed to its own parameters', () => {
    const method: MethodDecl = {
      id: nodeId('recurs'),
      kind: 'method',
      name: 'again',
      returns: null,
      params: [
        {
          id: nodeId('paramb'),
          kind: 'parameter',
          name: 'b',
          type: { kind: 'story', name: 'Number' },
          default: null,
        },
      ],
      body: [
        {
          id: nodeId('callme'),
          kind: 'call',
          target: { id: nodeId('thisth'), kind: 'this' },
          callee: { kind: 'user', method: nodeId('recurs') },
          args: { paramb: { id: nodeId('valuec'), kind: 'number', value: 1 } },
          details: {},
        },
      ],
    };
    const copy = copyNode(method, mint());
    const call = copy.body[0] as Statement & { kind: 'call' };
    expect(call.callee).toEqual({ kind: 'user', method: copy.id });
    expect(Object.keys(call.args)).toEqual([copy.params[0]!.id]);
  });

  it('keeps a call to an outside method keyed to that method’s parameters', () => {
    const copy = copyNode(statementAt(ids.callHop), mint()) as Statement & { kind: 'call' };
    expect(copy.callee).toEqual({ kind: 'user', method: ids.hop });
    expect(Object.keys(copy.args)).toEqual([ids.height]);
  });

  it('follows type references inside a copied type', () => {
    const own: TypeDecl = {
      id: nodeId('owntyp'),
      kind: 'type',
      name: 'Own',
      extends: { kind: 'story', name: 'Prop' },
      fields: [
        {
          id: nodeId('selfff'),
          kind: 'field',
          name: 'other',
          type: { kind: 'array', of: { kind: 'user', type: nodeId('owntyp') } },
          initial: null,
        },
      ],
      methods: [],
      listeners: [],
    };
    const copy = copyNode(own, mint());
    expect(copy.fields[0]!.type).toEqual({ kind: 'array', of: { kind: 'user', type: copy.id } });
  });

  it('makes a program that passes validation with the copy added', () => {
    const copy = { ...copyNode(scene, mint()), name: 'Scene2' };
    expect(validateProgram({ ...sample, types: [scene, copy] })).toEqual([]);
  });
});
