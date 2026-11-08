import {
  nodeId,
  validateProgram,
  type Expression,
  type ListenerDecl,
  type MethodDecl,
  type Program,
  type Statement,
  type TypeDecl,
  type TypeRef,
} from '@storystage/ast';
import { ids, sampleProgram } from '@storystage/ast/testing';
import { describe, expect, it } from 'vitest';
import { checkProgram } from './program-check.ts';

let next = 0;
const id = () => nodeId(`n${(next++).toString(36).padStart(5, '0')}`);

const story = (name: string): TypeRef => ({ kind: 'story', name });
const list = (of: TypeRef): TypeRef => ({ kind: 'array', of });

const num = (value: number): Expression => ({ id: id(), kind: 'number', value });
const whole = (value: number): Expression => ({ id: id(), kind: 'wholeNumber', value });
const text = (value: string): Expression => ({ id: id(), kind: 'text', value });
const bool = (value: boolean): Expression => ({ id: id(), kind: 'boolean', value });
const none = (): Expression => ({ id: id(), kind: 'none' });
const self = (): Expression => ({ id: id(), kind: 'this' });
const choice = (type: string, value: string): Expression => ({
  id: id(),
  kind: 'enum',
  type,
  value,
});

const CAT = nodeId('catfld');
const PROP = nodeId('propfd');
const SCORE = nodeId('scorfd');
const HOP = nodeId('hopmth');
const HEIGHT = nodeId('hopprm');
const PET = nodeId('pettyp');
const SCENE = nodeId('scenet');
const PET_FIELD = nodeId('petfld');

const field = (fieldId: typeof CAT): Expression => ({
  id: id(),
  kind: 'fieldRef',
  target: self(),
  field: fieldId,
});
const cat = () => field(CAT);

const call = (
  target: Expression,
  name: string,
  args: Readonly<Record<string, Expression>> = {},
  details: Readonly<Record<string, Expression>> = {},
): Statement => ({
  id: id(),
  kind: 'call',
  target,
  callee: { kind: 'story', name },
  args,
  details,
});

const fn = (
  target: Expression,
  name: string,
  args: Readonly<Record<string, Expression>> = {},
): Expression => ({
  id: id(),
  kind: 'functionCall',
  target,
  callee: { kind: 'story', name },
  args,
  details: {},
});

const move = () => ({ direction: choice('MoveDirection', 'forward'), amount: num(1) });

const method = (name: string, body: readonly Statement[], returns: TypeRef | null = null) =>
  ({ id: id(), kind: 'method', name, returns, params: [], body }) satisfies MethodDecl;

/** A valid scene with a cat, a prop, a whole-number score, a `Pet` class and `body` to run. */
function programWith(
  body: readonly Statement[],
  more: { methods?: readonly MethodDecl[]; listeners?: readonly ListenerDecl[] } = {},
): Program {
  const pet: TypeDecl = {
    id: PET,
    kind: 'type',
    name: 'Pet',
    extends: story('Quadruped'),
    fields: [],
    methods: [
      {
        id: HOP,
        kind: 'method',
        name: 'hop',
        returns: null,
        params: [
          { id: HEIGHT, kind: 'parameter', name: 'height', type: story('Number'), default: null },
        ],
        body: [],
      },
    ],
    listeners: [],
  };
  const scene: TypeDecl = {
    id: SCENE,
    kind: 'type',
    name: 'Scene1',
    extends: story('Scene'),
    fields: [
      { id: CAT, kind: 'field', name: 'cat', type: story('Biped'), initial: null },
      { id: PROP, kind: 'field', name: 'chair', type: story('Prop'), initial: null },
      { id: SCORE, kind: 'field', name: 'score', type: story('WholeNumber'), initial: whole(0) },
      {
        id: PET_FIELD,
        kind: 'field',
        name: 'rex',
        type: { kind: 'user', type: PET },
        initial: null,
      },
    ],
    methods: [method('myFirstMethod', body), ...(more.methods ?? [])],
    listeners: more.listeners ?? [],
  };
  return { schemaVersion: '1.0.0', types: [scene, pet] };
}

/** The reasons refused, having first passed S2's own rules. */
function refuse(program: Program): readonly string[] {
  expect(validateProgram(program)).toEqual([]);
  return checkProgram(program).map((p) => p.reason ?? '');
}

const check = (body: readonly Statement[]) => refuse(programWith(body));

describe('a good program', () => {
  it('passes, and passes through validateProgram too', () => {
    const program = programWith([
      call(cat(), 'move', move(), { duration: whole(2) }),
      call(self(), 'delay', { duration: num(1) }),
      call(cat(), 'moveTo', { target: field(PROP) }),
      call(cat(), 'say', { text: text('Hello') }),
      call(field(PET_FIELD), 'say', { text: text('Woof') }),
    ]);
    expect(checkProgram(program)).toEqual([]);
    expect(validateProgram(program, { check: checkProgram })).toEqual([]);
  });

  it('never refuses what S2 sample means to be valid', () => {
    // Its `eachTogether` loops over a non-list and `double` returns text. Neither is meant to be
    // a type check; both are in the lane log for S2, and this still holds once they're fixed.
    const known: readonly (string | null)[] = [ids.each, ids.answer];
    const problems = checkProgram(sampleProgram());
    expect(problems.filter((p) => !known.includes(p.node))).toEqual([]);
  });

  it('allows an empty slot, because an unfinished block isn’t wrong', () => {
    expect(check([call(cat(), 'moveTo', { target: none() })])).toEqual([]);
  });
});

describe('blocks', () => {
  it('refuses a block the class doesn’t have', () => {
    const [problem] = checkProgram(programWith([call(field(PROP), 'walkTo', { target: cat() })]));
    expect(problem).toMatchObject({ code: 'outside', name: 'walkTo' });
    expect(problem?.reason).toContain('Choose one from the list');
  });

  it('points at the block that’s wrong', () => {
    const bad = call(field(PROP), 'walkTo', { target: cat() });
    expect(checkProgram(programWith([bad]))[0]?.node).toBe(bad.id);
  });

  it('refuses a block on something that isn’t an object', () => {
    expect(check([call(field(SCORE), 'move', move())])).toHaveLength(1);
  });

  it('lets a learner’s class use the blocks of the class it extends', () => {
    expect(
      check([
        call(field(PET_FIELD), 'turn', {
          direction: choice('TurnDirection', 'left'),
          amount: num(1),
        }),
      ]),
    ).toEqual([]);
    expect(check([call(field(PET_FIELD), 'walkTo', { target: cat() })])).toHaveLength(1);
  });

  it('keeps joints to turning', () => {
    const elbow = fn(cat(), 'getJoint', { joint: choice('JointId', 'leftLowerArm') });
    const turn = { direction: choice('TurnDirection', 'left'), amount: num(0.25) };
    expect(check([call(elbow, 'turn', turn)])).toEqual([]);
    const again = fn(cat(), 'getJoint', { joint: choice('JointId', 'leftLowerArm') });
    expect(check([call(again, 'move', move())])).toHaveLength(1);
  });

  it('refuses a function standing on its own, and a procedure used as a value', () => {
    expect(check([call(cat(), 'getWidth')])).toHaveLength(1);
    const value: Expression = fn(cat(), 'say', { text: text('Hi') });
    const local: Statement = {
      id: id(),
      kind: 'local',
      name: 'x',
      type: story('Number'),
      value,
    };
    expect(check([local])).toHaveLength(1);
  });
});

describe('values', () => {
  it('asks for a value a block needs', () => {
    const [problem] = checkProgram(programWith([call(cat(), 'move', { amount: num(1) })]));
    expect(problem).toMatchObject({ name: 'direction' });
    expect(problem?.reason).toContain('direction');
  });

  it('refuses a value of the wrong type, in plain words', () => {
    const [problem] = checkProgram(
      programWith([call(cat(), 'move', { ...move(), amount: text('far') })]),
    );
    expect(problem).toMatchObject({ name: 'amount' });
    expect(problem?.reason).toContain('amount');
  });

  it('refuses a detail the block doesn’t have', () => {
    const details = { pathStyle: choice('PathStyle', 'smooth') };
    expect(check([call(cat(), 'move', move(), details)])).toHaveLength(1);
  });

  it('refuses a detail of the wrong type', () => {
    expect(check([call(cat(), 'move', move(), { duration: text('long') })])).toHaveLength(1);
  });

  it('reads the type of what’s given: functions, fields and sums', () => {
    const width = fn(cat(), 'getWidth');
    const sum: Expression = { id: id(), kind: 'arithmetic', op: 'add', left: width, right: num(1) };
    expect(check([call(cat(), 'move', { ...move(), amount: sum })])).toEqual([]);
    const isNear = fn(cat(), 'isCollidingWith', { other: field(PROP) });
    expect(check([call(cat(), 'move', { ...move(), amount: isNear })])).toHaveLength(1);
  });

  it('tells words apart from 3D text', () => {
    const words = fn(cat(), 'isFacing', { other: text('the dog') });
    const local: Statement = {
      id: id(),
      kind: 'local',
      name: 'x',
      type: story('Boolean'),
      value: words,
    };
    expect(check([local])).toHaveLength(1);
  });

  it('treats a whole number as a number, but not the reverse', () => {
    const local = (value: Expression): Statement => ({
      id: id(),
      kind: 'local',
      name: 'x',
      type: story('WholeNumber'),
      value,
    });
    expect(check([local(whole(1))])).toEqual([]);
    expect(check([local(num(1.5))])).toHaveLength(1);
  });
});

describe('choices', () => {
  it('refuses a value that isn’t one of the choices', () => {
    const args = { ...move(), direction: choice('MoveDirection', 'sideways') };
    expect(check([call(cat(), 'move', args)])).toHaveLength(1);
  });

  it('refuses a kind of choice that doesn’t exist', () => {
    const args = { ...move(), direction: choice('Direction', 'forward') };
    expect(check([call(cat(), 'move', args)]).length).toBeGreaterThan(0);
  });

  it('takes a colour as paint', () => {
    expect(check([call(cat(), 'setPaint', { paint: choice('Color', 'red') })])).toEqual([]);
    expect(check([call(cat(), 'setPaint', { paint: text('#112233') })])).toEqual([]);
    expect(check([call(cat(), 'setPaint', { paint: num(1) })])).toHaveLength(1);
  });

  it('asks the manifest about joints, when it’s given', () => {
    const body = () => [
      call(fn(cat(), 'getJoint', { joint: choice('JointId', 'tail') }), 'turn', {
        direction: choice('TurnDirection', 'left'),
        amount: num(1),
      }),
    ];
    const asked: string[] = [];
    const jointExists = (at: string, joint: string) => {
      asked.push(`${at} ${joint}`);
      return false;
    };
    expect(checkProgram(programWith(body()), { jointExists })).toHaveLength(1);
    expect(asked).toEqual([`${CAT} tail`]);
    expect(checkProgram(programWith(body()), { jointExists: () => true })).toEqual([]);
    expect(checkProgram(programWith(body()))).toEqual([]);
  });

  it('asks the production about scenes, when it’s given', () => {
    const body = () => [
      call(self(), 'goToScene', { scene: text('Beach') }),
      call(self(), 'crossfade', { scene: text('Night') }),
    ];
    const sceneExists = (scene: string) => scene === 'Night';
    const problems = checkProgram(programWith(body()), { sceneExists });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      name: 'scene',
      reason: 'There’s no scene called Beach. Choose another one.'.replace('’', "'"),
    });
    expect(checkProgram(programWith(body()))).toEqual([]);
  });
});

describe('types', () => {
  const withField = (type: TypeRef): Program => {
    const program = programWith([]);
    const [scene, pet] = program.types as [TypeDecl, TypeDecl];
    const extra = { id: id(), kind: 'field', name: 'extra', type, initial: null } as const;
    return { ...program, types: [{ ...scene, fields: [...scene.fields, extra] }, pet] };
  };

  it.each(['Number', 'Text', 'TextModel', 'Biped', 'Thing', 'Color', 'Joint', 'Audio'])(
    'knows %s',
    (name) => {
      expect(refuse(withField(story(name)))).toEqual([]);
    },
  );

  it('refuses a type that doesn’t exist, even in a list', () => {
    expect(refuse(withField(story('Dinosaur')))).toHaveLength(1);
    expect(refuse(withField(list(story('Dinosaur'))))).toHaveLength(1);
  });

  it('builds a learner’s class only on a concrete class', () => {
    const extending = (name: string): Program => {
      const program = programWith([]);
      const [scene, pet] = program.types as [TypeDecl, TypeDecl];
      return { ...program, types: [scene, { ...pet, extends: story(name) }] };
    };
    expect(refuse(extending('Biped'))).toEqual([]);
    expect(refuse(extending('TextModel'))).toEqual([]);
    expect(refuse(extending('Model'))).toHaveLength(1);
    expect(refuse(extending('Joint'))).toHaveLength(1);
    expect(refuse(extending('Number'))).toHaveLength(1);
  });
});

describe('statements', () => {
  it('wants a true or false for a condition', () => {
    const branch = (condition: Expression): Statement => ({
      id: id(),
      kind: 'if',
      condition,
      then: [],
      else: [],
    });
    expect(check([branch(bool(true))])).toEqual([]);
    expect(check([branch(num(1))])).toHaveLength(1);
    expect(check([{ id: id(), kind: 'while', condition: text('yes'), body: [] }])).toHaveLength(1);
  });

  it('wants a whole number of times', () => {
    expect(check([{ id: id(), kind: 'count', times: whole(3), body: [] }])).toEqual([]);
    expect(check([{ id: id(), kind: 'count', times: text('3'), body: [] }])).toHaveLength(1);
  });

  it('wants a list to loop over, of the right things', () => {
    const items = (of: TypeRef, ...members: Expression[]): Expression => ({
      id: id(),
      kind: 'arrayOf',
      of,
      items: members,
    });
    const loop = (itemsExpr: Expression, type: TypeRef): Statement => ({
      id: id(),
      kind: 'forEach',
      item: { id: id(), kind: 'loopItem', name: 'each', type },
      items: itemsExpr,
      body: [],
    });
    expect(check([loop(items(story('Biped'), cat()), story('Biped'))])).toEqual([]);
    expect(check([loop(items(story('Biped'), cat()), story('Thing'))])).toEqual([]);
    expect(check([loop(cat(), story('Biped'))])).toHaveLength(1);
    expect(check([loop(items(story('Text')), story('Biped'))])).toHaveLength(1);
  });

  it('wants every member of a list to fit it', () => {
    const local: Statement = {
      id: id(),
      kind: 'local',
      name: 'x',
      type: list(story('Biped')),
      value: { id: id(), kind: 'arrayOf', of: story('Biped'), items: [text('cat')] },
    };
    expect(check([local])).toHaveLength(1);
  });

  it('checks what’s assigned and what starts a local', () => {
    const assign = (value: Expression): Statement => ({
      id: id(),
      kind: 'assign',
      target: field(SCORE),
      value,
    });
    expect(check([assign(whole(1))])).toEqual([]);
    expect(check([assign(text('one'))])).toHaveLength(1);
  });

  it('checks what a function returns', () => {
    const returns = (value: Expression) =>
      method('double', [{ id: id(), kind: 'return', value }], story('Number'));
    expect(refuse(programWith([], { methods: [returns(num(2))] }))).toEqual([]);
    expect(refuse(programWith([], { methods: [returns(text('two'))] }))).toHaveLength(1);
  });

  it('checks both sides of sums and logic, and allows joining anything', () => {
    const local = (type: string, value: Expression): Statement => ({
      id: id(),
      kind: 'local',
      name: 'x',
      type: story(type),
      value,
    });
    const sum: Expression = {
      id: id(),
      kind: 'arithmetic',
      op: 'add',
      left: text('1'),
      right: num(1),
    };
    expect(check([local('Number', sum)])).toHaveLength(1);
    const both: Expression = {
      id: id(),
      kind: 'logic',
      op: 'and',
      left: num(1),
      right: bool(true),
    };
    expect(check([local('Boolean', both)])).toHaveLength(1);
    const notting: Expression = { id: id(), kind: 'not', value: num(1) };
    expect(check([local('Boolean', notting)])).toHaveLength(1);
    const joined: Expression = { id: id(), kind: 'join', left: text('a'), right: num(1) };
    expect(check([local('Text', joined)])).toEqual([]);
  });

  it('gives a whole number from whole sums, but a number from dividing', () => {
    const sum = (op: 'add' | 'divide'): Statement => ({
      id: id(),
      kind: 'local',
      name: 'x',
      type: story('WholeNumber'),
      value: { id: id(), kind: 'arithmetic', op, left: whole(1), right: whole(2) },
    });
    expect(check([sum('add')])).toEqual([]);
    expect(check([sum('divide')])).toHaveLength(1);
  });

  it('checks a switched-off statement too', () => {
    const off: Statement = { ...call(field(PROP), 'walkTo', { target: cat() }), enabled: false };
    expect(check([off])).toHaveLength(1);
  });
});

describe('a learner’s own procedures', () => {
  const callHop = (target: Expression, height: Expression): Statement => ({
    id: id(),
    kind: 'call',
    target,
    callee: { kind: 'user', method: HOP },
    args: { [HEIGHT]: height },
    details: {},
  });

  it('checks the values given', () => {
    expect(check([callHop(field(PET_FIELD), num(1))])).toEqual([]);
    expect(check([callHop(field(PET_FIELD), text('high'))])).toHaveLength(1);
  });

  it('refuses one on an object that hasn’t got it', () => {
    expect(check([callHop(cat(), num(1))])).toHaveLength(1);
  });
});

describe('events', () => {
  const listener = (over: Partial<ListenerDecl>): ListenerDecl => ({
    id: id(),
    kind: 'listener',
    event: 'sceneStart',
    args: {},
    details: {},
    params: [],
    body: [],
    ...over,
  });
  const withListener = (over: Partial<ListenerDecl>) =>
    programWith([], { listeners: [listener(over)] });
  const objects = (): Expression => ({
    id: id(),
    kind: 'arrayOf',
    of: story('Thing'),
    items: [cat()],
  });

  it('accepts every event with what it needs', () => {
    expect(refuse(withListener({}))).toEqual([]);
    expect(refuse(withListener({ event: 'timer', args: { seconds: num(1) } }))).toEqual([]);
    expect(
      refuse(
        withListener({
          event: 'proximityEnter',
          args: { setA: objects(), setB: objects(), distance: num(2) },
        }),
      ),
    ).toEqual([]);
  });

  it('refuses an event that doesn’t exist, or one left out of the first release', () => {
    expect(refuse(withListener({ event: 'whenPigsFly' }))).toHaveLength(1);
    expect(refuse(withListener({ event: 'occlusionStart' }))).toHaveLength(1);
  });

  it('asks for what an event needs, and checks its type', () => {
    expect(refuse(withListener({ event: 'timer' }))).toHaveLength(1);
    expect(refuse(withListener({ event: 'timer', args: { seconds: text('1') } }))).toHaveLength(1);
  });

  it('checks details', () => {
    const details = { multipleEventPolicy: choice('MultipleEventPolicy', 'enqueue') };
    expect(refuse(withListener({ event: 'clickOnScreen', details }))).toEqual([]);
    expect(refuse(withListener({ details }))).toHaveLength(1);
  });

  it('gives a handler only what the event gives, and allows a narrower type', () => {
    const param = (name: string, type: TypeRef) =>
      ({ id: id(), kind: 'parameter', name, type, default: null }) as const;
    const click = { event: 'clickOnObject' };
    expect(refuse(withListener({ ...click, params: [param('model', story('Model'))] }))).toEqual(
      [],
    );
    expect(refuse(withListener({ ...click, params: [param('model', story('Biped'))] }))).toEqual(
      [],
    );
    expect(
      refuse(withListener({ ...click, params: [param('model', story('Number'))] })),
    ).toHaveLength(1);
    expect(refuse(withListener({ ...click, params: [param('pet', story('Model'))] }))).toHaveLength(
      1,
    );
  });
});

describe('plain words', () => {
  it('gives every problem a reason, the code for an edit refused from outside', () => {
    const problems = checkProgram(
      programWith([call(field(PROP), 'walkTo', { target: cat() }), call(cat(), 'move', {})]),
    );
    expect(problems.length).toBeGreaterThan(1);
    for (const p of problems) {
      expect(p.code).toBe('outside');
      expect(p.reason).toBeTruthy();
      expect(p.reason).not.toMatch(/\{\w+\}/);
    }
  });
});
