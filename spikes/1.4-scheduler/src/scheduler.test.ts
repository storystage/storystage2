import { describe, expect, it } from 'vitest';
import { SAMPLE, type Program } from './program.ts';
import { Scheduler, hashState, stateAt, toUs, US } from './scheduler.ts';

const run = (program: Program, seconds: number) => {
  const s = new Scheduler(program);
  s.runUntil(toUs(seconds));
  return s;
};
const starts = (s: Scheduler, object: string, kind: string) =>
  s.commands.filter((c) => c.object === object && c.kind === kind).map((c) => c.start / US);

describe('scheduler timing (sample program)', () => {
  const s = run({ ...SAMPLE, events: [] }, 10);

  it('runs do in order one statement after another', () => {
    expect(starts(s, 'cat', 'say')).toEqual([0]);
    expect(starts(s, 'cat', 'translate')).toEqual([1]);
  });

  it('starts every branch of do together at once, and nested blocks keep their order', () => {
    expect(starts(s, 'dog', 'rotate')).toEqual([1]);
    // The nested do together starts after the dog's turn (0.5 s); both of its moves start together.
    expect(starts(s, 'dog', 'translate')).toEqual([1.5, 1.5]);
  });

  it('waits for the longest branch before going on', () => {
    // The outer do together ends at 1 + max(1, 0.5 + 0.75) = 2.25 s; then count runs 3 turns.
    expect(starts(s, 'cat', 'rotate')).toEqual([2.25, 2.5, 2.75]);
    expect(s.mainDone).toBe(true);
  });
});

describe('timed events', () => {
  it('fire on time, alongside the main program', () => {
    const s = run(SAMPLE, 2.01);
    const ups = s.commands.filter(
      (c) => c.object === 'dog' && c.kind === 'translate' && c.duration === toUs(0.1),
    );
    expect(ups.map((c) => c.start / US)).toEqual([0.5, 1, 1.5, 2]);
  });

  it('skip a run while the last one is still going', () => {
    const slow: Program = {
      objects: [{ name: 'cat', x: 0, z: 0, heading: 0 }],
      main: [],
      events: [
        {
          every: 0.5,
          body: [{ kind: 'turn', target: 'cat', direction: 'left', amount: 1, duration: 0.8 }],
        },
      ],
    };
    expect(starts(run(slow, 3), 'cat', 'rotate')).toEqual([0.5, 1.5, 2.5]);
  });
});

describe('determinism', () => {
  it('gives the same commands every run', () => {
    expect(run(SAMPLE, 5).commands).toEqual(run(SAMPLE, 5).commands);
  });

  it('gives the same 60 fixed-step frames twice in a row, however it is paced', () => {
    const frames = (lookaheadSeconds: number) => {
      // Run the scheduler ahead of the frame by different amounts: the frames must not change.
      const s = new Scheduler(SAMPLE);
      const hashes: number[] = [];
      for (let f = 0; f < 60; f++) {
        const t = toUs(f / 30);
        s.runUntil(t + toUs(lookaheadSeconds));
        hashes.push(hashState(stateAt(SAMPLE, s.commands, t)));
      }
      return hashes;
    };
    const a = frames(0);
    expect(frames(0)).toEqual(a);
    expect(frames(0.1)).toEqual(a);
    expect(frames(1)).toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(30); // the scene really moves
  });

  it('ends where the program says', () => {
    const s = run({ ...SAMPLE, events: [] }, 10);
    const end = stateAt(SAMPLE, s.commands, toUs(10));
    expect(end.cat!.z).toBeCloseTo(2); // moved forward 2 m facing +z
    expect(end.cat!.heading).toBeCloseTo(1.5); // three half turns right
    expect(end.dog!.heading).toBeCloseTo(-0.25);
    expect(end.dog!.y).toBeCloseTo(0.5);
  });
});
