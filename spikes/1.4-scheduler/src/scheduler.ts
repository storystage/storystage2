/**
 * Spike 1.4: a cooperative scheduler for do in order, do together, count and timed events.
 *
 * Each running piece of the program is a generator ("thread") that yields when it has to wait:
 * for a duration, or for child threads to finish (do together). The scheduler is a
 * discrete-event loop over virtual time, so the same program always produces the same
 * commands at the same times, whether it is paced by the wall clock (live) or not (fixed step).
 *
 * Time is kept in whole microseconds so that sums of durations never drift and the order of
 * equal times is decided by thread number, not by floating-point rounding.
 */
import type { Program, Statement } from './program.ts';

export const US = 1_000_000;
export const toUs = (seconds: number) => Math.round(seconds * US);

/** What the worker sends to the main thread. Movements are relative and additive, so overlapping
 * commands on one object (moving while turning, nested do together) compose in any order. */
export type Command =
  | {
      seq: number;
      object: string;
      kind: 'translate';
      dx: number;
      dy: number;
      dz: number;
      start: number;
      duration: number;
    }
  | { seq: number; object: string; kind: 'rotate'; turns: number; start: number; duration: number }
  | { seq: number; object: string; kind: 'say'; text: string; start: number; duration: number };

type Yield = { sleep: number } | { join: Thread[] };
interface Thread {
  id: number;
  gen: Generator<Yield, void, void>;
  done: boolean;
  joiners: Thread[];
  waitingFor: Thread[];
}

export class Scheduler {
  /** Virtual time in microseconds. */
  now = 0;
  readonly commands: Command[] = [];
  private nextId = 0;
  private seq = 0;
  private queue: { at: number; thread: Thread }[] = [];
  private readonly program: Program;
  private mainThread: Thread;

  constructor(program: Program) {
    this.program = program;
    this.mainThread = this.spawn(this.block(program.main, 'inOrder'));
    for (const event of program.events) this.spawn(this.timer(event.every, event.body));
  }

  get mainDone(): boolean {
    return this.mainThread.done;
  }

  /** Runs every thread that is due up to and including `until` (microseconds). */
  runUntil(until: number): void {
    for (;;) {
      const next = this.queue[0];
      if (!next || next.at > until) break;
      this.queue.shift();
      this.now = next.at;
      this.resume(next.thread);
    }
    this.now = Math.max(this.now, until);
  }

  private spawn(gen: Generator<Yield, void, void>): Thread {
    const thread: Thread = { id: this.nextId++, gen, done: false, joiners: [], waitingFor: [] };
    this.wake(thread, this.now);
    return thread;
  }

  private wake(thread: Thread, at: number): void {
    // Sorted by time, then by thread id: a total order, so runs are repeatable.
    let i = this.queue.length;
    while (i > 0) {
      const q = this.queue[i - 1]!;
      if (q.at < at || (q.at === at && q.thread.id < thread.id)) break;
      i--;
    }
    this.queue.splice(i, 0, { at, thread });
  }

  private resume(thread: Thread): void {
    const step = thread.gen.next();
    if (step.done) {
      thread.done = true;
      for (const joiner of thread.joiners) {
        joiner.waitingFor = joiner.waitingFor.filter((t) => !t.done);
        if (joiner.waitingFor.length === 0) this.wake(joiner, this.now);
      }
      return;
    }
    const y = step.value;
    if ('sleep' in y) {
      this.wake(thread, this.now + y.sleep);
    } else {
      thread.waitingFor = y.join.filter((t) => !t.done);
      if (thread.waitingFor.length === 0) this.wake(thread, this.now);
      for (const child of thread.waitingFor) child.joiners.push(thread);
    }
  }

  private *block(body: Statement[], how: 'inOrder' | 'together'): Generator<Yield, void, void> {
    if (how === 'together') {
      const children = body.map((s) => this.spawn(this.exec(s)));
      yield { join: children };
      return;
    }
    for (const s of body) yield* this.exec(s);
  }

  private *timer(every: number, body: Statement[]): Generator<Yield, void, void> {
    let running: Thread | undefined;
    for (;;) {
      yield { sleep: toUs(every) };
      // If the last run is still going, skip this one (one of Alice's options; the real
      // runtime offers the others too).
      if (running && !running.done) continue;
      running = this.spawn(this.block(body, 'inOrder'));
    }
  }

  private *exec(s: Statement): Generator<Yield, void, void> {
    switch (s.kind) {
      case 'doInOrder':
        return yield* this.block(s.body, 'inOrder');
      case 'doTogether':
        return yield* this.block(s.body, 'together');
      case 'count':
        for (let i = 0; i < s.times; i++) yield* this.block(s.body, 'inOrder');
        return;
      case 'move': {
        const sign = s.direction === 'backward' || s.direction === 'down' ? -1 : 1;
        let dx = 0;
        let dy = 0;
        let dz = 0;
        if (s.direction === 'up' || s.direction === 'down') dy = sign * s.amount;
        else {
          // Forward is the object's heading when the move starts (a straight line). Alice's
          // move during a turn makes an arc: WP6 decides which to match.
          const heading = stateAt(this.program, this.commands, this.now)[s.target]!.heading;
          dx = sign * s.amount * Math.sin(heading * 2 * Math.PI);
          dz = sign * s.amount * Math.cos(heading * 2 * Math.PI);
        }
        this.emit({ object: s.target, kind: 'translate', dx, dy, dz, duration: toUs(s.duration) });
        yield { sleep: toUs(s.duration) };
        return;
      }
      case 'turn': {
        const turns = (s.direction === 'left' ? -1 : 1) * s.amount;
        this.emit({ object: s.target, kind: 'rotate', turns, duration: toUs(s.duration) });
        yield { sleep: toUs(s.duration) };
        return;
      }
      case 'say':
        this.emit({ object: s.target, kind: 'say', text: s.text, duration: toUs(s.duration) });
        yield { sleep: toUs(s.duration) };
        return;
    }
  }

  private emit(c: DistributiveOmit<Command, 'seq' | 'start'>): void {
    this.commands.push({ ...c, seq: this.seq++, start: this.now } as Command);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Alice's default "gently" style: slow in, slow out. */
export const ease = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

export interface ObjectState {
  x: number;
  y: number;
  z: number;
  /** In turns (1 = 360°). */
  heading: number;
  saying: string | null;
}

/** The scene at virtual time `t` (microseconds): the starting state plus every command's eased
 * share. A pure function of its inputs, used by both the worker and the main thread. */
export function stateAt(
  program: Program,
  commands: readonly Command[],
  t: number,
): Record<string, ObjectState> {
  const state: Record<string, ObjectState> = {};
  for (const o of program.objects)
    state[o.name] = { x: o.x, y: 0, z: o.z, heading: o.heading, saying: null };
  for (const c of commands) {
    if (c.start > t) continue;
    const s = state[c.object]!;
    const p = c.duration === 0 ? 1 : ease((t - c.start) / c.duration);
    if (c.kind === 'translate') {
      s.x += c.dx * p;
      s.y += c.dy * p;
      s.z += c.dz * p;
    } else if (c.kind === 'rotate') {
      s.heading += c.turns * p;
    } else if (t < c.start + c.duration) {
      s.saying = c.text;
    }
  }
  return state;
}

/** FNV-1a over the scene state, rounded to a micrometre, for determinism checks (WP18.2). */
export function hashState(state: Record<string, ObjectState>, hash = 0x811c9dc5): number {
  const text = Object.keys(state)
    .sort()
    .map((k) => {
      const s = state[k]!;
      return `${k}:${s.x.toFixed(6)},${s.y.toFixed(6)},${s.z.toFixed(6)},${s.heading.toFixed(6)},${s.saying ?? ''}`;
    })
    .join('|');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
