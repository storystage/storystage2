import type { EditOperation, NodeId } from '@storystage/ast';
import type { EditorHost, ProgramChange } from '@storystage/editor-contract';
import { exampleProduction, type Production } from '@storystage/production';
import { act, renderHook } from '@testing-library/react';
import { useReducer } from 'react';
import { describe, expect, it } from 'vitest';
import { historyReducer, startHistory, type History } from '../storyboard/history.ts';
import { useEditorHost } from './editorHost.ts';

function useStudio(start: Production, said: string[] = []) {
  const [history, dispatch] = useReducer(
    historyReducer<Production>,
    start,
    startHistory as (p: Production) => History<Production>,
  );
  const host = useEditorHost(history, dispatch, (t) => said.push(t));
  return { history, host, said };
}

const p = exampleProduction();
const method = p.program.types[0]!.methods.find((m) => m.id === p.scenes[0]!.method)!;
const first = method.body[0]!;

/** Switches the method's first statement off: a small, valid edit. */
const switchOff: EditOperation = {
  kind: 'setEnabled',
  node: first.id,
  enabled: false,
  label: 'Switch off',
};

describe('the code editors’ host on the studio’s history (14-editors 1)', () => {
  it('applies an editor’s edits as one step, and tells listeners where it came from', () => {
    const { result } = renderHook(() => useStudio(p));
    const changes: ProgramChange[] = [];
    act(() => {
      result.current.host.subscribe((c) => changes.push(c));
    });
    let outcome;
    act(() => {
      outcome = result.current.host.apply([switchOff], 'Switch off', 'blocks');
    });
    expect(outcome).toEqual({ ok: true });
    expect(result.current.host.undoLabel()).toBe('Switch off');
    expect(result.current.host.program()).toBe(result.current.history.present.program);
    expect(changes.map((c) => [c.source, c.label])).toEqual([['blocks', 'Switch off']]);
  });

  it('refuses a step the program would refuse, in plain words, and changes nothing', () => {
    const { result } = renderHook(() => useStudio(p));
    const before = result.current.host.program();
    let outcome: ReturnType<EditorHost['apply']> | undefined;
    act(() => {
      outcome = result.current.host.apply(
        [{ kind: 'remove', node: 'nothere' as NodeId, label: 'Remove' }],
        'Remove',
        'blocks',
      );
    });
    expect(outcome?.ok).toBe(false);
    expect(outcome?.ok === false && outcome.reason).toMatch(/\w/);
    expect(result.current.host.program()).toBe(before);
    expect(result.current.host.undoLabel()).toBeNull();
  });

  it('undoes and redoes through the same history, and says so to listeners', () => {
    const { result } = renderHook(() => useStudio(p));
    const changes: ProgramChange[] = [];
    act(() => {
      result.current.host.subscribe((c) => changes.push(c));
      result.current.host.apply([switchOff], 'Switch off', 'blocks');
    });
    act(() => result.current.host.undo());
    expect(result.current.host.program()).toBe(p.program);
    expect(result.current.host.redoLabel()).toBe('Switch off');
    act(() => result.current.host.redo());
    expect(changes.map((c) => c.source)).toEqual(['blocks', 'undo', 'redo']);
  });

  it('passes announcements to the studio’s live region', () => {
    const said: string[] = [];
    const { result } = renderHook(() => useStudio(p, said));
    act(() => result.current.host.announce('Blocks go inside a method.'));
    expect(said).toEqual(['Blocks go inside a method.']);
  });
});
