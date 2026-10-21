import { describe, expect, it } from 'vitest';
import { canDrop, drop, setArguments, toText, type Program } from './model.ts';

const empty: Program = { body: [] };

function sample() {
  let p = empty;
  let r = drop(p, { from: 'palette', tile: 'doTogether' }, { kind: 'gap', parent: null, index: 0 });
  const together = r.id;
  p = r.program;
  r = drop(p, { from: 'palette', tile: 'doInOrder' }, { kind: 'gap', parent: together, index: 0 });
  const inOrder = r.id;
  p = r.program;
  r = drop(p, { from: 'palette', tile: 'move' }, { kind: 'gap', parent: inOrder, index: 0 });
  const move = r.id;
  p = setArguments(r.program, move, { target: 'cat', direction: 'forward', amount: 1 });
  return { p, together, inOrder, move };
}

describe('drop rules', () => {
  it('builds a typed move inside a nested do together', () => {
    expect(toText(sample().p.body)).toBe('do together:\n  do in order:\n    cat.move(forward, 1)');
  });

  it('refuses a number in the object slot, and an object in the amount slot', () => {
    const { p, move } = sample();
    expect(
      canDrop(
        p,
        { from: 'palette', tile: 'number', value: 2 },
        { kind: 'slot', statement: move, slot: 'target' },
      ),
    ).toBe(false);
    expect(
      canDrop(
        p,
        { from: 'palette', tile: 'object', name: 'dog' },
        { kind: 'slot', statement: move, slot: 'amount' },
      ),
    ).toBe(false);
    expect(
      canDrop(
        p,
        { from: 'palette', tile: 'object', name: 'dog' },
        { kind: 'slot', statement: move, slot: 'target' },
      ),
    ).toBe(true);
  });

  it('refuses a value where a statement goes, and a block inside itself', () => {
    const { p, together, inOrder } = sample();
    expect(
      canDrop(
        p,
        { from: 'palette', tile: 'object', name: 'cat' },
        { kind: 'gap', parent: null, index: 0 },
      ),
    ).toBe(false);
    expect(
      canDrop(p, { from: 'program', id: together }, { kind: 'gap', parent: inOrder, index: 0 }),
    ).toBe(false);
    expect(
      canDrop(p, { from: 'program', id: together }, { kind: 'gap', parent: together, index: 0 }),
    ).toBe(false);
  });

  it('refuses statements inside a move', () => {
    const { p, move } = sample();
    expect(
      canDrop(p, { from: 'palette', tile: 'move' }, { kind: 'gap', parent: move, index: 0 }),
    ).toBe(false);
  });

  it('throws if a refused drop is forced', () => {
    const { p, move } = sample();
    expect(() =>
      drop(
        p,
        { from: 'palette', tile: 'number', value: 1 },
        { kind: 'slot', statement: move, slot: 'target' },
      ),
    ).toThrow();
  });

  it('moves a statement down within its list', () => {
    let p = empty;
    for (const target of ['cat', 'dog']) {
      const r = drop(
        p,
        { from: 'palette', tile: 'move' },
        { kind: 'gap', parent: null, index: p.body.length },
      );
      p = setArguments(r.program, r.id, { target, direction: 'up', amount: 1 });
    }
    const cat = p.body[0]!.id;
    p = drop(p, { from: 'program', id: cat }, { kind: 'gap', parent: null, index: 2 }).program;
    expect(toText(p.body)).toBe('dog.move(up, 1)\ncat.move(up, 1)');
  });

  it('never changes the program it is given', () => {
    const { p, move } = sample();
    const before = JSON.stringify(p);
    drop(
      p,
      { from: 'palette', tile: 'object', name: 'dog' },
      { kind: 'slot', statement: move, slot: 'target' },
    );
    expect(JSON.stringify(p)).toBe(before);
  });
});
