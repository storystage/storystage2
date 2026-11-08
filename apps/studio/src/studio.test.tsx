import type { EditOperation } from '@storystage/ast';
import { addScene, exampleProduction, type Production } from '@storystage/production';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setLogline, setTitle } from './storyboard/edits.ts';
import { useStudio } from './studio.ts';

const p = exampleProduction();
const first = p.program.types[0]!.methods.find((m) => m.id === p.scenes[0]!.method)!.body[0]!;
const switchOff: EditOperation = {
  kind: 'setEnabled',
  node: first.id,
  enabled: false,
  label: 'Switch off',
};

describe('one production, one undo history (07-ux 6.8, 7.5)', () => {
  it('keeps typing into one field as one step until the learner leaves it', () => {
    const { result } = renderHook(() => useStudio(p));
    act(() =>
      result.current.commit('Write title', setTitle(result.current.production, 'A'), 'title'),
    );
    act(() =>
      result.current.commit('Write title', setTitle(result.current.production, 'AB'), 'title'),
    );
    // Named while the learner is still typing.
    expect(result.current.undoLabel).toBe('Write title');
    act(() => result.current.seal());
    expect(result.current.undoLabel).toBe('Write title');
    act(() => result.current.undo());
    expect(result.current.production.manifest.title).toBe(p.manifest.title);
    expect(result.current.undoLabel).toBeNull();
  });

  it('closes the typing step when something else changes', () => {
    const { result } = renderHook(() => useStudio(p));
    act(() =>
      result.current.commit('Write title', setTitle(result.current.production, 'A'), 'title'),
    );
    act(() =>
      result.current.commit('Write logline', setLogline(result.current.production, 'L'), 'logline'),
    );
    act(() => result.current.undo());
    expect(result.current.production.manifest.title).toBe('A');
    expect(result.current.production.storyboard.logline).toBe(p.storyboard.logline);
  });

  it('undoes code and Storyboard steps in order, through the one session', () => {
    const { result } = renderHook(() => useStudio(p));
    act(() => result.current.commit('Write title', setTitle(result.current.production, 'New')));
    act(() => {
      result.current.session.apply([switchOff], 'Switch off', 'blocks');
    });
    const added = addScene(result.current.production, { heading: 'Cave', label: 'Add scene 4' });
    if (!added.ok) throw new Error('addScene refused');
    act(() => {
      result.current.step(added.step);
    });
    expect(result.current.production.manifest.runningOrder).toHaveLength(4);
    act(() => result.current.undo());
    expect(result.current.production.manifest.runningOrder).toHaveLength(3);
    expect(result.current.undoLabel).toBe('Switch off');
    act(() => result.current.undo());
    expect(JSON.stringify(result.current.production.program)).toBe(JSON.stringify(p.program));
    expect(result.current.production.manifest.title).toBe('New');
  });

  it('refuses a Storyboard change that changes the program: that is a step or an edit', () => {
    const { result } = renderHook(() => useStudio(p));
    const changed: Production = { ...p, program: { ...p.program, types: [] } };
    expect(() => result.current.commit('Oops', changed)).toThrow(/step\(\) or the editors/);
  });
});
