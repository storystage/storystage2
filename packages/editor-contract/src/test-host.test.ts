import {
  applyEdits,
  EditSession,
  nodeId,
  type EditOperation,
  type MethodDecl,
} from '@storystage/ast';
import { ids, sampleProgram } from '@storystage/ast/testing';
import { describe, expect, it } from 'vitest';
import type { ChangeSource, EditorHost } from './contract.ts';
import { TestHost } from './test-host.ts';

const start = sampleProgram();
const add = (id: string): EditOperation => ({
  kind: 'insert',
  label: 'Add comment',
  parent: ids.hop,
  slot: 'body',
  index: 0,
  node: { id: nodeId(id), kind: 'comment', text: 'hi' },
});
const refused: EditOperation = { kind: 'remove', label: 'x', node: nodeId('nosuch') };
const apply = applyEdits;
const count = (h: TestHost) => (h.program().types[0]!.methods[1] as MethodDecl).body.length;

describe('TestHost', () => {
  it('applies a group of edits as one undo step, with its label', () => {
    const host = new TestHost(start, { apply });
    expect(host.apply([add('addaaa'), add('addbbb')], 'Add two cats', 'tiles')).toEqual({
      ok: true,
    });
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
    expect(host.apply([add('addaaa'), refused], 'Add', 'blocks')).toEqual({
      ok: false,
      reason: "That block isn't there any more.",
    });
    expect(count(host)).toBe(0);
    expect(host.undoLabel()).toBeNull();
  });

  it('tells every subscriber about every change and where it came from', () => {
    const host = new TestHost(start, { apply });
    const sources: string[] = [];
    const stop = host.subscribe((c) => sources.push(c.source));
    host.apply([add('addaaa')], 'Add cat', 'blocks');
    host.undo();
    host.redo();
    host.external({ ...start }, 'Open production', 'load');
    stop();
    host.apply([add('addbbb')], 'Add cat', 'tiles');
    expect(sources).toEqual(['blocks', 'undo', 'redo', 'load']);
  });

  it('starts a fresh redo list after a new edit', () => {
    const host = new TestHost(start, { apply });
    host.apply([add('addaaa')], 'Add cat', 'blocks');
    host.undo();
    host.apply([add('addaaa')], 'Add dog', 'tiles');
    expect(host.redoLabel()).toBeNull();
  });

  it('collects announcements and carries the lock policy', () => {
    const host = new TestHost(start, { editorLocked: true });
    host.announce('Added cat');
    expect(host.announcements).toEqual(['Added cat']);
    expect(host.policy.editorLocked).toBe(true);
  });
});

describe("the studio's EditSession", () => {
  it('has everything of EditorHost but announce and policy, which the studio adds', () => {
    const session: Omit<EditorHost, 'announce' | 'policy'> = new EditSession<ChangeSource>(start);
    const sources: string[] = [];
    session.subscribe((c) => sources.push(c.source));
    expect(session.apply([add('addaaa')], 'Add', 'tiles')).toEqual({ ok: true });
    session.undo();
    expect(sources).toEqual(['tiles', 'undo']);
    expect(session.program()).toEqual(start);
  });
});
