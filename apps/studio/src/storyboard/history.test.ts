// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  commit,
  historyReducer,
  nextRedo,
  nextUndo,
  redo,
  seal,
  startHistory,
  undo,
} from './history.ts';

describe('the Storyboard’s undo history', () => {
  it('undoes and redoes a step, naming it', () => {
    let h = commit(startHistory('a'), 'Write title', 'b');
    expect(nextUndo(h)).toBe('Write title');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(nextRedo(h)).toBe('Write title');
    h = redo(h);
    expect(h.present).toBe('b');
    expect(nextRedo(h)).toBeNull();
  });

  it('makes one step of typing in one field, until the learner leaves it', () => {
    let h = startHistory('');
    h = commit(h, 'Write logline', 'A', 'logline');
    h = commit(h, 'Write logline', 'A s', 'logline');
    h = commit(h, 'Write logline', 'A shy owl', 'logline');
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toBe('');
    h = seal(h);
    h = commit(h, 'Write logline', 'A shy owl.', 'logline');
    expect(h.past).toHaveLength(2);
    expect(undo(h).present).toBe('A shy owl');
  });

  it('starts a new step when a different change comes between', () => {
    let h = commit(startHistory(0), 'Write title', 1, 'title');
    h = commit(h, 'Change arc to 5-part', 2);
    h = commit(h, 'Write title', 3, 'title');
    expect(h.past.map((s) => s.label)).toEqual([
      'Write title',
      'Change arc to 5-part',
      'Write title',
    ]);
  });

  it('forgets what could be redone once something new is done', () => {
    let h = commit(startHistory('a'), 'One', 'b');
    h = undo(h);
    h = commit(h, 'Two', 'c');
    expect(nextRedo(h)).toBeNull();
    expect(h.past.map((s) => s.label)).toEqual(['Two']);
  });

  it('records nothing when nothing changed', () => {
    const h = startHistory('a');
    expect(commit(h, 'Nothing', 'a')).toBe(h);
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    let h = startHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) h = commit(h, `Step ${i}`, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]!.label).toBe('Step 6');
  });

  it('does nothing to undo or redo when there’s nothing to', () => {
    const h = startHistory('a');
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('works as a reducer, and starts afresh on replace', () => {
    let h = historyReducer(startHistory('a'), { type: 'commit', label: 'One', next: 'b' });
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toBe('a');
    h = historyReducer(h, { type: 'replace', present: 'z' });
    expect(h).toEqual(startHistory('z'));
  });
});
