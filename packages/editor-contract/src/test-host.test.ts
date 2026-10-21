import type { EditOperation, Program } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { TestHost } from './test-host.ts';

/** A stand-in program and edit until WP2: the program counts the edits applied to it. */
type Counted = Program & { readonly count: number };
const start: Counted = { schemaVersion: '1.0.0', count: 0 };
const add: EditOperation = { kind: 'insert', label: 'Add cat' };
const apply = (p: Program, edits: readonly EditOperation[]): Program => {
  if (edits.some((e) => e.kind === 'bad')) throw new Error("That block can't go there.");
  return { ...p, count: (p as Counted).count + edits.length } as Counted;
};
const count = (h: TestHost) => (h.program() as Counted).count;

describe('TestHost', () => {
  it('applies a group of edits as one undo step, with its label', () => {
    const host = new TestHost(start, { apply });
    expect(host.apply([add, add], 'Add two cats', 'tiles')).toEqual({ ok: true });
    expect(count(host)).toBe(2);
    expect(host.undoLabel()).toBe('Add two cats');
    host.undo();
    expect(count(host)).toBe(0);
    expect(host.redoLabel()).toBe('Add two cats');
    host.redo();
    expect(count(host)).toBe(2);
  });

  it('refuses the whole step if an edit is refused, in plain words', () => {
    const host = new TestHost(start, { apply });
    expect(host.apply([add, { kind: 'bad', label: 'x' }], 'Add', 'blocks')).toEqual({
      ok: false,
      reason: "That block can't go there.",
    });
    expect(count(host)).toBe(0);
    expect(host.undoLabel()).toBeNull();
  });

  it('tells every subscriber about every change and where it came from', () => {
    const host = new TestHost(start, { apply });
    const sources: string[] = [];
    const stop = host.subscribe((c) => sources.push(c.source));
    host.apply([add], 'Add cat', 'blocks');
    host.undo();
    host.redo();
    host.external({ ...start }, 'Open production', 'load');
    stop();
    host.apply([add], 'Add cat', 'tiles');
    expect(sources).toEqual(['blocks', 'undo', 'redo', 'load']);
  });

  it('starts a fresh redo list after a new edit', () => {
    const host = new TestHost(start, { apply });
    host.apply([add], 'Add cat', 'blocks');
    host.undo();
    host.apply([add], 'Add dog', 'tiles');
    expect(host.redoLabel()).toBeNull();
  });

  it('collects announcements and carries the lock policy', () => {
    const host = new TestHost(start, { editorLocked: true });
    host.announce('Added cat');
    expect(host.announcements).toEqual(['Added cat']);
    expect(host.policy.editorLocked).toBe(true);
  });
});
