import { describe, expect, it } from 'vitest';
import { RuntimeFault, Scheduler, type Task } from './scheduler.ts';

/** What a run did, as `time:label`. */
function recorder() {
  const log: string[] = [];
  return { log, mark: (s: Scheduler, label: string) => log.push(`${s.now}:${label}`) };
}

function* sleep(
  s: Scheduler,
  mark: (s: Scheduler, l: string) => void,
  label: string,
  us: number,
): Task {
  mark(s, `${label} start`);
  yield { kind: 'sleep', duration: us };
  mark(s, `${label} end`);
}

describe('Scheduler', () => {
  it('runs a thread through its sleeps, in order, in whole microseconds', () => {
    const s = new Scheduler();
    const { log, mark } = recorder();
    s.spawn(sleep(s, mark, 'a', 1_000_000));
    s.runUntil(2_000_000);
    expect(log).toEqual(['0:a start', '1000000:a end']);
    expect(s.now).toBe(2_000_000);
  });

  it('stops at `until`, and carries on from there', () => {
    const s = new Scheduler();
    const { log, mark } = recorder();
    s.spawn(sleep(s, mark, 'a', 100));
    s.runUntil(50);
    expect(log).toEqual(['0:a start']);
    s.runUntil(100);
    expect(log).toEqual(['0:a start', '100:a end']);
  });

  it('runs threads due at one time in thread order, whatever order they went to sleep in', () => {
    const s = new Scheduler();
    const { log, mark } = recorder();
    s.spawn(sleep(s, mark, 'a', 100));
    s.spawn(sleep(s, mark, 'b', 100));
    s.spawn(sleep(s, mark, 'c', 50));
    s.runUntil(100);
    expect(log).toEqual([
      '0:a start',
      '0:b start',
      '0:c start',
      '50:c end',
      '100:a end',
      '100:b end',
    ]);
  });

  it('wakes a joining thread when its last child ends, at that child’s time', () => {
    const s = new Scheduler();
    const { log, mark } = recorder();
    const parent = function* (): Task {
      const children = [s.spawn(sleep(s, mark, 'a', 100)), s.spawn(sleep(s, mark, 'b', 300))];
      yield { kind: 'join', threads: children };
      mark(s, 'parent');
    };
    s.spawn(parent());
    s.runUntil(1000);
    expect(log.at(-1)).toBe('300:parent');
  });

  it('goes straight on when a join has nothing to wait for', () => {
    const s = new Scheduler();
    const { log, mark } = recorder();
    const parent = function* (): Task {
      yield { kind: 'join', threads: [] };
      mark(s, 'parent');
    };
    s.spawn(parent());
    s.runUntil(0);
    expect(log).toEqual(['0:parent']);
  });

  it('copes with joining a child that has already finished', () => {
    const s = new Scheduler();
    const { log, mark } = recorder();
    const parent = function* (): Task {
      const quick = s.spawn((function* (): Task {})());
      yield { kind: 'sleep', duration: 10 };
      yield { kind: 'join', threads: [quick] };
      mark(s, 'parent');
    };
    s.spawn(parent());
    s.runUntil(100);
    expect(log).toEqual(['10:parent']);
  });

  it('nests: do together inside do together', () => {
    const s = new Scheduler();
    const { log, mark } = recorder();
    const inner = function* (): Task {
      yield {
        kind: 'join',
        threads: [s.spawn(sleep(s, mark, 'x', 100)), s.spawn(sleep(s, mark, 'y', 200))],
      };
    };
    const outer = function* (): Task {
      yield { kind: 'join', threads: [s.spawn(inner()), s.spawn(sleep(s, mark, 'z', 150))] };
      mark(s, 'done');
    };
    s.spawn(outer());
    s.runUntil(1000);
    expect(log.at(-1)).toBe('200:done');
  });

  it('gives the same order on every run', () => {
    const once = () => {
      const s = new Scheduler();
      const { log, mark } = recorder();
      for (let i = 0; i < 20; i++) s.spawn(sleep(s, mark, `t${i}`, (i * 37) % 11));
      s.runUntil(100);
      return log;
    };
    expect(once()).toEqual(once());
  });

  describe('asking the stage', () => {
    const question = { kind: 'isVisible', object: 'cat', at: 0 } as never;

    it('stops the whole run until the answer comes, and hands it to the thread', () => {
      const s = new Scheduler();
      const { log, mark } = recorder();
      const asker = function* (): Task {
        const answer = yield { kind: 'ask', query: question };
        mark(s, `got ${String(answer)}`);
      };
      s.spawn(asker());
      s.spawn(sleep(s, mark, 'other', 0));
      expect(s.runUntil(100)).toEqual({ kind: 'asking', query: question });
      expect(log).toEqual([]);
      s.answer(true);
      expect(s.runUntil(100)).toEqual({ kind: 'ran' });
      expect(log).toEqual(['0:got true', '0:other start', '0:other end']);
    });

    it('stays at the time of the question', () => {
      const s = new Scheduler();
      const asker = function* (): Task {
        yield { kind: 'sleep', duration: 40 };
        yield { kind: 'ask', query: question };
      };
      s.spawn(asker());
      s.runUntil(100);
      expect(s.now).toBe(40);
      s.answer(false);
      s.runUntil(100);
      expect(s.now).toBe(100);
    });

    it('refuses an answer nobody asked for', () => {
      expect(() => new Scheduler().answer(true)).toThrow();
    });

    it('turns a refused question into a fault in the asking thread', () => {
      const faults: RuntimeFault[] = [];
      const s = new Scheduler({ onFault: (f) => faults.push(f) });
      const asker = function* (): Task {
        yield { kind: 'ask', query: question };
      };
      s.spawn(asker());
      s.runUntil(0);
      s.refuse(new RuntimeFault('stage', null));
      expect(faults.map((f) => f.code)).toEqual(['stage']);
    });
  });

  describe('faults', () => {
    const bad = function* (): Task {
      yield { kind: 'sleep', duration: 10 };
      throw new RuntimeFault('bad_value', null);
    };

    it('stops every thread and reports once', () => {
      const faults: RuntimeFault[] = [];
      const s = new Scheduler({ onFault: (f) => faults.push(f) });
      const { log, mark } = recorder();
      s.spawn(sleep(s, mark, 'a', 100));
      s.spawn(bad());
      s.spawn(bad());
      s.runUntil(1000);
      expect(faults.map((f) => f.code)).toEqual(['bad_value']);
      expect(log).toEqual(['0:a start']);
      expect(s.stopped).toBe(true);
    });

    it('stops at the time of the fault', () => {
      const s = new Scheduler({ onFault: () => undefined });
      s.spawn(bad());
      s.runUntil(1000);
      expect(s.now).toBe(10);
    });

    it('reports a slip in the runtime itself as internal', () => {
      const faults: RuntimeFault[] = [];
      const s = new Scheduler({ onFault: (f) => faults.push(f) });
      const slip = function* (): Task {
        yield { kind: 'sleep', duration: 1 };
        throw new TypeError('oops');
      };
      s.spawn(slip());
      s.runUntil(10);
      expect(faults[0]?.code).toBe('internal');
      expect(faults[0]?.detail).toContain('oops');
    });
  });

  describe('stop', () => {
    it('ends every thread, and nothing more runs', () => {
      const s = new Scheduler();
      const { log, mark } = recorder();
      let cleaned = false;
      const held = function* (): Task {
        try {
          yield { kind: 'sleep', duration: 100 };
          mark(s, 'never');
        } finally {
          cleaned = true;
        }
      };
      s.spawn(held());
      s.runUntil(0);
      s.stop();
      s.runUntil(1000);
      expect(log).toEqual([]);
      expect(cleaned).toBe(true);
      expect(s.stopped).toBe(true);
    });
  });

  describe('running blocks', () => {
    it('are whatever each thread last said it was running', () => {
      const s = new Scheduler();
      const task = function* (): Task {
        s.current!.running = 'blockA' as never;
        yield { kind: 'sleep', duration: 10 };
        s.current!.running = null;
      };
      s.spawn(task());
      s.runUntil(5);
      expect(s.running()).toEqual(['blockA']);
      s.runUntil(10);
      expect(s.running()).toEqual([]);
    });
  });

  it('knows when nothing is left to run', () => {
    const s = new Scheduler();
    const { mark } = recorder();
    const thread = s.spawn(sleep(s, mark, 'a', 10));
    expect(thread.done).toBe(false);
    s.runUntil(10);
    expect(thread.done).toBe(true);
    expect(s.idle).toBe(true);
  });

  it('spawns at the present, whenever that is', () => {
    const s = new Scheduler();
    const { log, mark } = recorder();
    s.runUntil(500);
    s.spawn(sleep(s, mark, 'late', 10));
    s.runUntil(510);
    expect(log).toEqual(['500:late start', '510:late end']);
  });
});
