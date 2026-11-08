import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { type EditOperation } from './edits.ts';
import { nodeId } from './ids.ts';
import type { Statement } from './nodes.ts';
import { serializeProgram } from './serialize.ts';
import { EditSession, type SessionChange } from './session.ts';
import { ids, sampleProgram } from './testing.ts';

vi.setConfig({ testTimeout: 120_000 });

type Source = 'blocks' | 'tiles' | 'prompter';
const session = () => new EditSession<Source>(sampleProgram());

const rename = (name: string): EditOperation => ({
  kind: 'rename',
  label: `Rename to ${name}`,
  node: ids.cat,
  name,
});
const add = (id: string): EditOperation => ({
  kind: 'insert',
  label: 'Add comment',
  parent: ids.hop,
  slot: 'body',
  index: 0,
  node: { id: nodeId(id), kind: 'comment', text: 'hi' } as Statement,
});
const bad: EditOperation = { kind: 'remove', label: 'Remove', node: nodeId('nosuch') };
const catName = (s: EditSession<Source>) => s.program().types[0]!.fields[1]!.name;
const bytes = (s: EditSession<Source>) => serializeProgram(s.program());

describe('apply', () => {
  it('makes one undo step, however many edits', () => {
    const s = session();
    expect(s.apply([rename('tom'), add('newone')], 'Rename and add', 'blocks')).toEqual({
      ok: true,
    });
    expect(s.undoLabel()).toBe('Rename and add');
    s.undo();
    expect(catName(s)).toBe('cat');
    expect(s.undoLabel()).toBeNull();
  });

  it('is all or nothing, and gives the reason in plain words', () => {
    const s = session();
    const before = bytes(s);
    expect(s.apply([rename('tom'), bad], 'Step', 'blocks')).toEqual({
      ok: false,
      reason: "That block isn't there any more.",
    });
    expect(bytes(s)).toBe(before);
    expect(s.undoLabel()).toBeNull();
  });

  it('leaves no trace with no edits', () => {
    const s = session();
    const heard: unknown[] = [];
    s.subscribe((c) => heard.push(c));
    expect(s.apply([], 'Nothing', 'blocks')).toEqual({ ok: true });
    expect(heard).toEqual([]);
    expect(s.history()).toEqual([]);
  });

  it('clears the redo list', () => {
    const s = session();
    s.apply([rename('tom')], 'One', 'blocks');
    s.undo();
    expect(s.redoLabel()).toBe('One');
    s.apply([rename('tim')], 'Two', 'blocks');
    expect(s.redoLabel()).toBeNull();
  });

  it('runs a check from outside', () => {
    const s = new EditSession<Source>(sampleProgram(), {
      check: (p) =>
        p.types[0]!.fields[1]!.name === 'bad'
          ? [{ code: 'outside', message: 'no', node: ids.cat, reason: 'Not that name.' }]
          : [],
    });
    expect(s.apply([rename('bad')], 'Rename', 'blocks')).toEqual({
      ok: false,
      reason: 'Not that name.',
    });
    expect(s.apply([rename('good')], 'Rename', 'blocks')).toEqual({ ok: true });
  });
});

describe('undo and redo', () => {
  it('go back and forward through the steps, with labels', () => {
    const s = session();
    s.apply([rename('one')], 'First', 'blocks');
    s.apply([rename('two')], 'Second', 'tiles');
    expect(s.undoLabel()).toBe('Second');
    s.undo();
    expect(catName(s)).toBe('one');
    expect(s.undoLabel()).toBe('First');
    expect(s.redoLabel()).toBe('Second');
    s.redo();
    expect(catName(s)).toBe('two');
    expect(s.redoLabel()).toBeNull();
  });

  it('do nothing with nothing to do', () => {
    const s = session();
    const heard: unknown[] = [];
    s.subscribe((c) => heard.push(c));
    s.undo();
    s.redo();
    expect(heard).toEqual([]);
  });

  it('bring the program back byte for byte, over a step with many edits', () => {
    const s = session();
    const before = bytes(s);
    s.apply(
      [
        add('newone'),
        add('newtwo'),
        { kind: 'remove', label: 'Remove', node: ids.say },
        rename('tom'),
      ],
      'Many',
      'prompter',
    );
    const after = bytes(s);
    s.undo();
    expect(bytes(s)).toBe(before);
    s.redo();
    expect(bytes(s)).toBe(after);
  });
});

describe('grouping', () => {
  it('makes a whole Prompter request one undo step', () => {
    const s = session();
    const before = bytes(s);
    s.begin('Build it: make the cat dance', 'prompter');
    s.apply([rename('tom')], 'ignored', 'prompter');
    s.apply([add('newone')], 'ignored', 'prompter');
    s.commit();
    expect(s.history()).toHaveLength(1);
    expect(s.undoLabel()).toBe('Build it: make the cat dance');
    s.undo();
    expect(bytes(s)).toBe(before);
  });

  it('shows each change as it happens', () => {
    const s = session();
    const labels: string[] = [];
    s.subscribe((c) => labels.push(c.label));
    s.begin('Request', 'prompter');
    s.apply([rename('tom')], 'ignored', 'prompter');
    expect(catName(s)).toBe('tom');
    s.apply([add('newone')], 'ignored', 'prompter');
    s.commit();
    expect(labels).toEqual(['Request', 'Request']);
  });

  it('keeps what was done when one edit in it is refused', () => {
    const s = session();
    s.begin('Request', 'prompter');
    s.apply([rename('tom')], 'x', 'prompter');
    expect(s.apply([bad], 'x', 'prompter').ok).toBe(false);
    s.commit();
    expect(catName(s)).toBe('tom');
    s.undo();
    expect(catName(s)).toBe('cat');
  });

  it('cancel takes it all back and leaves no trace', () => {
    const s = session();
    const before = bytes(s);
    s.begin('Request', 'prompter');
    s.apply([rename('tom')], 'x', 'prompter');
    s.apply([add('newone')], 'x', 'prompter');
    s.cancel();
    expect(bytes(s)).toBe(before);
    expect(s.history()).toEqual([]);
    expect(s.undoLabel()).toBeNull();
  });

  it('with nothing done leaves no trace', () => {
    const s = session();
    s.begin('Request', 'prompter');
    s.commit();
    expect(s.history()).toEqual([]);
  });

  it('stops undo and redo while open', () => {
    const s = session();
    s.apply([rename('one')], 'First', 'blocks');
    s.begin('Request', 'prompter');
    s.apply([rename('two')], 'x', 'prompter');
    s.undo();
    s.redo();
    expect(catName(s)).toBe('two');
    s.commit();
    expect(s.undoLabel()).toBe('Request');
  });

  it('refuses a second group, and a commit or cancel with none open', () => {
    const s = session();
    s.begin('Request', 'prompter');
    expect(() => s.begin('Another', 'prompter')).toThrow();
    s.commit();
    expect(() => s.commit()).toThrow();
    expect(() => s.cancel()).toThrow();
  });

  it('clears the redo list as a plain step does', () => {
    const s = session();
    s.apply([rename('one')], 'First', 'blocks');
    s.undo();
    s.begin('Request', 'prompter');
    s.apply([rename('two')], 'x', 'prompter');
    s.commit();
    expect(s.redoLabel()).toBeNull();
  });
});

describe('history', () => {
  it('lists every step, oldest first, with its label, source and state', () => {
    const s = session();
    s.apply([rename('one')], 'First', 'blocks');
    s.apply([rename('two')], 'Second', 'tiles');
    s.apply([rename('three')], 'Third', 'prompter');
    s.undo();
    s.undo();
    expect(s.history()).toEqual([
      { label: 'First', source: 'blocks', done: true },
      { label: 'Second', source: 'tiles', done: false },
      { label: 'Third', source: 'prompter', done: false },
    ]);
  });

  it('goes to any step, back or forward', () => {
    const s = session();
    s.apply([rename('one')], 'First', 'blocks');
    s.apply([rename('two')], 'Second', 'blocks');
    s.apply([rename('three')], 'Third', 'blocks');
    s.goTo(1);
    expect(catName(s)).toBe('one');
    s.goTo(3);
    expect(catName(s)).toBe('three');
    s.goTo(0);
    expect(catName(s)).toBe('cat');
  });

  it('refuses a step that does not exist', () => {
    const s = session();
    s.apply([rename('one')], 'First', 'blocks');
    expect(() => s.goTo(2)).toThrow();
    expect(() => s.goTo(-1)).toThrow();
  });
});

describe('subscribers', () => {
  it('hear each change, with its source and edits', () => {
    const s = session();
    const heard: SessionChange<Source>[] = [];
    s.subscribe((c) => heard.push(c));
    const edit = rename('tom');
    s.apply([edit], 'Rename', 'tiles');
    s.undo();
    s.redo();
    expect(heard.map((c) => [c.source, c.label])).toEqual([
      ['tiles', 'Rename'],
      ['undo', 'Rename'],
      ['redo', 'Rename'],
    ]);
    expect(heard[0]?.edits).toEqual([edit]);
    expect(heard[1]?.edits).toEqual([{ ...edit, name: 'cat' }]);
    expect(heard[2]?.edits).toEqual([edit]);
    expect(heard[2]?.program).toBe(s.program());
  });

  it('can stop listening', () => {
    const s = session();
    let count = 0;
    const stop = s.subscribe(() => count++);
    s.apply([rename('tom')], 'Rename', 'blocks');
    stop();
    s.apply([rename('tim')], 'Rename', 'blocks');
    expect(count).toBe(1);
  });
});

describe('load', () => {
  it('starts afresh with an empty history', () => {
    const s = session();
    s.apply([rename('tom')], 'Rename', 'blocks');
    const heard: string[] = [];
    s.subscribe((c) => heard.push(c.source));
    s.load(sampleProgram());
    expect(catName(s)).toBe('cat');
    expect(s.history()).toEqual([]);
    expect(s.undoLabel()).toBeNull();
    expect(heard).toEqual(['load']);
  });

  it('refuses a program that is not valid', () => {
    expect(() => session().load({ schemaVersion: '1.0.0' } as never)).toThrow();
  });

  it('refuses to load in the middle of a group', () => {
    const s = session();
    s.begin('Request', 'prompter');
    expect(() => s.load(sampleProgram())).toThrow();
  });
});

describe('a read-only session, for a file from a newer version', () => {
  it('refuses every edit, in plain words', () => {
    const s = new EditSession<Source>(sampleProgram(), {
      readOnly: 'Update StoryStage to change it.',
    });
    expect(s.apply([rename('tom')], 'Rename', 'blocks')).toEqual({
      ok: false,
      reason: 'Update StoryStage to change it.',
    });
    expect(catName(s)).toBe('cat');
  });
});

describe('any mix of steps, undos and redos', () => {
  const actions = fc.array(fc.constantFrom('add', 'rename', 'undo', 'redo'), { maxLength: 40 });

  it('always has the right program for where it is in the history', () => {
    fc.assert(
      fc.property(actions, (list) => {
        const s = session();
        /** The bytes after each step still on the undo list, then those on the redo list. */
        const states = [bytes(s)];
        let at = 0;
        let n = 0;
        for (const action of list) {
          n++;
          if (action === 'undo') {
            s.undo();
            at = Math.max(0, at - 1);
          } else if (action === 'redo') {
            s.redo();
            at = Math.min(states.length - 1, at + 1);
          } else {
            s.apply(
              [action === 'add' ? add(`newn${n.toString(36).padStart(2, '0')}`) : rename(`n${n}`)],
              action,
              'blocks',
            );
            states.length = ++at;
            states.push(bytes(s));
          }
          expect(bytes(s)).toBe(states[at]);
        }
      }),
      { numRuns: 60 },
    );
  });
});
