/**
 * Listeners (WP6.2, `docs/spec/02-story-api.md` section 6). The router starts what starts by
 * itself, matches stage events to listeners and applies `multipleEventPolicy`. The event kinds
 * marked `needs:` in the catalog have no stage event yet, so nothing fires them.
 */
import type { ListenerDecl, TypeDecl } from '@storystage/ast';
import { micros, type StageEvent } from '@storystage/story-api';
import type { Interpreter } from './interpreter.ts';
import { RuntimeFault, type Scheduler, type Task } from './scheduler.ts';
import { isEnumValue, sameValue, type ObjectValue, type Value } from './values.ts';

type Values = Readonly<Record<string, Value>>;

interface Armed {
  readonly listener: ListenerDecl;
  readonly args: Values;
  readonly details: Values;
  readonly policy: string;
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

const enumOf = (type: string, value: string): Value => ({ kind: 'enum', type, value });

const inSet = (set: Value | undefined, object: ObjectValue) =>
  Array.isArray(set) && set.some((v) => sameValue(v, object));

export class EventRouter {
  private readonly scheduler: Scheduler;
  private readonly interpreter: Interpreter;
  private readonly type: TypeDecl;
  private armed: Armed[] = [];

  constructor(scheduler: Scheduler, interpreter: Interpreter, type: TypeDecl) {
    this.scheduler = scheduler;
    this.interpreter = interpreter;
    this.type = type;
  }

  /** Reads every listener's arguments, then starts `sceneStart` listeners and timers. */
  *arm(): Task<void> {
    for (const listener of this.type.listeners) {
      const args = yield* this.interpreter.argumentValues(listener.args, this.type.id);
      const details = yield* this.interpreter.argumentValues(listener.details, this.type.id);
      const policy = details.multipleEventPolicy ?? null;
      this.armed.push({
        listener,
        args,
        details,
        policy: isEnumValue(policy) ? policy.value : 'ignore',
        running: 0,
        queue: [],
      });
    }
    for (const armed of this.armed) {
      if (armed.listener.event === 'sceneStart') this.trigger(armed, {});
      else if (armed.listener.event === 'timer') this.scheduler.spawn(this.timer(armed));
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
        this.click(event.object);
        break;
      case 'key':
        this.key(event.key);
        break;
      case 'collisionStart':
        this.pair('collisionStart', event.a, event.b, () => true);
        break;
      case 'proximityEnter':
        this.pair(
          'proximityEnter',
          event.a,
          event.b,
          (armed) => armed.args.distance === event.distance,
        );
        break;
    }
  }

  private click(name: string | null): void {
    this.each('clickOnScreen', (armed) => this.trigger(armed, { x: 0, y: 0 }));
    if (name === null) return;
    const model = this.object(name);
    this.each('clickOnObject', (armed) => {
      const { setOfVisuals } = armed.details;
      if (setOfVisuals === undefined || inSet(setOfVisuals, model))
        this.trigger(armed, { model, x: 0, y: 0 });
    });
  }

  private key(key: string): void {
    this.each('keyPress', (armed) => this.trigger(armed, { key: enumOf('Key', key) }));
    const digit = /^digit([0-9])$/.exec(key);
    if (digit) this.each('numberKeyPress', (a) => this.trigger(a, { number: Number(digit[1]) }));
    const arrow = Object.hasOwn(ARROWS, key) ? ARROWS[key]! : null;
    if (!arrow) return;
    this.each('arrowKeyPress', (armed) =>
      this.trigger(armed, {
        moveDirection: enumOf('MoveDirection', arrow.move),
        turnDirection: enumOf('TurnDirection', arrow.turn),
      }),
    );
    this.each('moveWithArrowKeys', (armed) => {
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
    });
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
