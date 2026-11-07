/**
 * How the interpreter reaches the Story API. WP4.3 (S3) supplies a `StoryLibrary` holding each
 * procedure and function; the runtime holds only the entries the catalog marks `runs: 'runtime'`.
 */
import type { NodeId } from '@storystage/ast';
import { micros, type Micros, type StageCommand } from '@storystage/story-api';
import { RuntimeFault, type Task } from './scheduler.ts';
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
