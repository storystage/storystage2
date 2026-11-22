/**
 * The cooperative scheduler (WP6.1, spike 1.4). Each running strand of the program is a generator
 * that yields when it has to wait. The loop runs over virtual time in whole microseconds, with a
 * total order of (time, thread number), so one program always gives the same result, however it
 * is paced. `docs/spec/18-runtime.md` has the rules.
 */
import type { NodeId } from '@storystage/ast';
import type { Micros, StageErrorCode, StageQuery } from '@storystage/story-api';
import type { RuntimeErrorCode } from './messages.ts';

export type Wait =
  | { readonly kind: 'sleep'; readonly duration: Micros }
  | { readonly kind: 'join'; readonly threads: readonly Thread[] }
  /** Ask the stage. Everything waits, so the answer can't depend on the order of messages. */
  | { readonly kind: 'ask'; readonly query: StageQuery };

/** A strand of work: yields what it waits for, and gets back the answer to an `ask`. */
export type Task<T = void> = Generator<Wait, T, unknown>;

export interface Thread {
  readonly id: number;
  done: boolean;
  /** The block it's on, for highlighting (WP7.9). */
  running: NodeId | null;
}

interface RunningThread extends Thread {
  readonly task: Task<unknown>;
  joiners: RunningThread[];
  waitingFor: number;
}

/** Why the program can't go on. The studio turns the code into plain words (WP6.3). */
export class RuntimeFault extends Error {
  readonly code: RuntimeErrorCode;
  readonly node: NodeId | null;
  readonly detail: string | undefined;
  /** For a `stage` fault, the stage's own code. */
  readonly stageCode: StageErrorCode | undefined;

  constructor(
    code: RuntimeErrorCode,
    node: NodeId | null,
    detail?: string,
    stageCode?: StageErrorCode,
  ) {
    super(detail ?? code);
    this.name = 'RuntimeFault';
    this.code = code;
    this.node = node;
    this.detail = detail;
    this.stageCode = stageCode;
  }
}

/**
 * Thrown to end the whole run without a fault, for a reason the scheduler passes on: a scene
 * change (WP8.3). Every strand stops at once, as a fault stops them.
 */
export class EndRun {
  readonly reason: unknown;
  constructor(reason: unknown) {
    this.reason = reason;
  }
}

export type RunResult =
  | { readonly kind: 'ran' }
  /** A thread needs the stage. Call `answer` or `refuse`, then run again. */
  | { readonly kind: 'asking'; readonly query: StageQuery };

export interface SchedulerOptions {
  readonly onFault?: (fault: RuntimeFault) => void;
  /** After an `EndRun`, with its reason. */
  readonly onEnd?: (reason: unknown) => void;
}

export class Scheduler {
  /** Virtual time in microseconds. */
  now: Micros = 0;
  stopped = false;
  /** The thread running at this moment. */
  current: Thread | null = null;
  private nextId = 0;
  private queue: { at: Micros; thread: RunningThread; value: unknown }[] = [];
  private asked: { thread: RunningThread; query: StageQuery } | null = null;
  private readonly threads = new Set<RunningThread>();
  private readonly onFault: (fault: RuntimeFault) => void;
  private readonly onEnd: (reason: unknown) => void;

  constructor(options: SchedulerOptions = {}) {
    this.onEnd = options.onEnd ?? (() => undefined);
    this.onFault =
      options.onFault ??
      ((fault) => {
        throw fault;
      });
  }

  /** True when no thread has anything left to do. Listeners are woken from outside. */
  get idle(): boolean {
    return this.queue.length === 0 && this.asked === null;
  }

  /** Starts a thread at the present. It runs when the loop reaches it. */
  spawn(task: Task<unknown>): Thread {
    const thread: RunningThread = {
      id: this.nextId++,
      task,
      done: false,
      running: null,
      joiners: [],
      waitingFor: 0,
    };
    this.threads.add(thread);
    this.wake(thread, this.now);
    return thread;
  }

  /** Runs everything due up to and including `until`. */
  runUntil(until: Micros): RunResult {
    while (!this.stopped) {
      if (this.asked) return { kind: 'asking', query: this.asked.query };
      const next = this.queue[0];
      if (!next || next.at > until) break;
      this.queue.shift();
      this.now = next.at;
      this.resume(next.thread, next.value);
    }
    if (!this.stopped) this.now = Math.max(this.now, until);
    return { kind: 'ran' };
  }

  /** The stage's answer to the question `runUntil` returned. */
  answer(value: unknown): void {
    const { thread } = this.takeAsked();
    this.wake(thread, this.now, value);
  }

  /** The stage couldn't answer, which ends the run. */
  refuse(fault: RuntimeFault): void {
    this.takeAsked();
    this.fail(fault);
  }

  /** Ends every thread. Their `finally` blocks run; nothing else does. */
  stop(): void {
    this.stopped = true;
    this.queue = [];
    this.asked = null;
    for (const thread of this.threads) {
      thread.done = true;
      thread.task.return(undefined);
    }
    this.threads.clear();
  }

  /** The blocks running now. */
  running(): NodeId[] {
    return [...this.threads].flatMap((t) => (t.running === null ? [] : [t.running]));
  }

  private takeAsked() {
    if (!this.asked) throw new Error('Nothing is waiting for an answer.');
    const asked = this.asked;
    this.asked = null;
    return asked;
  }

  private wake(thread: RunningThread, at: Micros, value?: unknown): void {
    let i = this.queue.length;
    while (i > 0) {
      const queued = this.queue[i - 1]!;
      if (queued.at < at || (queued.at === at && queued.thread.id < thread.id)) break;
      i--;
    }
    this.queue.splice(i, 0, { at, thread, value });
  }

  private fail(fault: RuntimeFault): void {
    if (this.stopped) return;
    this.stop();
    this.onFault(fault);
  }

  private resume(thread: RunningThread, value: unknown): void {
    let step: IteratorResult<Wait, unknown>;
    this.current = thread;
    try {
      step = thread.task.next(value);
    } catch (e) {
      thread.done = true;
      this.threads.delete(thread);
      if (e instanceof EndRun) {
        this.stop();
        this.onEnd(e.reason);
        return;
      }
      this.fail(
        e instanceof RuntimeFault
          ? e
          : new RuntimeFault(
              'internal',
              thread.running,
              e instanceof Error ? e.message : String(e),
            ),
      );
      return;
    }
    if (step.done) {
      this.finish(thread);
      return;
    }
    const wait = step.value;
    switch (wait.kind) {
      case 'sleep':
        this.wake(thread, this.now + wait.duration);
        break;
      case 'ask':
        this.asked = { thread, query: wait.query };
        break;
      case 'join': {
        const live = wait.threads.filter((t) => !t.done) as RunningThread[];
        thread.waitingFor = live.length;
        if (live.length === 0) this.wake(thread, this.now);
        for (const child of live) child.joiners.push(thread);
      }
    }
  }

  private finish(thread: RunningThread): void {
    thread.done = true;
    thread.running = null;
    this.threads.delete(thread);
    for (const joiner of thread.joiners) if (--joiner.waitingFor === 0) this.wake(joiner, this.now);
  }
}
