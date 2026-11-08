/**
 * How the interpreter reaches the Story API. WP4.3 (S3) supplies a `StoryLibrary` holding each
 * procedure and function; the runtime holds only the entries the catalog marks `runs: 'runtime'`.
 */
import type { NodeId } from '@storystage/ast';
import { micros, type Micros, type StageCommand } from '@storystage/story-api';
import type { RuntimeSceneEnding } from './messages.ts';
import { EndRun, RuntimeFault, type Task } from './scheduler.ts';
import type { Value } from './values.ts';

export interface StoryCall {
  readonly node: NodeId;
  readonly target: Value;
  readonly name: string;
  readonly args: Readonly<Record<string, Value>>;
  readonly details: Readonly<Record<string, Value>>;
}

type WithoutTiming<T> = T extends unknown ? Omit<T, 'seq' | 'start'> : never;

export interface StoryContext {
  /** Scene time. */
  readonly now: Micros;
  /** Sends a stage command starting now. */
  emit(command: WithoutTiming<StageCommand>): void;
  /** From the run's seed, so deterministic runs repeat (WP6.5): 0 up to, but not including, 1. */
  random(): number;
}

/** One procedure or function: emits commands, sleeps, asks the stage, returns its value. */
export type StoryFunction = (call: StoryCall, context: StoryContext) => Task<Value>;

export type StoryLibrary = Readonly<Record<string, StoryFunction>>;

/** The entries that need no stage. */
export const RUNTIME_LIBRARY: StoryLibrary = {
  *delay(call) {
    const seconds = call.args.duration;
    if (typeof seconds !== 'number' || seconds < 0)
      throw new RuntimeFault('bad_value', call.node, 'delay needs a duration of zero or more.');
    yield { kind: 'sleep', duration: micros(seconds) };
    return null;
  },
};

/** The catalog's default for `duration`. */
const DEFAULT_SECONDS = 1;

/**
 * `goToScene`, `crossfade` and `fadeToBlack` (WP8.3): each ends the whole run at once, so no
 * more of this scene's code runs, and `serve` tells the player which one ran. They throw rather
 * than yield, so nothing else gets a turn first.
 */
export function sceneLibrary(scenes: readonly string[]): StoryLibrary {
  const known = new Set(scenes);
  const scene = (call: StoryCall): string => {
    const value = call.args.scene;
    if (typeof value !== 'string' || !known.has(value))
      throw new RuntimeFault('bad_value', call.node, 'There is no such scene.');
    return value;
  };
  const duration = (call: StoryCall) => {
    const seconds = call.details.duration ?? DEFAULT_SECONDS;
    if (typeof seconds !== 'number' || seconds < 0)
      throw new RuntimeFault('bad_value', call.node, 'A duration is zero or more.');
    return micros(seconds);
  };
  const end = (ending: RuntimeSceneEnding): never => {
    throw new EndRun(ending);
  };
  return {
    goToScene: (call) => end({ kind: 'goToScene', scene: scene(call) }),
    crossfade: (call) => end({ kind: 'crossfade', scene: scene(call), duration: duration(call) }),
    fadeToBlack: (call) => end({ kind: 'fadeToBlack', duration: duration(call) }),
  };
}
