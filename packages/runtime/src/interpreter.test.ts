import {
  nodeId,
  validateProgram,
  type Expression,
  type FieldDecl,
  type MethodDecl,
  type NodeId,
  type ParameterDecl,
  type Program,
  type Statement,
  type TypeDecl,
  type TypeRef,
} from '@storystage/ast';
import { micros, objectId, type StageCommand } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { Interpreter, LIMITS } from './interpreter.ts';
import { Scheduler, type RuntimeFault } from './scheduler.ts';
import type { StoryLibrary } from './story.ts';
import { objectName } from './values.ts';

// ---- A tiny way to write programs ------------------------------------------------------------

let counter = 0;
const id = (): NodeId => nodeId(`n${(counter++).toString(36).padStart(5, '0')}`);
const NUMBER: TypeRef = { kind: 'story', name: 'Number' };
const TEXT: TypeRef = { kind: 'story', name: 'Text' };

const num = (value: number): Expression => ({ id: id(), kind: 'number', value });
const whole = (value: number): Expression => ({ id: id(), kind: 'wholeNumber', value });
const text = (value: string): Expression => ({ id: id(), kind: 'text', value });
const bool = (value: boolean): Expression => ({ id: id(), kind: 'boolean', value });
const none = (): Expression => ({ id: id(), kind: 'none' });
const self = (): Expression => ({ id: id(), kind: 'this' });
const ref = (variable: { id: NodeId }): Expression => ({
  id: id(),
  kind: 'variableRef',
  variable: variable.id,
});
const field = (f: { id: NodeId }, target: Expression = self()): Expression => ({
  id: id(),
  kind: 'fieldRef',
  target,
  field: f.id,
});
const arith = (
  op: 'add' | 'subtract' | 'multiply' | 'divide' | 'remainder',
  l: Expression,
  r: Expression,
): Expression => ({
  id: id(),
  kind: 'arithmetic',
  op,
  left: l,
  right: r,
});
const less = (l: Expression, r: Expression): Expression => ({
  id: id(),
  kind: 'compare',
  op: 'less',
  left: l,
  right: r,
});
const equal = (l: Expression, r: Expression): Expression => ({
  id: id(),
  kind: 'compare',
  op: 'equal',
  left: l,
  right: r,
});
const list = (...items: Expression[]): Expression => ({
  id: id(),
  kind: 'arrayOf',
  of: NUMBER,
  items,
});

const CAT: FieldDecl = {
  id: nodeId('catfld'),
  kind: 'field',
  name: 'cat',
  type: { kind: 'story', name: 'Quadruped' },
  initial: null,
};
const DOG: FieldDecl = { ...CAT, id: nodeId('dogfld'), name: 'dog' };
const SCORE: FieldDecl = {
  id: nodeId('scorfd'),
  kind: 'field',
  name: 'score',
  type: NUMBER,
  initial: num(10),
};

/** `object.say(value)`, one second by default. */
const say = (object: FieldDecl, value: Expression, seconds?: number): Statement => ({
  id: id(),
  kind: 'call',
  target: field(object),
  callee: { kind: 'story', name: 'say' },
  args: { text: value },
  details: seconds === undefined ? {} : { duration: num(seconds) },
});
const local = (name: string, value: Expression, type: TypeRef = NUMBER) =>
  ({ id: id(), kind: 'local', name, type, value }) as const;
const assign = (target: Expression, value: Expression): Statement => ({
  id: id(),
  kind: 'assign',
  target,
  value,
});
const loopItem = (name: string) => ({ id: id(), kind: 'loopItem', name, type: NUMBER }) as const;
const together = (...body: Statement[]): Statement => ({ id: id(), kind: 'doTogether', body });
const inOrder = (...body: Statement[]): Statement => ({ id: id(), kind: 'doInOrder', body });

const MAIN = nodeId('mainmt');

function program(body: readonly Statement[], methods: readonly MethodDecl[] = []): Program {
  const scene: TypeDecl = {
    id: nodeId('scenet'),
    kind: 'type',
    name: 'Scene1',
    extends: { kind: 'story', name: 'Scene' },
    fields: [CAT, DOG, SCORE],
    methods: [
      { id: MAIN, kind: 'method', name: 'myFirstMethod', returns: null, params: [], body },
      ...methods,
    ],
    listeners: [],
  };
  return { schemaVersion: '1.0.0', types: [scene] };
}

const method = (
  name: string,
  params: readonly ParameterDecl[],
  body: readonly Statement[],
  returns: TypeRef | null = null,
): MethodDecl => ({ id: id(), kind: 'method', name, returns, params, body });
const param = (name: string, fallback: Expression | null = null): ParameterDecl => ({
  id: id(),
  kind: 'parameter',
  name,
  type: NUMBER,
  default: fallback,
});
const callUser = (m: MethodDecl, args: Readonly<Record<string, Expression>> = {}): Statement => ({
  id: id(),
  kind: 'call',
  target: self(),
  callee: { kind: 'user', method: m.id },
  args,
  details: {},
});
const callValue = (m: MethodDecl, args: Readonly<Record<string, Expression>> = {}): Expression => ({
  id: id(),
  kind: 'functionCall',
  target: self(),
  callee: { kind: 'user', method: m.id },
  args,
  details: {},
});

// ---- Running them ----------------------------------------------------------------------------

/** A stand-in for WP4.3: `say` emits a command and takes its duration. */
const library: StoryLibrary = {
  *say(call, context) {
    const seconds = (call.details.duration as number | undefined) ?? 1;
    const duration = micros(seconds);
    context.emit({
      kind: 'say',
      object: objectId(objectName(call.target)),
      duration,
      style: 'beginAndEndGently',
      text: String(call.args.text),
      bubble: 'say',
    });
    yield { kind: 'sleep', duration };
    return null;
  },
  *getDistanceTo(call, context) {
    const answer = yield {
      kind: 'ask',
      query: {
        kind: 'distance',
        from: objectId(objectName(call.target)),
        to: objectId('dog'),
        at: context.now,
      },
    };
    return answer as number;
  },
};

interface Result {
  /** `time:object says text`. */
  readonly said: readonly string[];
  readonly commands: readonly StageCommand[];
  readonly fault: RuntimeFault | null;
}

function run(
  p: Program,
  options: { disabled?: readonly NodeId[]; until?: number; seed?: number } = {},
): Result {
  expect(validateProgram(p)).toEqual([]);
  const commands: StageCommand[] = [];
  let fault: RuntimeFault | null = null;
  const scheduler = new Scheduler({ onFault: (f) => (fault = f) });
  const interpreter = new Interpreter(p, {
    scheduler,
    library,
    emit: (c) => commands.push(c),
    disabled: options.disabled ?? [],
    seed: options.seed ?? 1,
  });
  scheduler.spawn(interpreter.runMethod(MAIN));
  for (let i = 0; i < 100; i++) {
    const result = scheduler.runUntil(options.until ?? micros(1000));
    if (result.kind !== 'asking') break;
    scheduler.answer(2.5);
  }
  const said = commands.flatMap((c) =>
    c.kind === 'say' ? [`${c.start / 1_000_000}:${c.object} ${c.text}`] : [],
  );
  return { said, commands, fault };
}

const lines = (body: readonly Statement[], methods: readonly MethodDecl[] = []) =>
  run(program(body, methods)).said;

const faultOf = (body: readonly Statement[], methods: readonly MethodDecl[] = []) =>
  run(program(body, methods)).fault?.code;

// ---- Semantics -------------------------------------------------------------------------------

describe('do in order and do together', () => {
  it('runs statements one after the other, each taking its time', () => {
    expect(lines([say(CAT, text('a')), say(DOG, text('b'), 2), say(CAT, text('c'))])).toEqual([
      '0:cat a',
      '1:dog b',
      '3:cat c',
    ]);
  });

  it('do together starts everything at once and ends with the longest', () => {
    expect(
      lines([together(say(CAT, text('a'), 1), say(DOG, text('b'), 3)), say(CAT, text('next'))]),
    ).toEqual(['0:cat a', '0:dog b', '3:cat next']);
  });

  it('nests', () => {
    expect(
      lines([
        together(inOrder(say(CAT, text('a')), say(CAT, text('b'))), say(DOG, text('c'), 0.5)),
        say(CAT, text('d')),
      ]),
    ).toEqual(['0:cat a', '0:dog c', '1:cat b', '2:cat d']);
  });

  it('an empty do together takes no time', () => {
    expect(lines([together(), say(CAT, text('a'))])).toEqual(['0:cat a']);
  });
});

describe('loops', () => {
  it('count repeats its body', () => {
    expect(
      lines([{ id: id(), kind: 'count', times: whole(3), body: [say(CAT, text('a'))] }]),
    ).toEqual(['0:cat a', '1:cat a', '2:cat a']);
  });

  it('count of zero runs nothing', () => {
    expect(
      lines([{ id: id(), kind: 'count', times: whole(0), body: [say(CAT, text('a'))] }]),
    ).toEqual([]);
  });

  it('refuses a count that is not a whole number at or above zero', () => {
    for (const times of [num(1.5), num(-1), text('a')])
      expect(faultOf([{ id: id(), kind: 'count', times, body: [] }])).toBe('bad_value');
  });

  it('while re-reads its condition each time', () => {
    const n = local('n', num(0));
    expect(
      lines([
        n,
        {
          id: id(),
          kind: 'while',
          condition: less(ref(n), num(2)),
          body: [say(CAT, ref(n)), assign(ref(n), arith('add', ref(n), num(1)))],
        },
      ]),
    ).toEqual(['0:cat 0', '1:cat 1']);
  });

  it('for each runs in order, one item at a time', () => {
    const item = loopItem('x');
    expect(
      lines([
        {
          id: id(),
          kind: 'forEach',
          item,
          items: list(num(5), num(6)),
          body: [say(CAT, ref(item))],
        },
      ]),
    ).toEqual(['0:cat 5', '1:cat 6']);
  });

  it('each in together runs every item at once', () => {
    const item = loopItem('x');
    expect(
      lines([
        {
          id: id(),
          kind: 'eachTogether',
          item,
          items: list(num(5), num(6)),
          body: [say(CAT, ref(item))],
        },
        say(DOG, text('after')),
      ]),
    ).toEqual(['0:cat 5', '0:cat 6', '1:dog after']);
  });

  it('refuses a list that is not a list', () => {
    const item = loopItem('x');
    expect(faultOf([{ id: id(), kind: 'forEach', item, items: num(1), body: [] }])).toBe(
      'bad_value',
    );
  });
});

describe('if', () => {
  const branch = (condition: Expression): Statement => ({
    id: id(),
    kind: 'if',
    condition,
    then: [say(CAT, text('yes'))],
    else: [say(CAT, text('no'))],
  });

  it('takes one branch', () => {
    expect(lines([branch(bool(true))])).toEqual(['0:cat yes']);
    expect(lines([branch(bool(false))])).toEqual(['0:cat no']);
  });

  it('wants a true or false', () => {
    expect(faultOf([branch(num(1))])).toBe('bad_value');
  });

  it('short-circuits and and or, as Alice does', () => {
    const boom = arith('divide', num(1), num(0));
    const andFalse: Expression = {
      id: id(),
      kind: 'logic',
      op: 'and',
      left: bool(false),
      right: equal(boom, num(1)),
    };
    const orTrue: Expression = {
      id: id(),
      kind: 'logic',
      op: 'or',
      left: bool(true),
      right: equal(boom, num(1)),
    };
    expect(lines([branch(andFalse)])).toEqual(['0:cat no']);
    expect(lines([branch(orTrue)])).toEqual(['0:cat yes']);
  });
});

describe('values', () => {
  const show = (e: Expression) => lines([say(CAT, e)])[0]!.slice('0:cat '.length);

  it('does arithmetic', () => {
    expect(show(arith('add', num(2), num(3)))).toBe('5');
    expect(show(arith('subtract', num(2), num(3)))).toBe('-1');
    expect(show(arith('multiply', num(2), num(3)))).toBe('6');
    expect(show(arith('divide', num(3), num(2)))).toBe('1.5');
    expect(show(arith('remainder', num(7), num(3)))).toBe('1');
  });

  it('refuses dividing by zero, and arithmetic on anything but numbers', () => {
    expect(faultOf([say(CAT, arith('divide', num(1), num(0)))])).toBe('bad_value');
    expect(faultOf([say(CAT, arith('remainder', num(1), num(0)))])).toBe('bad_value');
    expect(faultOf([say(CAT, arith('add', text('a'), num(0)))])).toBe('bad_value');
  });

  it('refuses a number too big to be a number', () => {
    expect(faultOf([say(CAT, arith('multiply', num(1e308), num(10)))])).toBe('bad_value');
  });

  it('compares numbers, and anything for equality', () => {
    expect(show(less(num(1), num(2)))).toBe('true');
    expect(show(equal(text('a'), text('a')))).toBe('true');
    expect(show(equal(field(CAT), field(CAT)))).toBe('true');
    expect(show(equal(field(CAT), field(DOG)))).toBe('false');
    expect(show(equal(none(), none()))).toBe('true');
    const a: Expression = { id: id(), kind: 'enum', type: 'MoveDirection', value: 'forward' };
    const b: Expression = { id: id(), kind: 'enum', type: 'MoveDirection', value: 'forward' };
    expect(show(equal(a, b))).toBe('true');
    expect(faultOf([say(CAT, less(text('a'), num(2)))])).toBe('bad_value');
  });

  it('joins text and shows values as words', () => {
    const join = (l: Expression, r: Expression): Expression => ({
      id: id(),
      kind: 'join',
      left: l,
      right: r,
    });
    expect(show(join(text('a'), num(1)))).toBe('a1');
    expect(show(join(field(CAT), bool(true)))).toBe('cattrue');
  });

  it('stops text growing without end', () => {
    const t = local('t', text('x'.repeat(1000)), TEXT);
    const grow: Statement = {
      id: id(),
      kind: 'count',
      times: whole(40),
      body: [assign(ref(t), { id: id(), kind: 'join', left: ref(t), right: ref(t) })],
    };
    expect(faultOf([t, grow])).toBe('bad_value');
  });

  it('reads and writes list items, and refuses going off the end', () => {
    const l = local('l', list(num(1), num(2)));
    const item = (i: number): Expression => ({
      id: id(),
      kind: 'arrayItem',
      array: ref(l),
      index: whole(i),
    });
    const length: Expression = { id: id(), kind: 'arrayLength', array: ref(l) };
    expect(lines([l, assign(item(1), num(9)), say(CAT, item(1)), say(CAT, length)])).toEqual([
      '0:cat 9',
      '1:cat 2',
    ]);
    expect(faultOf([l, say(CAT, item(2))])).toBe('bad_value');
    expect(faultOf([l, assign(item(5), num(1))])).toBe('bad_value');
  });

  it('calculates a not', () => {
    expect(show({ id: id(), kind: 'not', value: bool(false) })).toBe('true');
    expect(faultOf([say(CAT, { id: id(), kind: 'not', value: num(1) })])).toBe('bad_value');
  });
});

describe('fields', () => {
  it('start at their value, and keep what is assigned', () => {
    expect(
      lines([
        say(CAT, field(SCORE)),
        assign(field(SCORE), arith('add', field(SCORE), num(1))),
        say(CAT, field(SCORE)),
      ]),
    ).toEqual(['0:cat 10', '1:cat 11']);
  });

  it('a scene object can be changed for another', () => {
    expect(lines([assign(field(CAT), field(DOG)), say(CAT, text('a'))])).toEqual(['0:dog a']);
  });
});

describe('procedures and functions', () => {
  it('calls a procedure, with its parameters in its own scope', () => {
    const p = param('n');
    const hop = method('hop', [p], [say(CAT, ref(p))]);
    expect(lines([callUser(hop, { [p.id]: num(7) }), say(DOG, text('after'))], [hop])).toEqual([
      '0:cat 7',
      '1:dog after',
    ]);
  });

  it('uses a default for a parameter left out', () => {
    const p = param('n', num(4));
    const hop = method('hop', [p], [say(CAT, ref(p))]);
    expect(lines([callUser(hop)], [hop])).toEqual(['0:cat 4']);
  });

  it('returns a value from a function, part way through', () => {
    const m = method(
      'three',
      [],
      [{ id: id(), kind: 'return', value: num(3) }, say(CAT, text('never'))],
      NUMBER,
    );
    expect(lines([say(CAT, callValue(m))], [m])).toEqual(['0:cat 3']);
  });

  it('returns from inside a loop', () => {
    const m = method(
      'first',
      [],
      [
        {
          id: id(),
          kind: 'count',
          times: whole(5),
          body: [{ id: id(), kind: 'return', value: num(1) }],
        },
      ],
      NUMBER,
    );
    expect(lines([say(CAT, callValue(m))], [m])).toEqual(['0:cat 1']);
  });

  it('returns from inside a for each, whose item has a frame of its own', () => {
    const item = loopItem('x');
    const m = method(
      'first',
      [],
      [
        {
          id: id(),
          kind: 'forEach',
          item,
          items: list(num(8), num(9)),
          body: [{ id: id(), kind: 'return', value: ref(item) }],
        },
      ],
      NUMBER,
    );
    expect(lines([say(CAT, callValue(m))], [m])).toEqual(['0:cat 8']);
  });

  it('a function ending without a return is a fault', () => {
    const m = method('nothing', [], [], NUMBER);
    expect(faultOf([say(CAT, callValue(m))], [m])).toBe('bad_value');
  });

  it('a procedure can return early', () => {
    const m = method(
      'early',
      [],
      [{ id: id(), kind: 'return', value: null }, say(CAT, text('never'))],
    );
    expect(lines([callUser(m), say(DOG, text('after'))], [m])).toEqual(['0:dog after']);
  });

  it('recurses, with a frame for each call', () => {
    const n = param('n');
    const fact: MethodDecl = {
      ...method('fact', [n], [], NUMBER),
      id: nodeId('factmd'),
    };
    const body: Statement[] = [
      {
        id: id(),
        kind: 'if',
        condition: less(ref(n), num(2)),
        then: [{ id: id(), kind: 'return', value: num(1) }],
        else: [
          {
            id: id(),
            kind: 'return',
            value: arith(
              'multiply',
              ref(n),
              callValue(fact, { [n.id]: arith('subtract', ref(n), num(1)) }),
            ),
          },
        ],
      },
    ];
    const full = { ...fact, body };
    expect(lines([say(CAT, callValue(full, { [n.id]: num(5) }))], [full])).toEqual(['0:cat 120']);
  });

  it('a call in a do together has its own frame, and shares the time', () => {
    const p = param('n');
    const hop = method('hop', [p], [say(CAT, ref(p))]);
    expect(
      lines(
        [together(callUser(hop, { [p.id]: num(1) }), callUser(hop, { [p.id]: num(2) }))],
        [hop],
      ),
    ).toEqual(['0:cat 1', '0:cat 2']);
  });

  it('this is the object the method was called on', () => {
    const m = method(
      'whoAmI',
      [],
      [
        {
          id: id(),
          kind: 'call',
          target: self(),
          callee: { kind: 'story', name: 'say' },
          args: { text: text('me') },
          details: {},
        },
      ],
    );
    const onDog: Statement = {
      id: id(),
      kind: 'call',
      target: field(DOG),
      callee: { kind: 'user', method: m.id },
      args: {},
      details: {},
    };
    expect(lines([onDog], [m])).toEqual(['0:dog me']);
  });
});

describe('Story API calls', () => {
  it('asks the stage, waits for the answer, and carries on', () => {
    const distance: Expression = {
      id: id(),
      kind: 'functionCall',
      target: field(CAT),
      callee: { kind: 'story', name: 'getDistanceTo' },
      args: {},
      details: {},
    };
    expect(lines([say(CAT, distance)])).toEqual(['0:cat 2.5']);
  });

  it('delay waits, from the runtime itself', () => {
    const wait: Statement = {
      id: id(),
      kind: 'call',
      target: self(),
      callee: { kind: 'story', name: 'delay' },
      args: { duration: num(2) },
      details: {},
    };
    expect(lines([wait, say(CAT, text('a'))])).toEqual(['2:cat a']);
  });

  it('calling anything on nothing is a fault at that block', () => {
    const call: Statement = {
      id: id(),
      kind: 'call',
      target: none(),
      callee: { kind: 'story', name: 'say' },
      args: { text: text('a') },
      details: {},
    };
    const result = run(program([call]));
    expect(result.fault?.code).toBe('bad_value');
    expect(result.fault?.node).toBe(call.id);
  });

  it('a block nothing implements yet is a fault, not a crash', () => {
    const call: Statement = {
      id: id(),
      kind: 'call',
      target: field(CAT),
      callee: { kind: 'story', name: 'walkTo' },
      args: {},
      details: {},
    };
    expect(faultOf([call])).toBe('internal');
  });

  it('gives commands rising sequence numbers and the time they start', () => {
    const { commands } = run(program([say(CAT, text('a')), say(DOG, text('b'))]));
    expect(commands.map((c) => [c.seq, c.start])).toEqual([
      [0, 0],
      [1, 1_000_000],
    ]);
  });
});

describe('switched-off blocks', () => {
  it('skips one the learner switched off in the program', () => {
    const off = { ...say(CAT, text('off')), enabled: false } as Statement;
    expect(lines([off, say(CAT, text('on'))])).toEqual(['0:cat on']);
  });

  it('skips one disabled for this rehearsal', () => {
    const off = say(CAT, text('off'));
    const { said } = run(program([off, say(CAT, text('on'))]), { disabled: [off.id] });
    expect(said).toEqual(['0:cat on']);
  });

  it('skips a whole block, inside and out of do together', () => {
    const off = { ...inOrder(say(CAT, text('a'))), enabled: false } as Statement;
    expect(lines([together(off, say(DOG, text('b')))])).toEqual(['0:dog b']);
  });
});

describe('safety', () => {
  it('stops a loop that never ends and never takes any time, naming it', () => {
    const loop: Statement = { id: id(), kind: 'while', condition: bool(true), body: [] };
    const { fault } = run(program([loop]));
    expect(fault?.code).toBe('infinite_loop');
    expect(fault?.node).toBe(loop.id);
  });

  it('lets a loop run for ever if it takes time', () => {
    const loop: Statement = {
      id: id(),
      kind: 'while',
      condition: bool(true),
      body: [say(CAT, text('a'))],
    };
    const result = run(program([loop]), { until: micros(5) });
    expect(result.fault).toBeNull();
    expect(result.said).toHaveLength(6);
  });

  it('stops a very long loop that takes no time', () => {
    const loop: Statement = {
      id: id(),
      kind: 'count',
      times: whole(LIMITS.loopSpins + 1),
      body: [],
    };
    expect(faultOf([loop])).toBe('infinite_loop');
  });

  it('stops runaway recursion, naming the block', () => {
    const m: MethodDecl = { ...method('again', [], []), id: nodeId('againm') };
    const full: MethodDecl = { ...m, body: [callUser(m)] };
    const result = run(program([callUser(full)], [full]));
    expect(result.fault?.code).toBe('recursion_limit');
    expect(result.fault?.node).not.toBeNull();
  });

  it('allows recursion within the limit', () => {
    const n = param('n');
    const m: MethodDecl = { ...method('down', [n], []), id: nodeId('downmd') };
    const full: MethodDecl = {
      ...m,
      body: [
        {
          id: id(),
          kind: 'if',
          condition: less(num(0), ref(n)),
          then: [callUser(m, { [n.id]: arith('subtract', ref(n), num(1)) })],
          else: [],
        },
      ],
    };
    expect(
      faultOf([callUser(full, { [n.id]: num(LIMITS.callDepth - 2) })], [full]),
    ).toBeUndefined();
  });

  it('stops too much work at one moment, across every strand', () => {
    const spin = (): Statement => ({
      id: id(),
      kind: 'count',
      times: whole(LIMITS.loopSpins - 1),
      body: [],
    });
    const many = Array.from(
      { length: Math.ceil(LIMITS.workAtOneTime / LIMITS.loopSpins) + 2 },
      spin,
    );
    expect(faultOf([together(...many)])).toBe('time_slice');
  });

  it('counts work afresh once time has passed', () => {
    const body = Array.from({ length: 4 }, () => ({
      id: id(),
      kind: 'count',
      times: whole(LIMITS.loopSpins - 1),
      body: [],
    })) as Statement[];
    const steps = body.flatMap((s) => [s, say(CAT, text('a'))]);
    expect(faultOf(steps)).toBeUndefined();
  });
});

describe('determinism', () => {
  it('gives the same commands every time', () => {
    const p = program([
      together(say(CAT, text('a')), inOrder(say(DOG, text('b'), 0.5), say(DOG, text('c'), 0.25))),
      { id: id(), kind: 'count', times: whole(3), body: [say(CAT, text('d'), 0.125)] },
    ]);
    expect(run(p).commands).toEqual(run(p).commands);
  });

  it('repeats random numbers from one seed, and differs with another', () => {
    const numbers = (seed: number) => {
      const seen: number[] = [];
      const lib: StoryLibrary = {
        *pick(_call, context) {
          seen.push(context.random());
          yield { kind: 'sleep', duration: 0 };
          return null;
        },
      };
      const call: Statement = {
        id: id(),
        kind: 'call',
        target: self(),
        callee: { kind: 'story', name: 'pick' },
        args: {},
        details: {},
      };
      const p = program([{ id: id(), kind: 'count', times: whole(5), body: [call] }]);
      const scheduler = new Scheduler();
      const i = new Interpreter(p, {
        scheduler,
        library: lib,
        emit: () => undefined,
        disabled: [],
        seed,
      });
      scheduler.spawn(i.runMethod(MAIN));
      scheduler.runUntil(0);
      return seen;
    };
    expect(numbers(1)).toEqual(numbers(1));
    expect(numbers(1)).not.toEqual(numbers(2));
    for (const n of numbers(3)) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe('highlighting', () => {
  it('shows the blocks running, in every strand', () => {
    const a = say(CAT, text('a'), 2);
    const b = say(DOG, text('b'), 1);
    const c = say(DOG, text('c'), 2);
    const p = program([together(a, inOrder(b, c))]);
    const scheduler = new Scheduler();
    const i = new Interpreter(p, {
      scheduler,
      library,
      emit: () => undefined,
      disabled: [],
      seed: 1,
    });
    scheduler.spawn(i.runMethod(MAIN));
    scheduler.runUntil(0);
    expect(scheduler.running().sort()).toEqual([a.id, b.id].sort());
    scheduler.runUntil(micros(1));
    expect(scheduler.running().sort()).toEqual([a.id, c.id].sort());
    scheduler.runUntil(micros(5));
    expect(scheduler.running()).toEqual([]);
  });
});
