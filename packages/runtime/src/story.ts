/**
 * How the interpreter reaches the Story API. WP4.3 (S3) supplies a `StoryLibrary` holding each
 * procedure and function; the runtime holds only the entries the catalog marks `runs: 'runtime'`.
 */
import type { NodeId } from '@storystage/ast';
import {
  ENUMS,
  micros,
  objectId,
  type Micros,
  type StageCommand,
  type StageQuery,
  type StageQueryResult,
} from '@storystage/story-api';
import type { RuntimeSceneEnding } from './messages.ts';
import { EndRun, RuntimeFault, type Task } from './scheduler.ts';
import { isEnumValue, isObjectValue, type JointValue, type Value } from './values.ts';

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

type JointChain = (StageQuery & { readonly kind: 'jointChain' })['chain'];

/** The object a joint function is called on. */
function jointed(call: StoryCall): string {
  if (!isObjectValue(call.target))
    throw new RuntimeFault('bad_value', call.node, `${call.name} needs a model with joints.`);
  return call.target.id;
}

/** An argument that must be one of an enumeration's values. */
function choice(call: StoryCall, name: string, type: string): string {
  const value = call.args[name];
  if (value === undefined || !isEnumValue(value) || value.type !== type)
    throw new RuntimeFault('bad_value', call.node, `${name} must be a ${type}.`);
  return value.value;
}

/**
 * `getJoint` and `getJointChain` (spec 02 section 5): a joint is its object and its name, which
 * the Story API's blocks turn, roll and point. `getJoint` doesn't ask the stage: a joint the
 * model hasn't got is the stage's `unknown_joint` when a block uses it (and the editor's
 * `noSuchJoint` before that). `getJointChain` asks the stage which joints the chain has.
 */
export const JOINT_LIBRARY: StoryLibrary = {
  // eslint-disable-next-line require-yield
  *getJoint(call) {
    const joint: JointValue = {
      kind: 'joint',
      object: jointed(call),
      joint: choice(call, 'joint', 'JointId'),
    };
    return joint;
  },
  *getJointChain(call, context) {
    const object = jointed(call);
    const chain = choice(call, 'chain', 'JointChain');
    if (!(ENUMS.JointChain as readonly string[]).includes(chain))
      throw new RuntimeFault('bad_value', call.node, 'chain must be neck or tail.');
    const query: StageQuery = {
      kind: 'jointChain',
      object: objectId(object),
      chain: chain as JointChain,
      at: context.now,
    };
    const answer = (yield { kind: 'ask', query }) as StageQueryResult;
    if (answer.kind !== 'jointChain')
      throw new RuntimeFault('protocol', call.node, `The stage answered ${answer.kind}.`);
    return answer.value.map((joint): JointValue => ({ kind: 'joint', object, joint }));
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
