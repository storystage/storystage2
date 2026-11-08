/**
 * Listeners (WP6.2, `docs/spec/02-story-api.md` section 6). The router starts what starts by
 * itself, matches stage events to listeners, and applies `multipleEventPolicy` and
 * `heldKeyPolicy`. It also works out what the stage has to watch for proximity and view events
 * (`Stage.watch`), which `serve` sends the main thread (`docs/spec/18-runtime.md`, section 5).
 */
import type { ListenerDecl, NodeId, TypeDecl } from '@storystage/ast';
import {
  micros,
  objectId,
  type ObjectId,
  type StageEvent,
  type Watch,
} from '@storystage/story-api';
import type { Interpreter } from './interpreter.ts';
import { RuntimeFault, type Scheduler, type Task } from './scheduler.ts';
import { isEnumValue, isObjectValue, sameValue, type ObjectValue, type Value } from './values.ts';

type Values = Readonly<Record<string, Value>>;

interface Armed {
  readonly listener: ListenerDecl;
  readonly args: Values;
  readonly details: Values;
  readonly policy: string;
  /** For key events: `fireMultiple`, `fireOnceOnPress` or `fireOnceOnRelease`. */
  readonly held: string;
  running: number;
  readonly queue: Values[];
}

const ARROWS: Readonly<Record<string, { move: string; turn: string }>> = {
  up: { move: 'forward', turn: 'forward' },
  down: { move: 'backward', turn: 'backward' },
  left: { move: 'left', turn: 'left' },
  right: { move: 'right', turn: 'right' },
};

/** What one press of an arrow does under `moveWithArrowKeys`. */
const ARROW_MOVE = { amount: 0.25, turns: 0.0625, seconds: 0.25 } as const;

/** A press is the first `key` event for a key not already down; a repeat is one after it. */
type KeyPhase = 'press' | 'repeat' | 'release';

const enumOf = (type: string, value: string): Value => ({ kind: 'enum', type, value });

const enumValue = (value: Value | undefined, fallback: string) =>
  value !== undefined && isEnumValue(value) ? value.value : fallback;

const inSet = (set: Value | undefined, object: ObjectValue) =>
  Array.isArray(set) && set.some((v) => sameValue(v, object));

/** Whether a key listener with this `heldKeyPolicy` fires at this phase. */
function firesAt(held: string, phase: KeyPhase): boolean {
  switch (held) {
    case 'fireOnceOnPress':
      return phase === 'press';
    case 'fireOnceOnRelease':
      return phase === 'release';
    default:
      return phase !== 'release';
  }
}

export class EventRouter {
  private readonly scheduler: Scheduler;
  private readonly interpreter: Interpreter;
  private readonly type: TypeDecl;
  private readonly onWatch: (watches: readonly Watch[]) => void;
  private armed: Armed[] = [];
  private readonly down = new Set<string>();

  constructor(
    scheduler: Scheduler,
    interpreter: Interpreter,
    type: TypeDecl,
    onWatch: (watches: readonly Watch[]) => void = () => undefined,
  ) {
    this.scheduler = scheduler;
    this.interpreter = interpreter;
    this.type = type;
    this.onWatch = onWatch;
  }

  /**
   * Reads every listener's arguments, says what the stage must watch, then starts `sceneStart`
   * listeners and timers.
   */
  *arm(): Task<void> {
    for (const listener of this.type.listeners) {
      const args = yield* this.interpreter.argumentValues(listener.args, this.type.id);
      const details = yield* this.interpreter.argumentValues(listener.details, this.type.id);
      this.armed.push({
        listener,
        args,
        details,
        policy: enumValue(details.multipleEventPolicy, 'ignore'),
        held: enumValue(details.heldKeyPolicy, 'fireMultiple'),
        running: 0,
        queue: [],
      });
    }
    this.onWatch(this.armed.flatMap((armed) => this.watchOf(armed)));
    for (const armed of this.armed) {
      if (armed.listener.event === 'sceneStart') this.trigger(armed, {});
      else if (armed.listener.event === 'timer') this.scheduler.spawn(this.timer(armed));
    }
  }

  /** The names of the objects in one of a listener's sets. */
  private names(set: Value | undefined, node: NodeId): ObjectId[] {
    if (!Array.isArray(set) || !set.every(isObjectValue))
      throw new RuntimeFault('bad_value', node, 'A listener needs a list of objects.');
    return set.map((object) => objectId((object as ObjectValue).id));
  }

  private watchOf({ listener, args }: Armed): Watch[] {
    switch (listener.event) {
      case 'proximityEnter':
      case 'proximityExit': {
        const { distance } = args;
        if (typeof distance !== 'number' || distance < 0)
          throw new RuntimeFault('bad_value', listener.id, 'A distance is zero or more metres.');
        const a = this.names(args.setA, listener.id);
        const b = this.names(args.setB, listener.id);
        return [{ kind: 'proximity', a, b, distance }];
      }
      case 'viewEnter':
      case 'viewExit':
        return [{ kind: 'view', objects: this.names(args.set, listener.id) }];
      default:
        return [];
    }
  }

  private *timer(armed: Armed): Task<void> {
    const { seconds } = armed.args;
    if (typeof seconds !== 'number' || seconds <= 0)
      throw new RuntimeFault('bad_value', armed.listener.id, 'A timer needs a time above zero.');
    for (;;) {
      yield { kind: 'sleep', duration: micros(seconds) };
      this.trigger(armed, { seconds });
    }
  }

  private trigger(armed: Armed, values: Values): void {
    if (armed.running > 0 && armed.policy !== 'combine') {
      if (armed.policy === 'enqueue') armed.queue.push(values);
      return;
    }
    armed.running++;
    this.scheduler.spawn(this.handle(armed, values));
  }

  private *handle(armed: Armed, values: Values): Task<void> {
    yield* this.interpreter.runListener(armed.listener, this.type.id, values);
    armed.running--;
    const next = armed.queue.shift();
    if (next) this.trigger(armed, next);
  }

  private each(event: string, fire: (armed: Armed) => void): void {
    for (const armed of this.armed) if (armed.listener.event === event) fire(armed);
  }

  private object(name: string): ObjectValue {
    return this.interpreter.objectNamed(this.type.id, name);
  }

  /** Runs the listeners a stage event matches. */
  fire(event: StageEvent): void {
    switch (event.kind) {
      case 'click':
        this.click(event.object, event.x, event.y);
        break;
      case 'key': {
        const phase = this.down.has(event.key) ? 'repeat' : 'press';
        this.down.add(event.key);
        this.key(event.key, phase);
        break;
      }
      case 'keyRelease':
        this.down.delete(event.key);
        this.key(event.key, 'release');
        break;
      case 'collisionStart':
      case 'collisionEnd':
        this.pair(event.kind, event.a, event.b, () => true);
        break;
      case 'proximityEnter':
      case 'proximityExit':
        this.pair(event.kind, event.a, event.b, (armed) => armed.args.distance === event.distance);
        break;
      case 'viewEnter':
      case 'viewExit': {
        const model = this.object(event.object);
        this.each(event.kind, (armed) => {
          if (inSet(armed.args.set, model)) this.trigger(armed, { model });
        });
        break;
      }
    }
  }

  private click(name: string | null, x: number, y: number): void {
    this.each('clickOnScreen', (armed) => this.trigger(armed, { x, y }));
    if (name === null) return;
    const model = this.object(name);
    this.each('clickOnObject', (armed) => {
      const { setOfVisuals } = armed.details;
      if (setOfVisuals === undefined || inSet(setOfVisuals, model))
        this.trigger(armed, { model, x, y });
    });
  }

  /** Each key listener, if its `heldKeyPolicy` fires at this phase. */
  private keyed(event: string, phase: KeyPhase, values: Values): void {
    this.each(event, (armed) => {
      if (firesAt(armed.held, phase)) this.trigger(armed, values);
    });
  }

  private key(key: string, phase: KeyPhase): void {
    this.keyed('keyPress', phase, { key: enumOf('Key', key) });
    const digit = /^digit([0-9])$/.exec(key);
    if (digit) this.keyed('numberKeyPress', phase, { number: Number(digit[1]) });
    const arrow = Object.hasOwn(ARROWS, key) ? ARROWS[key]! : null;
    if (!arrow) return;
    this.keyed('arrowKeyPress', phase, {
      moveDirection: enumOf('MoveDirection', arrow.move),
      turnDirection: enumOf('TurnDirection', arrow.turn),
    });
    // Holding an arrow keeps the object going, as the browser repeats the key.
    if (phase !== 'release') this.each('moveWithArrowKeys', (armed) => this.arrowMove(armed, key));
  }

  private arrowMove(armed: Armed, key: string): void {
    const arrow = ARROWS[key]!;
    const forwards = key === 'up' || key === 'down';
    this.scheduler.spawn(
      this.interpreter.runStory(
        forwards ? 'move' : 'turn',
        armed.listener.id,
        armed.args.object ?? null,
        forwards
          ? { direction: enumOf('MoveDirection', arrow.move), amount: ARROW_MOVE.amount }
          : { direction: enumOf('TurnDirection', arrow.turn), amount: ARROW_MOVE.turns },
        { duration: ARROW_MOVE.seconds },
      ),
    );
  }

  private pair(event: string, a: string, b: string, also: (armed: Armed) => boolean): void {
    const first = this.object(a);
    const second = this.object(b);
    this.each(event, (armed) => {
      if (!also(armed)) return;
      const { setA, setB } = armed.args;
      if (inSet(setA, first) && inSet(setB, second)) this.trigger(armed, { a: first, b: second });
      else if (inSet(setA, second) && inSet(setB, first))
        this.trigger(armed, { a: second, b: first });
    });
  }
}
