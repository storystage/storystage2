import { applyAll, indexProgram, type NodeId, type Program, type Statement } from '@storystage/ast';
import { ids, sampleProgram } from '@storystage/ast/testing';
import { describe, expect, it } from 'vitest';
import { changeFor, menuFor, type MenuAction, type MenuChange } from './blockMenu.ts';

const program = sampleProgram();
const at = (p: Program, id: NodeId) => indexProgram(p).get(id)?.node as Statement | undefined;
const words = (id: NodeId) => menuFor(program, id).map((i) => i.words);

function applied(change: MenuChange): Program {
  if (!change.ok) throw new Error(change.reason);
  return applyAll(program, change.edits).program;
}

describe("a block's menu (14-editors 3i.7, 2.3)", () => {
  it('offers a statement switch off, its details, duplicate and delete, in that order', () => {
    const move = words(ids.move);
    expect(move[0]).toBe('Switch off');
    expect(move).toContain('Take out how long');
    expect(move).not.toContain('Add detail: how long');
    expect(move.some((w) => w.startsWith('Add detail: '))).toBe(true);
    expect(move.slice(-2)).toEqual(['Duplicate', 'Delete']);
    expect(words(ids.turn)[0]).toBe('Switch on');
  });

  it('offers no switch, duplicate or delete for a method’s own block or a value', () => {
    expect(words(ids.main)).toEqual([]);
    const local = at(program, ids.local) as Extract<Statement, { kind: 'local' }>;
    expect(words(local.value.id).every((w) => w.startsWith('Add detail: '))).toBe(true);
  });

  it('switches a statement off and on, as one step named for it', () => {
    const off = changeFor(program, ids.move, { kind: 'switch' });
    expect(off.ok && off.label).toMatch(/^Switch off cat move/u);
    expect(at(applied(off), ids.move)?.enabled).toBe(false);
    const on = changeFor(program, ids.turn, { kind: 'switch' });
    expect(on.ok && on.label).toMatch(/^Switch on cat turn/u);
    expect(at(applied(on), ids.turn)?.enabled ?? true).toBe(true);
  });

  it('adds a detail with the value the cascade gave, and takes one out', () => {
    const say = at(program, ids.say)!;
    const detail = menuFor(program, ids.say).find((i) => i.action.kind === 'addDetail')!;
    const action = detail.action as Extract<MenuAction, { kind: 'addDetail' }>;
    expect(changeFor(program, ids.say, action).ok).toBe(false);
    const value = { id: 'menuv1' as NodeId, kind: 'number', value: 3 } as const;
    const added = changeFor(program, ids.say, action, value);
    expect(added.ok && added.label).toMatch(/^Add /u);
    const after = at(applied(added), say.id) as Extract<Statement, { kind: 'call' }>;
    expect(after.details[action.detail]).toMatchObject({ value: 3 });

    const out = changeFor(program, ids.move, { kind: 'removeDetail', detail: 'duration' });
    expect(out.ok && out.label).toBe('Take how long out of cat move');
    const moved = at(applied(out), ids.move) as Extract<Statement, { kind: 'call' }>;
    expect(moved.details).toEqual({});
  });

  it('moves a statement one place up or down in its list, offered only where it can go', () => {
    expect(words(ids.say)).not.toContain('Move up');
    expect(words(ids.say)).toContain('Move down');
    const down = changeFor(program, ids.say, { kind: 'moveDown' });
    expect(down.ok && down.label).toMatch(/^Move cat say/u);
    const body = applied(down).types[0]!.methods.find((m) => m.id === ids.main)!.body;
    expect(body[1]!.id).toBe(ids.say);
    expect(changeFor(program, ids.say, { kind: 'moveUp' })).toEqual({
      ok: false,
      reason: 'It’s already at the top.',
    });
  });

  it('duplicates a statement just after itself, and deletes one', () => {
    const dup = changeFor(program, ids.say, { kind: 'duplicate' });
    const body = (p: Program) => p.types[0]!.methods.find((m) => m.id === ids.main)!.body;
    const after = body(applied(dup));
    expect(after).toHaveLength(body(program).length + 1);
    expect(after[1]).toMatchObject({ kind: 'call', copiedFrom: ids.say });
    expect(after[1]!.id).not.toBe(ids.say);

    const gone = changeFor(program, ids.say, { kind: 'delete' });
    expect(gone.ok && gone.label).toMatch(/^Delete cat say/u);
    expect(at(applied(gone), ids.say)).toBeUndefined();
  });

  it('refuses, in plain words, for a block that has gone', () => {
    const missing = changeFor(program, 'gone' as NodeId, { kind: 'switch' });
    expect(missing).toEqual({ ok: false, reason: 'That block isn’t there any more.' });
  });
});
