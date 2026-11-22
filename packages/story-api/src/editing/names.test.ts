import { nodeId, type Statement } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { newAssign, newControl, newLocal } from './build.ts';
import { emptySlots } from './cascade.ts';
import { canDrop, type StatementPlace } from './drop.ts';
import { freshName, namesAt, readyFor } from './names.ts';
import { ID, mint, scene } from './testing.ts';

const story = (name: string) => ({ kind: 'story', name }) as const;
const inMain = (index: number): StatementPlace => ({
  kind: 'statement',
  parent: ID.main,
  slot: 'body',
  index,
});

/** myFirstMethod (say, do together) then `count` as a local (at 2) and a for-each loop (at 3). */
function withLoop() {
  const local: Statement = {
    id: nodeId('cntloc'),
    kind: 'local',
    name: 'count',
    type: story('WholeNumber'),
    value: { id: mint(), kind: 'wholeNumber', value: 0 },
  };
  const loop = { ...newControl('forEach', mint), id: nodeId('looopy') } as Statement & {
    kind: 'forEach';
  };
  return { program: scene([local, loop]), local, loop };
}

describe('namesAt (spec 14, 2.3)', () => {
  it('sees earlier locals, the loops around a place and the method’s parameters', () => {
    const { program, loop } = withLoop();
    expect(namesAt(program, inMain(3)).map((v) => v.name)).toEqual(['count']);
    const inside = namesAt(program, { kind: 'statement', parent: loop.id, slot: 'body', index: 0 });
    expect(inside.map((v) => [v.name, v.assignable])).toEqual([
      ['item', false],
      ['count', true],
    ]);
    // Not before the local, and nothing at a place that isn't one.
    expect(namesAt(program, inMain(2))).toEqual([]);
    expect(namesAt(program, { ...inMain(0), parent: nodeId('nowher') })).toEqual([]);
  });

  it('gives a method’s parameters, which may be changed', () => {
    const at: StatementPlace = { kind: 'statement', parent: ID.hop, slot: 'body', index: 0 };
    expect(namesAt(scene(), at)).toEqual([
      { id: ID.height, name: 'height', type: story('Number'), assignable: true },
    ]);
  });
});

describe('freshName', () => {
  it('numbers a name that’s taken', () => {
    expect(freshName('item', [])).toBe('item');
    expect(freshName('item', ['item'])).toBe('item2');
    expect(freshName('item', ['item', 'item2', 'item3'])).toBe('item4');
  });
});

describe('a loop inside a loop', () => {
  it('was refused for both items being called item, and now takes item2', () => {
    const { program, loop } = withLoop();
    const at: StatementPlace = { kind: 'statement', parent: loop.id, slot: 'body', index: 0 };
    const inner = newControl('forEach', mint);
    expect(canDrop(program, at, inner).ok).toBe(false);
    const ready = readyFor(program, at, inner) as typeof loop;
    expect(ready.item.name).toBe('item2');
    expect(canDrop(program, at, ready).ok).toBe(true);
    // Where nothing clashes, the block is left as it was.
    expect(readyFor(program, inMain(0), inner)).toBe(inner);
  });
});

describe('the variable and assign tiles', () => {
  it('make a variable that starts empty, and the cascade asks what it starts as', () => {
    const local = newLocal('steps', story('Number'), mint);
    expect(local).toMatchObject({ kind: 'local', name: 'steps', value: { kind: 'none' } });
    expect(emptySlots(local)).toEqual([{ kind: 'value', node: local.id, slot: 'value' }]);
    expect(canDrop(scene(), inMain(2), local).ok).toBe(true);
  });

  it('set a chosen variable, and the cascade asks for its value', () => {
    const { program, local } = withLoop();
    const assign = newAssign(local.id, mint);
    expect(assign).toMatchObject({
      kind: 'assign',
      target: { kind: 'variableRef', variable: local.id },
      value: { kind: 'none' },
    });
    expect(emptySlots(assign)).toEqual([{ kind: 'value', node: assign.id, slot: 'value' }]);
    expect(canDrop(program, inMain(3), assign).ok).toBe(true);
    // Not before the variable exists.
    expect(canDrop(program, inMain(2), assign).ok).toBe(false);
  });
});
