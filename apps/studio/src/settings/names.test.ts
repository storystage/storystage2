import { describe, expect, it } from 'vitest';
import { PUPIL_NAME_LIMIT, nameProblem, readPastedNames } from './names.ts';

describe('nameProblem', () => {
  it('needs a name, within the limit, not already in the class', () => {
    expect(nameProblem('  ', [])).toBe('empty');
    expect(nameProblem('a'.repeat(PUPIL_NAME_LIMIT), [])).toBeNull();
    expect(nameProblem('a'.repeat(PUPIL_NAME_LIMIT + 1), [])).toBe('tooLong');
    expect(nameProblem(' sam  k. ', ['Sam K.'])).toBe('taken');
    expect(nameProblem('Sam', ['Sam K.'])).toBeNull();
  });
});

describe('readPastedNames', () => {
  it('reads one name a line, and marks what is left out', () => {
    const pasted = ['Ana', '', '  Sam  ', 'ana', 'Pip   Jones', 'x'.repeat(41), '\tLeila\r'].join(
      '\n',
    );
    expect(readPastedNames(pasted, ['Sam'])).toEqual([
      { name: 'Ana', problem: null },
      { name: 'Sam', problem: 'taken' },
      { name: 'ana', problem: 'repeated' },
      { name: 'Pip Jones', problem: null },
      { name: 'x'.repeat(41), problem: 'tooLong' },
      { name: 'Leila', problem: null },
    ]);
  });

  it('reads nothing from blank lines', () => {
    expect(readPastedNames('\n  \n', [])).toEqual([]);
  });
});
