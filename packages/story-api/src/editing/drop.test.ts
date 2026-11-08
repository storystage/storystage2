import { describe, expect, it } from 'vitest';
import { newCall, newControl } from './build.ts';
import { canDrop } from './drop.ts';
import { call, field, ID, mint, num, scene, text } from './testing.ts';

const program = scene();
const end = { kind: 'statement', parent: ID.main, slot: 'body', index: 2 } as const;
const amount = { kind: 'value', node: ID.move, slot: 'args', param: 'amount' } as const;

describe('statement places', () => {
  it('take a new block, as one insert with its label', () => {
    const result = canDrop(program, end, call(field(ID.cat), 'say', { text: text('Bye') }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]).toMatchObject({ kind: 'insert', parent: ID.main, index: 2 });
    expect(result.label).toBe('Make cat say Bye');
    expect(result.program.types[0]!.methods[0]!.body).toHaveLength(3);
  });

  it('take a new block from the palette, with its values still empty', () => {
    const block = newCall(program, field(ID.cat), { kind: 'story', name: 'move' }, false, mint);
    expect(canDrop(program, end, block).ok).toBe(true);
  });

  it('take a control tile', () => {
    expect(canDrop(program, end, newControl('count', mint))).toMatchObject({
      ok: true,
      label: 'Add count up to ???',
    });
  });

  it('refuse a value', () => {
    expect(canDrop(program, end, num(2))).toEqual({
      ok: false,
      reason: 'Only a block that does something can go here.',
    });
  });

  it('refuse a block the object doesn’t have', () => {
    const result = canDrop(
      program,
      end,
      call(field(ID.chair), 'walkTo', { target: field(ID.cat) }),
    );
    expect(result.ok).toBe(false);
  });

  it('move a statement already there, into another list', () => {
    const into = { kind: 'statement', parent: ID.together, slot: 'body', index: 0 } as const;
    const result = canDrop(program, into, { existing: ID.say });
    expect(result).toMatchObject({ ok: true, label: 'Move cat say Hello into do together' });
    if (result.ok) expect(result.edits[0]).toMatchObject({ kind: 'move', node: ID.say });
  });

  // A place counts the list as it's drawn, with the statement still in it; the AST's `move`
  // counts after it has left. `canDrop` turns one into the other (S5's review of #167).
  const order = (p: typeof program) => p.types[0]!.methods[0]!.body.map((s) => s.id);

  it('move a statement down its own list, to a place counted as the list is drawn', () => {
    // [say, together]: the end of the list is place 2, below together.
    const result = canDrop(program, end, { existing: ID.say });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edits[0]).toMatchObject({ kind: 'move', node: ID.say, index: 1 });
    expect(order(result.program)).toEqual([ID.together, ID.say]);
  });

  it('move a statement up its own list, where the counts agree', () => {
    const top = { kind: 'statement', parent: ID.main, slot: 'body', index: 0 } as const;
    const result = canDrop(program, top, { existing: ID.together });
    expect(result.ok).toBe(true);
    if (result.ok) expect(order(result.program)).toEqual([ID.together, ID.say]);
  });

  it('leave a statement where it is, above or below itself', () => {
    for (const index of [0, 1]) {
      const here = { kind: 'statement', parent: ID.main, slot: 'body', index } as const;
      const result = canDrop(program, here, { existing: ID.say });
      expect(result.ok).toBe(true);
      if (result.ok) expect(order(result.program)).toEqual([ID.say, ID.together]);
    }
  });

  it('refuse to put a block inside itself, with S2’s words', () => {
    const into = { kind: 'statement', parent: ID.together, slot: 'body', index: 0 } as const;
    expect(canDrop(program, into, { existing: ID.together })).toEqual({
      ok: false,
      reason: "A block can't go inside itself.",
    });
  });
});

describe('value places', () => {
  it('take a value that fits', () => {
    expect(canDrop(program, amount, num(2))).toMatchObject({
      ok: true,
      label: 'Change 1 to 2 in cat move',
    });
  });

  it('refuse a value that doesn’t fit, in plain words', () => {
    const result = canDrop(program, amount, text('far'));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain('amount');
  });

  it('refuse a block that does something', () => {
    expect(canDrop(program, amount, call(field(ID.cat), 'say'))).toMatchObject({ ok: false });
  });

  it('refuse to move a statement into a value', () => {
    expect(canDrop(program, amount, { existing: ID.say })).toMatchObject({ ok: false });
  });
});

describe('what’s wrong elsewhere', () => {
  it('never stops a drop that is fine in itself', () => {
    const broken = scene([], [call(field(ID.chair), 'walkTo', { target: field(ID.cat) })]);
    expect(canDrop(broken, end, call(field(ID.cat), 'say', { text: text('Hi') })).ok).toBe(true);
  });
});
