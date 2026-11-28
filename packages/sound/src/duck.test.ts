import { describe, expect, it } from 'vitest';
import { DUCK_LEVEL, duckOf, levelsFrom } from './duck.ts';
import { levelAt } from './live.ts';

// Music lowered under speech (decision 0076; the owner's numbers, 27 Nov 2026): to 0.4 under
// each voiced speak line, down over 0.3 s ending as the line starts, back up over 0.6 s after it,
// with lines less than a second apart joined.

describe('duckOf', () => {
  it('lowers the music to 0.4 under a line, down before it and back up after', () => {
    expect(duckOf([{ start: 5, end: 7 }])).toEqual([
      [4.7, 1],
      [5, 0.4],
      [7, 0.4],
      [7.6, 1],
    ]);
    expect(DUCK_LEVEL).toBe(0.4);
  });

  it('leaves the music alone with no speech', () => {
    expect(duckOf([])).toEqual([]);
    expect(duckOf([{ start: 3, end: 3 }])).toEqual([]);
  });

  it('joins lines less than a second apart, so the music doesn’t bob between them', () => {
    expect(
      duckOf([
        { start: 5, end: 7 },
        { start: 7.9, end: 9 },
      ]),
    ).toEqual([
      [4.7, 1],
      [5, 0.4],
      [9, 0.4],
      [9.6, 1],
    ]);
  });

  it('comes back up between lines a second or more apart', () => {
    expect(
      duckOf([
        { start: 10, end: 11 },
        { start: 2, end: 3 },
      ]),
    ).toEqual([
      [1.7, 1],
      [2, 0.4],
      [3, 0.4],
      [3.6, 1],
      [9.7, 1],
      [10, 0.4],
      [11, 0.4],
      [11.6, 1],
    ]);
  });

  it('starts low at the film’s start when a line is there, with no time before it', () => {
    expect(duckOf([{ start: 0.1, end: 2 }])).toEqual([
      [0, 0.6],
      [0.1, 0.4],
      [2, 0.4],
      [2.6, 1],
    ]);
  });
});

describe('levelAt', () => {
  const points = duckOf([{ start: 5, end: 7 }]);

  it('ramps in a straight line between points, and holds the ends', () => {
    expect(levelAt(points, 0)).toBe(1);
    expect(levelAt(points, 4.85)).toBeCloseTo(0.7);
    expect(levelAt(points, 6)).toBe(0.4);
    expect(levelAt(points, 7.3)).toBeCloseTo(0.7);
    expect(levelAt(points, 100)).toBe(1);
  });

  it('is full with no points', () => {
    expect(levelAt([], 3)).toBe(1);
  });

  it('gives the later point at a time two share, as #728’s does', () => {
    const step: (readonly [number, number])[] = [
      [1, 0],
      [3, 1],
      [3, 0.5],
    ];
    expect(levelAt(step, 3)).toBe(0.5);
    expect(levelAt(step, 2)).toBe(0.5);
    expect(levelAt(step, 4)).toBe(0.5);
  });
});

describe('levelsFrom', () => {
  it('gives levelAt’s levels for times that only go forwards, without searching from the start', () => {
    const points = duckOf([
      { start: 5, end: 7 },
      { start: 9, end: 10 },
    ]);
    const at = levelsFrom(points);
    for (let t = 0; t <= 12; t += 0.05) expect(at(t)).toBeCloseTo(levelAt(points, t), 9);
  });

  it('is full with no points, and holds a shared time’s later level', () => {
    expect(levelsFrom([])(3)).toBe(1);
    const at = levelsFrom([
      [1, 0],
      [3, 1],
      [3, 0.5],
    ]);
    expect([at(0), at(2), at(3), at(4)]).toEqual([0, 0.5, 0.5, 0.5]);
  });
});
