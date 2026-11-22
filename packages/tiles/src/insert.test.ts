import { idMinter, nodeId, type Statement } from '@storystage/ast';
import { newControl } from '@storystage/story-api/editing';
import { describe, expect, it } from 'vitest';
import { fixture, IDS } from './fixture.ts';
import { beginInsert, isPending } from './insert.ts';
import { place } from './places.ts';

describe('a loop put inside a loop (spec 14, 2.3)', () => {
  it('takes an item name of its own, so it isn’t refused', () => {
    const base = fixture();
    const outer = { ...newControl('forEach', idMinter(base)), id: nodeId('outerl') } as Statement;
    const main = base.types[0]!.methods[0]!;
    const program = {
      ...base,
      types: [{ ...base.types[0]!, methods: [{ ...main, body: [...main.body, outer] }] }],
    };
    const inner = newControl('forEach', idMinter(program));
    const started = beginInsert(program, place(outer.id, 'body', 0), inner);
    expect(isPending(started)).toBe(true);
    if (isPending(started)) expect(started.node).toMatchObject({ item: { name: 'item2' } });
    // Beside it, not inside, the name is free, and stays as it was.
    const beside = beginInsert(program, place(IDS.main, 'body', 0), inner);
    if (isPending(beside)) expect(beside.node).toMatchObject({ item: { name: 'item' } });
  });
});
