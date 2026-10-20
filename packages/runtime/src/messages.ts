/**
 * WP0.8 contract: the messages between the runtime worker and the main thread.
 *
 * Owner: S2. A change here is a `contract` pull request, reviewed before the code that uses it.
 * The protocol follows spike 1.4 (`docs/spikes/REPORT.md`):
 * 1. The worker posts `ready` as soon as it has loaded; the main thread starts the clock only then.
 * 2. In live mode the worker runs ahead of the clock by `lookahead` and posts stage commands
 *    before they are due; the main thread's bridge hands them to `Stage.schedule` and calls
 *    `Stage.seek(now)` every frame. In fixed-step mode the main thread asks the worker to
 *    `advance` to each frame's time, so export and tests never depend on the wall clock.
 * 3. A Story API function that reads the scene ("distance to") sends `ask`; the worker waits
 *    for the matching `answer` before going on. The main thread answers with `Stage.answer`.
 * 4. Messages are plain data (structured-clone safe), so the same contract works in tests
 *    without a worker (`inMemoryPorts`).
 */
import type { NodeId, Program } from '@storystage/ast';
import type {
  Micros,
  SceneSetup,
  StageCommand,
  StageErrorCode,
  StageEvent,
  StageQuery,
  StageQueryResult,
} from '@storystage/story-api';

/** Bumped on any change that an older main thread or worker couldn't read. */
export const RUNTIME_PROTOCOL = 1;

export type RunMode =
  /**
   * Paced by the wall clock. `t0` is when scene time 0 is, in milliseconds on the shared clock
   * (`performance.timeOrigin + performance.now()`, which the worker and the page agree on).
   */
  | {
      readonly kind: 'live';
      readonly t0: number;
      readonly lookahead: Micros;
      readonly speed: number;
    }
  /** Not paced: the main thread calls `advance` for each frame (export, tests, the self-test). */
  | { readonly kind: 'fixed' };

/** Main thread to worker. */
export type ToRuntime =
  | {
      readonly type: 'load';
      readonly protocol: typeof RUNTIME_PROTOCOL;
      readonly program: Program;
      readonly scene: SceneSetup;
      /** The method that "when the scene starts" runs (a scene's script method, WP8.2). */
      readonly entry: NodeId;
      /** Seed for the program's random numbers, so deterministic runs repeat (WP6.5). */
      readonly seed: number;
      /** Blocks the learner has switched off (WP6.4). */
      readonly disabled: readonly NodeId[];
    }
  | { readonly type: 'start'; readonly mode: RunMode }
  /** Fixed-step mode: run everything due up to and including `until`, then send `commands`. */
  | { readonly type: 'advance'; readonly until: Micros }
  | { readonly type: 'pause' }
  /** Carry on from where it paused; `t0` re-anchors scene time to the wall clock. */
  | { readonly type: 'resume'; readonly t0: number }
  | { readonly type: 'speed'; readonly speed: number; readonly t0: number }
  | { readonly type: 'stop' }
  | { readonly type: 'event'; readonly event: StageEvent }
  | {
      readonly type: 'answer';
      readonly id: number;
      readonly result: StageQueryResult | { readonly kind: 'error'; readonly code: StageErrorCode };
    };

/** Worker to main thread. */
export type FromRuntime =
  /** The worker has loaded and speaks this protocol. Sent once, before anything else. */
  | { readonly type: 'ready'; readonly protocol: typeof RUNTIME_PROTOCOL }
  /** `load` was accepted and checked. */
  | { readonly type: 'loaded' }
  /**
   * Stage commands, in `seq` order. `until` is how far the worker has run: every command
   * starting at or before `until` has been sent. `sentAt` is on the shared clock (milliseconds).
   */
  | {
      readonly type: 'commands';
      readonly commands: readonly StageCommand[];
      readonly until: Micros;
      readonly sentAt: number;
    }
  /** A function needs the scene; the worker waits for `answer` with the same `id`. */
  | { readonly type: 'ask'; readonly id: number; readonly query: StageQuery }
  /** The blocks running now, for highlighting during Rehearse (WP7.9). Sent when it changes. */
  | { readonly type: 'highlight'; readonly running: readonly NodeId[]; readonly at: Micros }
  | { readonly type: 'error'; readonly error: RuntimeError }
  /** The entry method has finished. Event handlers can still run until `stop`. */
  | { readonly type: 'finished'; readonly at: Micros }
  | { readonly type: 'stopped' };

/**
 * Why a run stopped with an error. The studio turns the code into plain words ("This loop never
 * ends, so StoryStage stopped it") and highlights `node` (WP6.3).
 */
export const RUNTIME_ERROR_CODES = [
  'infinite_loop',
  'recursion_limit',
  'time_slice',
  'stage',
  'bad_value',
  'protocol',
  'internal',
] as const;
export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

export interface RuntimeError {
  readonly code: RuntimeErrorCode;
  /** The block that was running, if there was one. */
  readonly node: NodeId | null;
  readonly at: Micros;
  /** For `stage` errors, the stage's own code. */
  readonly stageCode?: StageErrorCode;
  /** For developers and logs only; never shown to learners. */
  readonly detail?: string;
}

const TO_TYPES = new Set<string>([
  'load',
  'start',
  'advance',
  'pause',
  'resume',
  'speed',
  'stop',
  'event',
  'answer',
]);
const FROM_TYPES = new Set<string>([
  'ready',
  'loaded',
  'commands',
  'ask',
  'highlight',
  'error',
  'finished',
  'stopped',
]);

const hasType = (m: unknown, types: Set<string>): boolean =>
  typeof m === 'object' && m !== null && types.has((m as { type?: unknown }).type as string);

/** Checks the shape of a message from the main thread enough to dispatch on it safely. */
export function isToRuntime(m: unknown): m is ToRuntime {
  if (!hasType(m, TO_TYPES)) return false;
  const msg = m as { type: string; protocol?: unknown };
  return msg.type !== 'load' || msg.protocol === RUNTIME_PROTOCOL;
}

/** Checks the shape of a message from the worker enough to dispatch on it safely. */
export function isFromRuntime(m: unknown): m is FromRuntime {
  if (!hasType(m, FROM_TYPES)) return false;
  const msg = m as { type: string; protocol?: unknown };
  return msg.type !== 'ready' || msg.protocol === RUNTIME_PROTOCOL;
}

/** One end of a message channel: a worker, `self` inside one, or an in-memory port in tests. */
export interface Port<Out, In> {
  post(message: Out): void;
  /** Returns a function that stops listening. */
  listen(listener: (message: In) => void): () => void;
}

/**
 * Two connected ports with no worker, for tests and the self-test. Messages are
 * structured-cloned and delivered asynchronously, as `postMessage` does.
 */
export function inMemoryPorts(): {
  main: Port<ToRuntime, FromRuntime>;
  worker: Port<FromRuntime, ToRuntime>;
} {
  const toWorker = new Set<(m: ToRuntime) => void>();
  const toMain = new Set<(m: FromRuntime) => void>();
  const deliver = <T>(listeners: Set<(m: T) => void>, message: T) => {
    const copy = structuredClone(message);
    queueMicrotask(() => listeners.forEach((l) => l(copy)));
  };
  const port = <Out, In>(
    out: Set<(m: Out) => void>,
    inbox: Set<(m: In) => void>,
  ): Port<Out, In> => ({
    post: (m) => deliver(out, m),
    listen: (l) => {
      inbox.add(l);
      return () => inbox.delete(l);
    },
  });
  return { main: port(toWorker, toMain), worker: port(toMain, toWorker) };
}
