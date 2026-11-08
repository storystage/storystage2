/**
 * WP6's done-when: the TR1 evaluation set's programs, re-expressed in StoryStage 2 AST and run on
 * the Story API's own library (`STORY_LIBRARY`, WP4.3). Each program is what a right answer to
 * one row of `docs/eval/requests.jsonl` builds, from the row's starting production. For each
 * one the test checks that:
 * - the row's own code checks pass on it, so it is an answer to the request;
 * - it's a valid program;
 * - it runs with no fault and sends the stage commands it should, at the right scene times.
 *
 * The checks are copied from S7's rows, because this package can't read files in its tests.
 * The stage itself isn't here: the runtime only talks to it through messages, so a run on a
 * stage belongs with the main thread's bridge (WP7.4).
 */
import {
  nodeId,
  validateProgram,
  walk,
  type Args,
  type AstNode,
  type Expression,
  type FieldDecl,
  type ListenerDecl,
  type NodeId,
  type ParameterDecl,
  type Program,
  type Statement,
} from '@storystage/ast';
import {
  IDENTITY,
  STORY_LIBRARY,
  micros,
  objectId,
  type StageCommand,
  type StageEvent,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { RUNTIME_PROTOCOL, inMemoryPorts, type FromRuntime, type ToRuntime } from './messages.ts';
import { serve, type Timers } from './serve.ts';

// ---- Writing programs ------------------------------------------------------------------------

let counter = 0;
const id = (): NodeId => nodeId(`t${(counter++).toString(36).padStart(5, '0')}`);

const CLASSES: Readonly<Record<string, string>> = {
  penguin: 'Flyer',
  tree: 'Prop',
  cat: 'Quadruped',
  dog: 'Quadruped',
  camera: 'Camera',
};
const field = (name: string): FieldDecl => ({
  id: nodeId(`${name}fd`.padEnd(6, 'x')),
  kind: 'field',
  name,
  type: { kind: 'story', name: CLASSES[name]! },
  initial: null,
});

const num = (value: number): Expression => ({ id: id(), kind: 'number', value });
const whole = (value: number): Expression => ({ id: id(), kind: 'wholeNumber', value });
const text = (value: string): Expression => ({ id: id(), kind: 'text', value });
const choice = (type: string, value: string): Expression => ({
  id: id(),
  kind: 'enum',
  type,
  value,
});
const self = (): Expression => ({ id: id(), kind: 'this' });
const the = (name: string): Expression => ({
  id: id(),
  kind: 'fieldRef',
  target: self(),
  field: field(name).id,
});
const ref = (p: { id: NodeId }): Expression => ({ id: id(), kind: 'variableRef', variable: p.id });
const list = (...items: Expression[]): Expression => ({
  id: id(),
  kind: 'arrayOf',
  of: { kind: 'story', name: 'Thing' },
  items,
});

/** `who.block(args; details)`, as a statement. */
const call = (who: string, block: string, args: Args = {}, details: Args = {}): Statement => ({
  id: id(),
  kind: 'call',
  target: the(who),
  callee: { kind: 'story', name: block },
  args,
  details,
});
const say = (who: string, words: string, seconds?: number) =>
  call(who, 'say', { text: text(words) }, seconds === undefined ? {} : { duration: num(seconds) });
const move = (who: string, way: string | Expression, metres: number, seconds?: number) =>
  call(
    who,
    'move',
    {
      direction: typeof way === 'string' ? choice('MoveDirection', way) : way,
      amount: num(metres),
    },
    seconds === undefined ? {} : { duration: num(seconds) },
  );
const turn = (who: string, way: string, turns: number, seconds?: number) =>
  call(
    who,
    'turn',
    { direction: choice('TurnDirection', way), amount: num(turns) },
    seconds === undefined ? {} : { duration: num(seconds) },
  );
/** A hop: up half a metre and down again, in half a second. */
const hop = (who: string): Statement[] => [
  move(who, 'up', 0.5, 0.25),
  move(who, 'down', 0.5, 0.25),
];

const together = (...body: Statement[]): Statement => ({ id: id(), kind: 'doTogether', body });
const inOrder = (...body: Statement[]): Statement => ({ id: id(), kind: 'doInOrder', body });
const count = (times: number, ...body: Statement[]): Statement => ({
  id: id(),
  kind: 'count',
  times: whole(times),
  body,
});
const param = (name: string, type: string): ParameterDecl => ({
  id: id(),
  kind: 'parameter',
  name,
  type: { kind: 'story', name: type },
  default: null,
});
const listener = (
  event: string,
  body: readonly Statement[],
  options: { args?: Args; details?: Args; params?: readonly ParameterDecl[] } = {},
): ListenerDecl => ({
  id: id(),
  kind: 'listener',
  event,
  args: options.args ?? {},
  details: options.details ?? {},
  params: options.params ?? [],
  body,
});

const MAIN = nodeId('mainmt');

/** The starting productions in `docs/eval/productions/`, by the objects in them. */
const STARTS: Readonly<Record<string, readonly string[]>> = {
  penguin: ['penguin', 'tree'],
  'penguin-animated': ['penguin', 'tree'],
  'two-animals': ['cat', 'dog'],
};

function scene(
  start: string,
  body: readonly Statement[],
  listeners: readonly ListenerDecl[] = [],
): Program {
  return {
    schemaVersion: '1.0.0',
    types: [
      {
        id: nodeId('scenet'),
        kind: 'type',
        name: 'Scene1',
        extends: { kind: 'story', name: 'Scene' },
        fields: ['camera', ...STARTS[start]!].map(field),
        methods: [
          { id: MAIN, kind: 'method', name: 'myFirstMethod', returns: null, params: [], body },
        ],
        listeners,
      },
    ],
  };
}

// ---- The rows' code checks -------------------------------------------------------------------

type Check =
  | {
      readonly type: 'method_has_call';
      readonly procedure: string;
      readonly target: string;
      readonly min?: number;
    }
  | { readonly type: 'method_order'; readonly order: readonly string[] }
  | { readonly type: 'control'; readonly kind: 'doTogether' | 'count'; readonly value?: number }
  | {
      readonly type: 'argument';
      readonly procedure: string;
      readonly detail: string;
      readonly value: number;
    }
  | { readonly type: 'event_listener'; readonly kind: string };

/** Each call in the scene: its block and the object it's on. */
function calls(p: Program): { block: string; on: string; node: AstNode }[] {
  const fields = new Map(p.types[0]!.fields.map((f) => [f.id as string, f.name]));
  const found: { block: string; on: string; node: AstNode }[] = [];
  for (const type of p.types)
    walk(type, (node) => {
      if ((node.kind === 'call' || node.kind === 'functionCall') && node.callee.kind === 'story') {
        const on =
          node.target.kind === 'fieldRef' ? (fields.get(node.target.field) ?? '?') : 'scene';
        found.push({ block: node.callee.name, on, node });
      }
    });
  return found;
}

/** The blocks and controls of the script method, in the order a learner reads them. */
function order(p: Program): string[] {
  const seen: string[] = [];
  for (const s of p.types[0]!.methods[0]!.body)
    walk(s, (node) => {
      if (node.kind === 'call' && node.callee.kind === 'story') seen.push(node.callee.name);
      else if (node.kind === 'doTogether' || node.kind === 'count') seen.push(node.kind);
    });
  return seen;
}

function passes(p: Program, check: Check): boolean {
  switch (check.type) {
    case 'method_has_call':
      return (
        calls(p).filter((c) => c.block === check.procedure && c.on === check.target).length >=
        (check.min ?? 1)
      );
    case 'method_order': {
      const seen = order(p);
      let at = 0;
      for (const want of check.order) {
        at = seen.indexOf(want, at);
        if (at < 0) return false;
        at++;
      }
      return true;
    }
    case 'control': {
      let ok = false;
      for (const type of p.types)
        walk(type, (node) => {
          if (node.kind !== check.kind) return;
          if (check.kind !== 'count') ok = true;
          else if (node.kind === 'count' && node.times.kind === 'wholeNumber')
            ok ||= check.value === undefined || node.times.value === check.value;
        });
      return ok;
    }
    case 'argument':
      return calls(p).some(({ block, node }) => {
        if (block !== check.procedure || node.kind !== 'call') return false;
        const value = node.details[check.detail];
        return value?.kind === 'number' && value.value === check.value;
      });
    case 'event_listener':
      return p.types[0]!.listeners.some((l) => l.event === check.kind);
  }
}

// ---- Running them ----------------------------------------------------------------------------

/** A command as one line: when, who, what, for how long. */
function line(c: StageCommand): string {
  const v = (x: { x: number; y: number; z: number }) => `${x.x},${x.y},${x.z}`;
  const what = (() => {
    switch (c.kind) {
      case 'say':
        return `${c.bubble} "${c.text}"`;
      case 'translate':
        return `move ${v(c.by)}`;
      case 'rotate':
        return `turn ${c.turns} about ${v(c.axis)}`;
      case 'moveToward':
        return `moveToward ${String(c.target)} ${c.amount}`;
      case 'orient':
        return `orient ${JSON.stringify(c.to)}`;
      default:
        return c.kind;
    }
  })();
  return `${c.start / 1_000_000}s ${c.object} ${what} (${c.duration / 1_000_000}s)`;
}

/** Advance to a time in seconds, or send the stage event. */
type Step = number | StageEvent;

async function run(p: Program, steps: readonly Step[] = [60]) {
  const { main, worker } = inMemoryPorts();
  const heard: FromRuntime[] = [];
  main.listen((m) => heard.push(m));
  const timers: Timers = { now: () => 0, every: () => () => undefined };
  serve(worker, STORY_LIBRARY, timers);
  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  const send = async (m: ToRuntime) => {
    main.post(m);
    await settle();
  };
  await settle();
  await send({
    type: 'load',
    protocol: RUNTIME_PROTOCOL,
    program: p,
    scene: { backdrop: {}, objects: [], camera: { transform: IDENTITY }, markers: [] },
    entry: MAIN,
    seed: 1,
    disabled: [],
    scenes: ['s1'],
  });
  await send({ type: 'start', mode: { kind: 'fixed' } });
  for (const step of steps)
    await send(
      typeof step === 'number'
        ? { type: 'advance', until: micros(step) }
        : { type: 'event', event: step },
    );
  return {
    heard,
    lines: heard.flatMap((m) => (m.type === 'commands' ? m.commands.map(line) : [])),
    faults: heard.flatMap((m) => (m.type === 'error' ? [m.error] : [])),
    asked: heard.filter((m) => m.type === 'ask'),
  };
}

const click = (object: string | null): StageEvent => ({
  kind: 'click',
  object: object === null ? null : objectId(object),
  x: 0.5,
  y: 0.5,
  at: 0,
});
const key = (k: string): StageEvent => ({ kind: 'key', key: k, at: 0 });

// ---- The rows --------------------------------------------------------------------------------

interface Row {
  readonly id: string;
  readonly start: keyof typeof STARTS;
  readonly request: string;
  readonly checks: readonly Check[];
  readonly program: () => Program;
  readonly steps?: readonly Step[];
  readonly expect: readonly string[];
}

const UP = '0,1,0';

const ROWS: readonly Row[] = [
  {
    id: 'penguin-animated',
    start: 'penguin-animated',
    request: 'The starting program the explain rows ask about.',
    checks: [
      { type: 'method_has_call', procedure: 'say', target: 'penguin' },
      { type: 'method_order', order: ['say', 'turn', 'move'] },
    ],
    program: () =>
      scene('penguin', [
        say('penguin', 'Hello'),
        turn('penguin', 'left', 0.25),
        move('penguin', 'forward', 2),
      ]),
    expect: [
      '0s penguin say "Hello" (1s)',
      `1s penguin turn 0.25 about ${UP} (1s)`,
      '2s penguin move 0,0,2 (1s)',
    ],
  },
  {
    id: 'anim-01',
    start: 'penguin',
    request: 'Make the penguin say hello and then turn around.',
    checks: [
      { type: 'method_has_call', procedure: 'say', target: 'penguin' },
      { type: 'method_has_call', procedure: 'turn', target: 'penguin' },
      { type: 'method_order', order: ['say', 'turn'] },
    ],
    program: () => scene('penguin', [say('penguin', 'Hello'), turn('penguin', 'left', 0.5)]),
    expect: ['0s penguin say "Hello" (1s)', `1s penguin turn 0.5 about ${UP} (1s)`],
  },
  {
    id: 'anim-02',
    start: 'penguin',
    request: 'The penguin should walk forward three metres.',
    checks: [{ type: 'method_has_call', procedure: 'move', target: 'penguin' }],
    program: () => scene('penguin', [move('penguin', 'forward', 3)]),
    expect: ['0s penguin move 0,0,3 (1s)'],
  },
  {
    id: 'anim-03',
    start: 'penguin',
    request: "Have the penguin think 'I'm hungry', then move towards the tree.",
    checks: [
      { type: 'method_has_call', procedure: 'think', target: 'penguin' },
      { type: 'method_has_call', procedure: 'moveToward', target: 'penguin' },
      { type: 'method_order', order: ['think', 'moveToward'] },
    ],
    program: () =>
      scene('penguin', [
        call('penguin', 'think', { text: text("I'm hungry") }),
        call('penguin', 'moveToward', { target: the('tree'), amount: num(2) }),
      ]),
    expect: ['0s penguin think "I\'m hungry" (1s)', '1s penguin moveToward tree 2 (1s)'],
  },
  {
    id: 'anim-04',
    start: 'penguin',
    request: 'Make the penguin jump.',
    checks: [{ type: 'method_has_call', procedure: 'move', target: 'penguin', min: 2 }],
    program: () => scene('penguin', hop('penguin')),
    expect: ['0s penguin move 0,0.5,0 (0.25s)', '0.25s penguin move 0,-0.5,0 (0.25s)'],
  },
  {
    id: 'anim-05',
    start: 'penguin',
    request: 'Make the penguin spin around slowly, taking 4 seconds.',
    checks: [
      { type: 'method_has_call', procedure: 'turn', target: 'penguin' },
      { type: 'argument', procedure: 'turn', detail: 'duration', value: 4 },
    ],
    program: () => scene('penguin', [turn('penguin', 'left', 1, 4)]),
    expect: [`0s penguin turn 1 about ${UP} (4s)`],
  },
  {
    id: 'anim-06',
    start: 'penguin',
    request: 'The camera should look at the penguin, then the penguin turns its head.',
    checks: [{ type: 'method_has_call', procedure: 'pointAt', target: 'camera' }],
    // The head turn waits for joint values (see the todo below).
    program: () => scene('penguin', [call('camera', 'pointAt', { target: the('penguin') })]),
    expect: ['0s camera orient {"pointAt":"penguin"} (1s)'],
  },
  {
    id: 'together-01',
    start: 'two-animals',
    request: 'Make the cat and the dog both turn at the same time.',
    checks: [
      { type: 'control', kind: 'doTogether' },
      { type: 'method_has_call', procedure: 'turn', target: 'cat' },
      { type: 'method_has_call', procedure: 'turn', target: 'dog' },
    ],
    program: () => scene('two-animals', [together(turn('cat', 'left', 1), turn('dog', 'left', 1))]),
    expect: [`0s cat turn 1 about ${UP} (1s)`, `0s dog turn 1 about ${UP} (1s)`],
  },
  {
    id: 'together-02',
    start: 'penguin',
    request: "While the penguin moves forward, it should also say 'Wheee!'",
    checks: [
      { type: 'control', kind: 'doTogether' },
      { type: 'method_has_call', procedure: 'move', target: 'penguin' },
      { type: 'method_has_call', procedure: 'say', target: 'penguin' },
    ],
    program: () =>
      scene('penguin', [together(move('penguin', 'forward', 2), say('penguin', 'Wheee!'))]),
    expect: ['0s penguin move 0,0,2 (1s)', '0s penguin say "Wheee!" (1s)'],
  },
  {
    id: 'together-03',
    start: 'two-animals',
    request: 'Have the dog and cat race forward together.',
    checks: [{ type: 'control', kind: 'doTogether' }],
    program: () =>
      scene('two-animals', [together(move('dog', 'forward', 5, 2), move('cat', 'forward', 5, 2))]),
    expect: ['0s dog move 0,0,5 (2s)', '0s cat move 0,0,5 (2s)'],
  },
  {
    id: 'together-04',
    start: 'two-animals',
    request: 'First the cat says hi, then they both jump together.',
    checks: [
      { type: 'control', kind: 'doTogether' },
      { type: 'method_order', order: ['say', 'doTogether'] },
    ],
    program: () =>
      scene('two-animals', [
        say('cat', 'Hi'),
        together(inOrder(...hop('cat')), inOrder(...hop('dog'))),
      ]),
    expect: [
      '0s cat say "Hi" (1s)',
      '1s cat move 0,0.5,0 (0.25s)',
      '1s dog move 0,0.5,0 (0.25s)',
      '1.25s cat move 0,-0.5,0 (0.25s)',
      '1.25s dog move 0,-0.5,0 (0.25s)',
    ],
  },
  {
    id: 'together-05',
    start: 'penguin',
    request: 'Make the penguin turn and move at the same time so it goes in a curve.',
    checks: [
      { type: 'control', kind: 'doTogether' },
      { type: 'method_has_call', procedure: 'turn', target: 'penguin' },
      { type: 'method_has_call', procedure: 'move', target: 'penguin' },
    ],
    program: () =>
      scene('penguin', [together(turn('penguin', 'left', 0.25), move('penguin', 'forward', 2))]),
    expect: [`0s penguin turn 0.25 about ${UP} (1s)`, '0s penguin move 0,0,2 (1s)'],
  },
  {
    id: 'loop-01',
    start: 'penguin',
    request: 'Make the penguin hop 3 times.',
    checks: [
      { type: 'control', kind: 'count', value: 3 },
      { type: 'method_has_call', procedure: 'move', target: 'penguin' },
    ],
    program: () => scene('penguin', [count(3, ...hop('penguin'))]),
    expect: [0, 0.5, 1].flatMap((t) => [
      `${t}s penguin move 0,0.5,0 (0.25s)`,
      `${t + 0.25}s penguin move 0,-0.5,0 (0.25s)`,
    ]),
  },
  {
    id: 'loop-02',
    start: 'penguin',
    request: 'The penguin should walk around the tree in a square.',
    checks: [
      { type: 'control', kind: 'count', value: 4 },
      { type: 'method_has_call', procedure: 'turn', target: 'penguin' },
    ],
    program: () =>
      scene('penguin', [count(4, move('penguin', 'forward', 2), turn('penguin', 'left', 0.25))]),
    expect: [0, 2, 4, 6].flatMap((t) => [
      `${t}s penguin move 0,0,2 (1s)`,
      `${t + 1}s penguin turn 0.25 about ${UP} (1s)`,
    ]),
  },
  {
    id: 'loop-03',
    start: 'two-animals',
    request: 'Make the dog bark 5 times by saying Woof.',
    checks: [
      { type: 'control', kind: 'count', value: 5 },
      { type: 'method_has_call', procedure: 'say', target: 'dog' },
    ],
    program: () => scene('two-animals', [count(5, say('dog', 'Woof', 0.5))]),
    expect: [0, 0.5, 1, 1.5, 2].map((t) => `${t}s dog say "Woof" (0.5s)`),
  },
  {
    id: 'loop-04',
    start: 'penguin',
    request: "Spin the penguin around twice, then have it say 'I'm dizzy'.",
    checks: [
      { type: 'method_has_call', procedure: 'turn', target: 'penguin' },
      { type: 'method_order', order: ['turn', 'say'] },
    ],
    program: () =>
      scene('penguin', [count(2, turn('penguin', 'left', 1)), say('penguin', "I'm dizzy")]),
    expect: [
      `0s penguin turn 1 about ${UP} (1s)`,
      `1s penguin turn 1 about ${UP} (1s)`,
      '2s penguin say "I\'m dizzy" (1s)',
    ],
  },
  {
    id: 'loop-05',
    start: 'two-animals',
    request: 'Repeat 4 times: the cat and dog both turn a quarter turn together.',
    checks: [
      { type: 'control', kind: 'count', value: 4 },
      { type: 'control', kind: 'doTogether' },
    ],
    program: () =>
      scene('two-animals', [
        count(4, together(turn('cat', 'left', 0.25), turn('dog', 'left', 0.25))),
      ]),
    expect: [0, 1, 2, 3].flatMap((t) => [
      `${t}s cat turn 0.25 about ${UP} (1s)`,
      `${t}s dog turn 0.25 about ${UP} (1s)`,
    ]),
  },
  {
    id: 'event-01',
    start: 'penguin',
    request: 'When I click on the penguin, it should say ouch.',
    checks: [
      { type: 'event_listener', kind: 'clickOnObject' },
      { type: 'method_has_call', procedure: 'say', target: 'penguin' },
    ],
    program: () =>
      scene(
        'penguin',
        [],
        [
          listener('clickOnObject', [say('penguin', 'Ouch')], {
            details: { setOfVisuals: list(the('penguin')) },
          }),
        ],
      ),
    steps: [0, click('tree'), 2, click('penguin'), 5],
    expect: ['2s penguin say "Ouch" (1s)'],
  },
  {
    id: 'event-02',
    start: 'penguin',
    request: 'Let me move the penguin with the arrow keys.',
    checks: [{ type: 'event_listener', kind: 'arrowKeyPress' }],
    program: () => {
      const way = param('moveDirection', 'MoveDirection');
      return scene(
        'penguin',
        [],
        [listener('arrowKeyPress', [move('penguin', ref(way), 0.5, 0.25)], { params: [way] })],
      );
    },
    steps: [0, key('up'), 1, key('left'), 2],
    expect: ['0s penguin move 0,0,0.5 (0.25s)', '1s penguin move 0.5,0,0 (0.25s)'],
  },
  {
    id: 'event-03',
    start: 'two-animals',
    request: 'When I press the space bar, the dog jumps.',
    checks: [{ type: 'event_listener', kind: 'keyPress' }],
    program: () => {
      const pressed = param('key', 'Key');
      const isSpace: Expression = {
        id: id(),
        kind: 'compare',
        op: 'equal',
        left: ref(pressed),
        right: choice('Key', 'space'),
      };
      return scene(
        'two-animals',
        [],
        [
          listener(
            'keyPress',
            [{ id: id(), kind: 'if', condition: isSpace, then: hop('dog'), else: [] }],
            { params: [pressed] },
          ),
        ],
      );
    },
    steps: [0, key('a'), 1, key('space'), 2],
    expect: ['1s dog move 0,0.5,0 (0.25s)', '1.25s dog move 0,-0.5,0 (0.25s)'],
  },
  {
    id: 'event-04',
    start: 'two-animals',
    request: 'If the cat gets close to the dog, the dog should run away.',
    checks: [{ type: 'event_listener', kind: 'proximityEnter' }],
    program: () =>
      scene(
        'two-animals',
        [],
        [
          listener(
            'proximityEnter',
            [call('dog', 'moveAwayFrom', { target: the('cat'), amount: num(3) })],
            { args: { setA: list(the('cat')), setB: list(the('dog')), distance: num(1) } },
          ),
        ],
      ),
    steps: [
      0,
      { kind: 'proximityEnter', a: objectId('cat'), b: objectId('dog'), distance: 1, at: 0 },
      2,
    ],
    expect: ['0s dog moveToward cat -3 (1s)'],
  },
  {
    id: 'event-05',
    start: 'penguin',
    request: 'Every time I click anywhere, the penguin turns a little.',
    checks: [{ type: 'event_listener', kind: 'clickOnScreen' }],
    program: () =>
      scene('penguin', [], [listener('clickOnScreen', [turn('penguin', 'left', 0.0625)])]),
    steps: [0, click(null), 2, click('tree'), 4],
    expect: [`0s penguin turn 0.0625 about ${UP} (1s)`, `2s penguin turn 0.0625 about ${UP} (1s)`],
  },
];

describe('the TR1 programs (WP6 done-when)', () => {
  it('cover every TR1 row that builds code', () => {
    const built = ROWS.map((r) => r.id).filter((r) => r !== 'penguin-animated');
    expect(built).toHaveLength(21);
  });

  describe.each(ROWS)('$id: $request', (row) => {
    const program = row.program();

    it("is an answer: the row's code checks pass", () => {
      for (const check of row.checks)
        expect(passes(program, check), JSON.stringify(check)).toBe(true);
    });

    it('is a valid program', () => {
      expect(validateProgram(program)).toEqual([]);
    });

    it('runs on the Story API, with no fault, sending what it should', async () => {
      const result = await run(program, row.steps);
      expect(result.faults).toEqual([]);
      expect(result.asked).toEqual([]);
      expect(result.lines).toEqual(row.expect);
    });
  });

  it('event-04 tells the stage to watch the cat and the dog', async () => {
    const row = ROWS.find((r) => r.id === 'event-04')!;
    const { heard } = await run(row.program(), [0]);
    expect(heard.filter((m) => m.type === 'watch')).toEqual([
      { type: 'watch', watches: [{ kind: 'proximity', a: ['cat'], b: ['dog'], distance: 1 }] },
    ]);
  });

  it.todo(
    "anim-06's head turn: `penguin.getJoint(neck).turn(…)` needs joint values in the runtime and joint targets in the Story API's blocks",
  );
});
