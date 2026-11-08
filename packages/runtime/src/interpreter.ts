/**
 * The interpreter (WP6.1, 6.3, 6.5): walks the AST with Alice's semantics. Every statement and
 * expression is a generator, so a Story API call anywhere can wait for time or for the stage.
 * The rules it follows are in `docs/spec/18-runtime.md`.
 */
import {
  indexProgram,
  type Args,
  type AstNode,
  type Call,
  type Expression,
  type FieldDecl,
  type FunctionCall,
  type ListenerDecl,
  type Location,
  type MethodDecl,
  type NodeId,
  type Program,
  type Statement,
  type TypeRef,
} from '@storystage/ast';
import type { StageCommand } from '@storystage/story-api';
import { RuntimeFault, type Scheduler, type Task, type Thread } from './scheduler.ts';
import { RUNTIME_LIBRARY, sceneLibrary, type StoryContext, type StoryLibrary } from './story.ts';
import { isObjectValue, sameValue, valueText, type ObjectValue, type Value } from './values.ts';

/** What a program may do before StoryStage stops it (WP6.3, threat F7). */
export const LIMITS = {
  /** Turns of one loop with no time passing. */
  loopSpins: 100_000,
  /** Statements and loop turns at one moment of scene time, across every strand. */
  workAtOneTime: 1_000_000,
  /** Calls in progress in one strand. */
  callDepth: 200,
  /** Characters in one text. */
  textLength: 1_000_000,
} as const;

/** The object a scene's own code runs on. */
export const SCENE = 'scene';

export interface InterpreterOptions {
  readonly scheduler: Scheduler;
  /** The Story API. The runtime adds what it runs itself. */
  readonly library: StoryLibrary;
  readonly emit: (command: StageCommand) => void;
  /** Blocks switched off for this rehearsal (WP6.4), as well as those off in the program. */
  readonly disabled: readonly NodeId[];
  readonly seed: number;
  /** The production's scene ids, for the blocks that end a scene. */
  readonly scenes?: readonly string[];
}

/** Variables, with an enclosing frame for each-in-together's own copy of its item. */
class Frame {
  private readonly values = new Map<NodeId, Value>();
  readonly self: Value;
  readonly depth: number;
  private readonly outer: Frame | null;
  /** The frame of the call this belongs to, which a `return` ends. */
  readonly call: Frame;

  constructor(self: Value, depth: number, outer: Frame | null = null) {
    this.self = self;
    this.depth = depth;
    this.outer = outer;
    this.call = outer ? outer.call : this;
  }

  inner(): Frame {
    return new Frame(this.self, this.depth, this);
  }

  declare(id: NodeId, value: Value): void {
    this.values.set(id, value);
  }

  private holder(id: NodeId): Map<NodeId, Value> {
    if (this.values.has(id)) return this.values;
    if (this.outer) return this.outer.holder(id);
    throw new RuntimeFault('internal', id, 'A variable has no value.');
  }

  get(id: NodeId): Value {
    return this.holder(id).get(id)!;
  }

  set(id: NodeId, value: Value): void {
    this.holder(id).set(id, value);
  }
}

/** Thrown through the generators to the call it returns from. */
class ReturnSignal {
  readonly frame: Frame;
  readonly value: Value;
  constructor(frame: Frame, value: Value) {
    this.frame = frame;
    this.value = value;
  }
}

/** Mulberry32: small, and the same on every device. */
function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bad = (node: NodeId, detail: string) => new RuntimeFault('bad_value', node, detail);

function numberOf(value: Value, node: NodeId): number {
  if (typeof value !== 'number') throw bad(node, 'Expected a number.');
  return value;
}

function checked(value: number, node: NodeId): number {
  if (!Number.isFinite(value)) throw bad(node, 'The number is too big, or isn’t a number.');
  return value;
}

export class Interpreter {
  private readonly nodes: ReadonlyMap<NodeId, Location>;
  private readonly scheduler: Scheduler;
  private readonly library: StoryLibrary;
  private readonly emitCommand: (command: StageCommand) => void;
  private readonly disabled: ReadonlySet<NodeId>;
  private readonly random: () => number;
  /** Fields with a value of their own, by object and field. */
  private readonly fields = new Map<string, Value>();
  private seq = 0;
  private workTime = -1;
  private work = 0;

  constructor(program: Program, options: InterpreterOptions) {
    this.nodes = indexProgram(program);
    this.scheduler = options.scheduler;
    this.library = {
      ...RUNTIME_LIBRARY,
      ...options.library,
      ...sceneLibrary(options.scenes ?? []),
    };
    this.emitCommand = options.emit;
    this.disabled = new Set(options.disabled);
    this.random = seededRandom(options.seed);
  }

  /** The scene's value: the object its methods and listeners run on. */
  sceneObject(type: NodeId): ObjectValue {
    return { kind: 'object', id: SCENE, type };
  }

  /** Runs a method of a scene type: its script method, in the usual way. */
  *runMethod(id: NodeId): Task<void> {
    const parent = this.typeHolding(id);
    const method = this.declaration(id, 'method');
    yield* this.callMethod(method, this.sceneObject(parent), {}, new Frame(null, 0), id);
  }

  /** Runs a listener's handler, with the values the event gives it by parameter name. */
  *runListener(
    listener: ListenerDecl,
    type: NodeId,
    values: Readonly<Record<string, Value>>,
  ): Task<void> {
    const frame = new Frame(this.sceneObject(type), 0);
    for (const p of listener.params) frame.declare(p.id, values[p.name] ?? null);
    yield* this.block(listener.body, frame);
  }

  /** Runs a Story API call from outside the program: `moveWithArrowKeys`. */
  *runStory(
    name: string,
    node: NodeId,
    target: Value,
    args: Readonly<Record<string, Value>>,
    details: Readonly<Record<string, Value>>,
  ): Task<void> {
    if (target === null) throw bad(node, 'The call is on nothing.');
    if (!Object.hasOwn(this.library, name))
      throw new RuntimeFault('internal', node, `Nothing runs ${name} yet.`);
    yield* this.library[name]!({ node, target, name, args, details }, this.context());
  }

  /** The scene object of this name, as the stage's events call it. */
  objectNamed(type: NodeId, name: string): ObjectValue {
    const scene = this.declaration(type, 'type');
    const field = scene.fields.find((f) => f.name === name);
    return field ? this.objectOf(field.type, name) : { kind: 'object', id: name, type: null };
  }

  /** A listener's `args` or `details`, read when the run starts. */
  *argumentValues(args: Args, type: NodeId): Task<Record<string, Value>> {
    return yield* this.values(args, new Frame(this.sceneObject(type), 0));
  }

  private typeHolding(id: NodeId): NodeId {
    const parent = this.nodes.get(id)?.parent;
    if (!parent) throw new RuntimeFault('internal', id, 'The method has no type.');
    return parent;
  }

  private declaration<K extends AstNode['kind']>(id: NodeId, kind: K): AstNode & { kind: K } {
    const node = this.nodes.get(id)?.node;
    if (node?.kind !== kind) throw new RuntimeFault('internal', id, `There is no ${kind} ${id}.`);
    return node as AstNode & { kind: K };
  }

  private get thread(): Thread {
    return this.scheduler.current!;
  }

  /** Counts work at this moment of scene time, across every strand. */
  private tick(node: NodeId): void {
    if (this.workTime !== this.scheduler.now) {
      this.workTime = this.scheduler.now;
      this.work = 0;
    }
    if (++this.work > LIMITS.workAtOneTime)
      throw new RuntimeFault('time_slice', node, 'Too much work at one moment.');
  }

  /** A counter for one loop's turns: a loop that takes time can go on for ever. */
  private loopGuard(node: NodeId): () => void {
    let at = this.scheduler.now;
    let spins = 0;
    return () => {
      if (this.scheduler.now !== at) {
        at = this.scheduler.now;
        spins = 0;
      }
      this.tick(node);
      if (++spins > LIMITS.loopSpins)
        throw new RuntimeFault('infinite_loop', node, 'A loop goes round without taking any time.');
    };
  }

  private isOff(s: Statement): boolean {
    return s.enabled === false || this.disabled.has(s.id);
  }

  private *block(body: readonly Statement[], frame: Frame): Task<void> {
    for (const s of body) yield* this.statement(s, frame);
  }

  private *together(tasks: readonly Task<unknown>[]): Task<void> {
    yield { kind: 'join', threads: tasks.map((t) => this.scheduler.spawn(t)) };
  }

  private *listOf(items: Expression, frame: Frame, node: NodeId): Task<Value[]> {
    const list = yield* this.value(items, frame);
    if (!Array.isArray(list)) throw bad(node, 'Expected a list.');
    return list;
  }

  private *statement(s: Statement, frame: Frame): Task<void> {
    if (this.isOff(s)) return;
    this.tick(s.id);
    switch (s.kind) {
      case 'doInOrder':
        yield* this.block(s.body, frame);
        return;
      case 'doTogether':
        yield* this.together(s.body.map((child) => this.statement(child, frame)));
        return;
      case 'count': {
        const times = yield* this.value(s.times, frame);
        if (typeof times !== 'number' || !Number.isInteger(times) || times < 0)
          throw bad(s.id, 'Count needs a whole number, zero or more.');
        const guard = this.loopGuard(s.id);
        for (let i = 0; i < times; i++) {
          guard();
          yield* this.block(s.body, frame);
        }
        return;
      }
      case 'while': {
        const guard = this.loopGuard(s.id);
        for (;;) {
          guard();
          if (!(yield* this.condition(s.condition, frame))) return;
          yield* this.block(s.body, frame);
        }
      }
      case 'forEach': {
        const guard = this.loopGuard(s.id);
        const inner = frame.inner();
        for (const item of yield* this.listOf(s.items, frame, s.id)) {
          guard();
          inner.declare(s.item.id, item);
          yield* this.block(s.body, inner);
        }
        return;
      }
      case 'eachTogether': {
        const items = yield* this.listOf(s.items, frame, s.id);
        yield* this.together(
          items.map((item) => {
            const inner = frame.inner();
            inner.declare(s.item.id, item);
            return this.block(s.body, inner);
          }),
        );
        return;
      }
      case 'if':
        yield* this.block((yield* this.condition(s.condition, frame)) ? s.then : s.else, frame);
        return;
      case 'local':
        frame.declare(s.id, yield* this.value(s.value, frame));
        return;
      case 'assign':
        yield* this.assign(s.target, yield* this.value(s.value, frame), frame, s.id);
        return;
      case 'comment':
        return;
      case 'call':
        this.thread.running = s.id;
        yield* this.call(s, frame);
        this.thread.running = null;
        return;
      case 'return':
        throw new ReturnSignal(frame.call, s.value ? yield* this.value(s.value, frame) : null);
    }
  }

  private *condition(e: Expression, frame: Frame): Task<boolean> {
    const value = yield* this.value(e, frame);
    if (typeof value !== 'boolean') throw bad(e.id, 'Expected true or false.');
    return value;
  }

  private *assign(target: Expression, value: Value, frame: Frame, node: NodeId): Task<void> {
    switch (target.kind) {
      case 'variableRef':
        frame.set(target.variable, value);
        return;
      case 'fieldRef': {
        const object = yield* this.value(target.target, frame);
        if (!isObjectValue(object)) throw bad(node, 'Only an object has fields.');
        this.fields.set(`${object.id}/${target.field}`, value);
        return;
      }
      case 'arrayItem': {
        const list = yield* this.value(target.array, frame);
        const index = yield* this.value(target.index, frame);
        if (!Array.isArray(list) || !this.inList(list, index))
          throw bad(node, 'No such place in the list.');
        list[index as number] = value;
        return;
      }
      default:
        throw new RuntimeFault('internal', node, `Can't assign to a ${target.kind}.`);
    }
  }

  private inList(list: readonly Value[], index: Value): boolean {
    return (
      typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < list.length
    );
  }

  private *values(args: Args, frame: Frame): Task<Record<string, Value>> {
    const out: Record<string, Value> = {};
    for (const key of Object.keys(args).sort()) out[key] = yield* this.value(args[key]!, frame);
    return out;
  }

  private context(): StoryContext {
    return {
      now: this.scheduler.now,
      emit: (command) =>
        this.emitCommand({
          ...command,
          seq: this.seq++,
          start: this.scheduler.now,
        } as StageCommand),
      random: this.random,
    };
  }

  private *call(node: Call | FunctionCall, frame: Frame): Task<Value> {
    const target = yield* this.value(node.target, frame);
    if (target === null) throw bad(node.id, 'The call is on nothing.');
    if (node.callee.kind === 'user') {
      const method = this.declaration(node.callee.method, 'method');
      return yield* this.callMethod(method, target, node.args, frame, node.id);
    }
    const { name } = node.callee;
    if (!Object.hasOwn(this.library, name))
      throw new RuntimeFault('internal', node.id, `Nothing runs ${name} yet.`);
    const args = yield* this.values(node.args, frame);
    const details = yield* this.values(node.details, frame);
    return yield* this.library[name]!(
      { node: node.id, target, name, args, details },
      this.context(),
    );
  }

  private *callMethod(
    method: MethodDecl,
    self: Value,
    args: Args,
    caller: Frame,
    node: NodeId,
  ): Task<Value> {
    if (caller.depth >= LIMITS.callDepth)
      throw new RuntimeFault('recursion_limit', node, `${method.name} calls itself too deeply.`);
    const frame = new Frame(self, caller.depth + 1);
    for (const p of method.params)
      frame.declare(
        p.id,
        Object.hasOwn(args, p.id)
          ? yield* this.value(args[p.id]!, caller)
          : yield* this.value(p.default!, frame),
      );
    try {
      yield* this.block(method.body, frame);
    } catch (e) {
      if (e instanceof ReturnSignal && e.frame === frame) return e.value;
      throw e;
    }
    if (method.returns !== null) throw bad(node, `${method.name} ended without a return.`);
    return null;
  }

  private objectOf(type: TypeRef, name: string): ObjectValue {
    return { kind: 'object', id: name, type: type.kind === 'user' ? type.type : null };
  }

  private *field(object: Value, field: FieldDecl, node: NodeId): Task<Value> {
    if (!isObjectValue(object)) throw bad(node, 'Only an object has fields.');
    const key = `${object.id}/${field.id}`;
    if (this.fields.has(key)) return this.fields.get(key)!;
    // A field with no value of its own is an object in the scene's set-up.
    if (field.initial === null) return this.objectOf(field.type, field.name);
    const value = yield* this.value(field.initial, new Frame(object, 0));
    this.fields.set(key, value);
    return value;
  }

  private *value(e: Expression, frame: Frame): Task<Value> {
    switch (e.kind) {
      case 'number':
      case 'wholeNumber':
      case 'boolean':
      case 'text':
        return e.value;
      case 'none':
        return null;
      case 'enum':
        return { kind: 'enum', type: e.type, value: e.value };
      case 'this':
        return frame.self;
      case 'variableRef':
        return frame.get(e.variable);
      case 'fieldRef':
        return yield* this.field(
          yield* this.value(e.target, frame),
          this.declaration(e.field, 'field'),
          e.id,
        );
      case 'functionCall':
        return yield* this.call(e, frame);
      case 'arithmetic': {
        const left = numberOf(yield* this.value(e.left, frame), e.id);
        const right = numberOf(yield* this.value(e.right, frame), e.id);
        if ((e.op === 'divide' || e.op === 'remainder') && right === 0)
          throw bad(e.id, 'Can’t divide by zero.');
        return checked(ARITHMETIC[e.op](left, right), e.id);
      }
      case 'compare': {
        const left = yield* this.value(e.left, frame);
        const right = yield* this.value(e.right, frame);
        if (e.op === 'equal') return sameValue(left, right);
        if (e.op === 'notEqual') return !sameValue(left, right);
        return ORDER[e.op](numberOf(left, e.id), numberOf(right, e.id));
      }
      case 'logic': {
        const left = yield* this.condition(e.left, frame);
        if (e.op === 'and' ? !left : left) return left;
        return yield* this.condition(e.right, frame);
      }
      case 'not':
        return !(yield* this.condition(e.value, frame));
      case 'join': {
        const left = valueText(yield* this.value(e.left, frame));
        const right = valueText(yield* this.value(e.right, frame));
        if (left.length + right.length > LIMITS.textLength)
          throw bad(e.id, 'The text is too long.');
        return left + right;
      }
      case 'arrayOf': {
        const items: Value[] = [];
        for (const item of e.items) items.push(yield* this.value(item, frame));
        return items;
      }
      case 'arrayItem': {
        const list = yield* this.value(e.array, frame);
        const index = yield* this.value(e.index, frame);
        if (!Array.isArray(list) || !this.inList(list, index))
          throw bad(e.id, 'No such place in the list.');
        return list[index as number]!;
      }
      case 'arrayLength': {
        const list = yield* this.value(e.array, frame);
        if (!Array.isArray(list)) throw bad(e.id, 'Expected a list.');
        return list.length;
      }
    }
  }
}

const ARITHMETIC = {
  add: (a: number, b: number) => a + b,
  subtract: (a: number, b: number) => a - b,
  multiply: (a: number, b: number) => a * b,
  divide: (a: number, b: number) => a / b,
  remainder: (a: number, b: number) => a % b,
} as const;

const ORDER = {
  less: (a: number, b: number) => a < b,
  lessOrEqual: (a: number, b: number) => a <= b,
  greater: (a: number, b: number) => a > b,
  greaterOrEqual: (a: number, b: number) => a >= b,
} as const;
