/**
 * What a Story API block is to the runtime (`@storystage/runtime`, `story.ts`). The runtime
 * depends on this package, so these can't import its types; they have the same shape instead,
 * and TypeScript accepts `STORY_LIBRARY` wherever the runtime wants a `StoryLibrary`.
 */
import type { NodeId } from '@storystage/ast';
import type { StageCommand, StageQuery } from '../stage-commands.ts';
import type { Micros } from '../vocabulary.ts';

/** An object in the scene, or the scene itself. `type` is its class, if it's a learner's own. */
export interface ObjectValue {
  readonly kind: 'object';
  readonly id: string;
  readonly type: NodeId | null;
}

export interface EnumValue {
  readonly kind: 'enum';
  readonly type: string;
  readonly value: string;
}

/**
 * One of an object's joints, from `getJoint` or `getJointChain` (spec 02, section 5). A joint
 * turns, rolls and points, but doesn't move (decision 0051), and can be a target.
 */
export interface JointValue {
  readonly kind: 'joint';
  /** The object it belongs to. */
  readonly object: string;
  readonly joint: string;
}

/** What a running program holds in its variables (`docs/spec/18-runtime.md`, section 2). */
export type Value =
  number | string | boolean | null | ObjectValue | EnumValue | JointValue | Value[];

/** One call of a block: what it's called on, and its arguments and details by name. */
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
  /** From the run's seed: 0 up to, but not including, 1. */
  random(): number;
}

/** What a block can wait for: some scene time, or the stage's answer to a question. */
export type StoryWait =
  | { readonly kind: 'sleep'; readonly duration: Micros }
  | { readonly kind: 'ask'; readonly query: StageQuery };

/** One block: sends commands, waits, asks the stage, and gives back its value. */
export type StoryFunction = (
  call: StoryCall,
  context: StoryContext,
) => Generator<StoryWait, Value, unknown>;

export type StoryLibrary = Readonly<Record<string, StoryFunction>>;

/**
 * A value a block can't use: out of its range, or of the wrong kind. The runtime reports it as
 * a `bad_value` fault at the block. `detail` is for developers, never shown to learners.
 */
export class StoryFault extends Error {
  readonly code = 'bad_value';
  constructor(detail: string) {
    super(detail);
    this.name = 'StoryFault';
  }
}
