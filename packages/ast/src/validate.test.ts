import { describe, expect, it } from 'vitest';
import { nodeId } from './ids.ts';
import type { Comment, Expression, MethodDecl, Program, Statement, TypeDecl } from './nodes.ts';
import { ids, sampleProgram } from './testing.ts';
import { validateProgram, type ProblemCode } from './validate.ts';

const scene = (p: Program): TypeDecl => p.types[0]!;
const main = (p: Program): MethodDecl => scene(p).methods[0]!;

/** The sample with the main method's body replaced. */
function withBody(body: readonly Statement[], p = sampleProgram()): Program {
  const methods = [{ ...main(p), body }, ...scene(p).methods.slice(1)];
  return { ...p, types: [{ ...scene(p), methods }] };
}

const expr = (id: string, rest: object): Expression => ({ id: nodeId(id), ...rest }) as Expression;
const codes = (p: unknown) => validateProgram(p).map((x) => x.code);
const expectCode = (p: unknown, code: ProblemCode) => expect(codes(p)).toContain(code);

const text = (id: string): Expression => expr(id, { kind: 'text', value: 'a' });
const ref = (id: string, variable: string): Expression =>
  expr(id, { kind: 'variableRef', variable });
const local = (id: string, name: string, value: Expression = text(`${id}0v`)): Statement =>
  ({
    id: nodeId(id),
    kind: 'local',
    name,
    type: { kind: 'story', name: 'Text' },
    value,
  }) as Statement;
const comment = (id: string): Comment => ({ id: nodeId(id), kind: 'comment', text: 'hi' });
const useOf = (id: string, variable: string): Statement => ({
  id: nodeId(id),
  kind: 'assign',
  target: expr(`${id}0t`, {
    kind: 'fieldRef',
    target: expr(`${id}0s`, { kind: 'this' }),
    field: ids.score,
  }),
  value: ref(`${id}0r`, variable),
});

describe('validateProgram', () => {
  it('accepts the sample, which holds every statement and expression kind', () => {
    expect(validateProgram(sampleProgram())).toEqual([]);
  });

  it('accepts an empty program', () => {
    expect(validateProgram({ schemaVersion: '1.0.0', types: [] })).toEqual([]);
  });

  it.each([
    ['not an object', 3],
    ['null', null],
    ['no types', { schemaVersion: '1.0.0' }],
    ['a bad version', { schemaVersion: 'one', types: [] }],
    ['an extra property', { schemaVersion: '1.0.0', types: [], extra: 1 }],
  ])('refuses the shape of %s', (_, value) => {
    expectCode(value, 'shape');
  });

  it('refuses an unknown statement kind', () => {
    expectCode(
      withBody([{ id: nodeId('oddone'), kind: 'dance' } as unknown as Statement]),
      'shape',
    );
  });

  it('refuses a missing expression: no slot is ever empty', () => {
    const count = { id: nodeId('counta'), kind: 'count', body: [] } as unknown as Statement;
    expectCode(withBody([count]), 'shape');
  });

  it('refuses a bad id, and a number that is not finite', () => {
    expectCode(withBody([comment('BAD ID')]), 'shape');
    expectCode(
      withBody([local('locala', 'a', expr('notfin', { kind: 'number', value: Infinity }))]),
      'shape',
    );
  });

  it('refuses a whole number with a fraction', () => {
    expectCode(
      withBody([local('locala', 'a', expr('fracnm', { kind: 'wholeNumber', value: 1.5 }))]),
      'shape',
    );
  });

  it('refuses `enabled: true`, so each program has one form', () => {
    expectCode(
      withBody([{ ...comment('commnt'), enabled: true } as unknown as Statement]),
      'shape',
    );
  });

  it('refuses a `__proto__` argument name', () => {
    const args = JSON.parse('{"__proto__": {"id":"protoa","kind":"none"}}') as object;
    const call = {
      id: nodeId('callaa'),
      kind: 'call',
      target: expr('thisaa', { kind: 'this' }),
      callee: { kind: 'story', name: 'say' },
      args,
      details: {},
    } as unknown as Statement;
    expectCode(withBody([call]), 'shape');
  });

  it('refuses text and names over the limits', () => {
    expectCode(withBody([{ ...comment('commnt'), text: 'x'.repeat(10_001) }]), 'too_long');
    expectCode(withBody([local('locala', 'x'.repeat(61))]), 'too_long');
  });

  it('counts a limit in characters, so emoji cost one each', () => {
    expect(
      validateProgram(withBody([{ ...comment('commnt'), text: '🐈'.repeat(10_000) }])),
    ).toEqual([]);
  });

  it('accepts names in Welsh and Gaelic letters', () => {
    expect(validateProgram(withBody([local('locala', 'dŵr'), local('localb', 'màthair')]))).toEqual(
      [],
    );
  });

  it('refuses nesting too deep to walk safely', () => {
    let e: Expression = expr('deep00', { kind: 'none' });
    for (let i = 1; i < 300; i++)
      e = expr(`deep${i.toString(36).padStart(2, '0')}`, { kind: 'not', value: e });
    expectCode(withBody([local('locala', 'a', e)]), 'too_deep');
  });

  it('refuses two nodes with one id', () => {
    expectCode(withBody([comment('sameid'), comment('sameid')]), 'duplicate_id');
  });

  it('refuses references to nothing', () => {
    expectCode(withBody([useOf('useofa', 'nosuch')]), 'missing_reference');

    const field = expr('fieldr', {
      kind: 'fieldRef',
      target: expr('thisaa', { kind: 'this' }),
      field: 'nosuch',
    });
    expectCode(withBody([local('locala', 'a', field)]), 'missing_reference');

    const call: Statement = {
      id: nodeId('callaa'),
      kind: 'call',
      target: expr('thisaa', { kind: 'this' }),
      callee: { kind: 'user', method: nodeId('nosuch') },
      args: {},
      details: {},
    };
    expectCode(withBody([call]), 'missing_reference');

    const typed: Statement = {
      ...local('locala', 'a'),
      type: { kind: 'user', type: nodeId('nosuch') },
    } as Statement;
    expectCode(withBody([typed]), 'missing_reference');
  });

  it('scopes a local to the statements after it, and what is inside them', () => {
    expect(
      validateProgram(
        withBody([
          local('locala', 'a'),
          { id: nodeId('blockb'), kind: 'doInOrder', body: [useOf('useofa', 'locala')] },
        ]),
      ),
    ).toEqual([]);

    expectCode(withBody([useOf('useofa', 'locala'), local('locala', 'a')]), 'out_of_scope');
    expectCode(
      withBody([
        { id: nodeId('blockb'), kind: 'doInOrder', body: [local('locala', 'a')] },
        useOf('useofa', 'locala'),
      ]),
      'out_of_scope',
    );
  });

  it("doesn't let a local see itself in its own value", () => {
    expectCode(withBody([local('locala', 'a', ref('reffff', 'locala'))]), 'out_of_scope');
  });

  it('scopes a loop item to its loop body, not its list', () => {
    const loop = (body: readonly Statement[], items: Expression = text('itemsa')): Statement => ({
      id: nodeId('looplp'),
      kind: 'forEach',
      item: {
        id: nodeId('itemzz'),
        kind: 'loopItem',
        name: 'thing',
        type: { kind: 'story', name: 'Text' },
      },
      items,
      body,
    });
    expect(validateProgram(withBody([loop([useOf('useofa', 'itemzz')])]))).toEqual([]);
    expectCode(withBody([loop([], ref('reffff', 'itemzz'))]), 'out_of_scope');
    expectCode(withBody([loop([]), useOf('useofa', 'itemzz')]), 'out_of_scope');
  });

  it("doesn't let one method see another's locals or parameters", () => {
    expectCode(withBody([useOf('useofa', ids.height)]), 'out_of_scope');
  });

  it('refuses shadowing, but lets side-by-side loops share a name', () => {
    expectCode(
      withBody([
        local('locala', 'a'),
        { id: nodeId('blockb'), kind: 'doInOrder', body: [local('localb', 'a')] },
      ]),
      'duplicate_name',
    );
    const loop = (id: string): Statement => ({
      id: nodeId(id),
      kind: 'forEach',
      item: {
        id: nodeId(`${id}i`),
        kind: 'loopItem',
        name: 'item',
        type: { kind: 'story', name: 'Text' },
      },
      items: text(`${id}e`),
      body: [],
    });
    expect(validateProgram(withBody([loop('loopaa'), loop('loopbb')]))).toEqual([]);
  });

  it('refuses a local with the same name as a parameter', () => {
    const p = sampleProgram();
    const hop = scene(p).methods[1]!;
    const methods = [main(p), { ...hop, body: [local('locala', 'height')] }, scene(p).methods[2]!];
    expectCode({ ...p, types: [{ ...scene(p), methods }] }, 'duplicate_name');
  });

  it('refuses two types, or a field and a method, with one name', () => {
    const p = sampleProgram();
    const copy: TypeDecl = {
      id: nodeId('typeb1'),
      kind: 'type',
      name: 'Scene1',
      extends: { kind: 'story', name: 'Scene' },
      fields: [],
      methods: [],
      listeners: [],
    };
    expectCode({ ...p, types: [...p.types, copy] }, 'duplicate_name');

    const clash = { ...scene(p).fields[0]!, id: nodeId('fieldb'), name: 'hop' };
    expectCode(
      { ...p, types: [{ ...scene(p), fields: [...scene(p).fields, clash] }] },
      'duplicate_name',
    );
  });

  it('refuses a cycle of `extends`', () => {
    const a = nodeId('typeaa');
    const b = nodeId('typebb');
    const type = (id: typeof a, name: string, parent: typeof a): TypeDecl => ({
      id,
      kind: 'type',
      name,
      extends: { kind: 'user', type: parent },
      fields: [],
      methods: [],
      listeners: [],
    });
    expectCode(
      { schemaVersion: '1.0.0', types: [type(a, 'A', b), type(b, 'B', a)] },
      'extends_cycle',
    );
  });

  it('refuses assigning to anything but a variable, field or list item', () => {
    const assign: Statement = {
      id: nodeId('assign'),
      kind: 'assign',
      target: text('target'),
      value: text('valuea'),
    };
    expectCode(withBody([assign]), 'bad_assign');
  });

  it('refuses assigning to a constant or a loop item', () => {
    const constant = { ...local('locala', 'a'), constant: true } as Statement;
    const assign = (target: Expression): Statement => ({
      id: nodeId('assign'),
      kind: 'assign',
      target,
      value: text('valuea'),
    });
    expectCode(withBody([constant, assign(ref('reffff', 'locala'))]), 'bad_assign');

    const loop: Statement = {
      id: nodeId('looplp'),
      kind: 'forEach',
      item: {
        id: nodeId('itemzz'),
        kind: 'loopItem',
        name: 'thing',
        type: { kind: 'story', name: 'Text' },
      },
      items: text('itemsa'),
      body: [assign(ref('reffff', 'itemzz'))],
    };
    expectCode(withBody([loop]), 'bad_assign');
  });

  it('keeps `return` to methods, outside anything together', () => {
    const none: Statement = { id: nodeId('return'), kind: 'return', value: null };
    expect(validateProgram(withBody([none]))).toEqual([]);

    expectCode(
      withBody([{ id: nodeId('blockb'), kind: 'doTogether', body: [none] }]),
      'bad_return',
    );
    expectCode(
      withBody([
        {
          id: nodeId('looplp'),
          kind: 'eachTogether',
          item: {
            id: nodeId('itemzz'),
            kind: 'loopItem',
            name: 'thing',
            type: { kind: 'story', name: 'Text' },
          },
          items: text('itemsa'),
          body: [{ id: nodeId('blockb'), kind: 'doInOrder', body: [none] }],
        },
      ]),
      'bad_return',
    );

    const p = sampleProgram();
    const listener = { ...scene(p).listeners[0]!, body: [none] };
    expectCode({ ...p, types: [{ ...scene(p), listeners: [listener] }] }, 'bad_return');
  });

  it('wants a value from a function and none from a procedure', () => {
    expectCode(
      withBody([{ id: nodeId('return'), kind: 'return', value: text('valuea') }]),
      'bad_return',
    );
    const p = sampleProgram();
    const double = {
      ...scene(p).methods[2]!,
      body: [{ id: nodeId('return'), kind: 'return', value: null } as Statement],
    };
    const methods = [main(p), scene(p).methods[1]!, double];
    expectCode({ ...p, types: [{ ...scene(p), methods }] }, 'bad_return');
  });

  describe('a call to a user method', () => {
    const call = (args: object, details: object = {}, method = ids.hop): Statement =>
      ({
        id: nodeId('callaa'),
        kind: 'call',
        target: expr('thisaa', { kind: 'this' }),
        callee: { kind: 'user', method },
        args,
        details,
      }) as Statement;

    it('may leave out a parameter with a default', () => {
      expect(validateProgram(withBody([call({})]))).toEqual([]);
    });

    it('may not leave out one with no default', () => {
      const p = sampleProgram();
      const hop = scene(p).methods[1]!;
      const noDefault = { ...hop, params: [{ ...hop.params[0]!, default: null }] };
      const q: Program = {
        ...p,
        types: [{ ...scene(p), methods: [main(p), noDefault, scene(p).methods[2]!] }],
      };
      expectCode(withBody([call({})], q), 'bad_call');
    });

    it('may not pass a parameter the method does not have', () => {
      expectCode(withBody([call({ nosuch: text('valuea') })]), 'bad_call');
    });

    it('has no details', () => {
      expectCode(withBody([call({}, { duration: text('valuea') })]), 'bad_call');
    });

    it('as a value must be a function', () => {
      const fn = expr('callfn', {
        kind: 'functionCall',
        target: expr('thisaa', { kind: 'this' }),
        callee: { kind: 'user', method: ids.hop },
        args: {},
        details: {},
      });
      expectCode(withBody([local('locala', 'a', fn)]), 'bad_call');
    });
  });

  it('refuses a default on a listener parameter, which the event supplies', () => {
    const p = sampleProgram();
    const listener = scene(p).listeners[0]!;
    const param = { ...listener.params[0]!, default: text('defalt') };
    expectCode(
      { ...p, types: [{ ...scene(p), listeners: [{ ...listener, params: [param] }] }] },
      'bad_parameter',
    );
  });

  it('runs a check from outside after its own', () => {
    const problems = validateProgram(sampleProgram(), {
      check: () => [{ code: 'outside', message: 'No cats on Tuesdays.', node: ids.cat }],
    });
    expect(problems.map((p) => p.code)).toEqual(['outside']);
  });

  it("doesn't run a check from outside on an invalid program", () => {
    let ran = false;
    validateProgram(3, {
      check: () => {
        ran = true;
        return [];
      },
    });
    expect(ran).toBe(false);
  });

  describe('lenient, for a file from a newer version', () => {
    const lenient = (p: unknown) => validateProgram(p, { lenient: true }).map((x) => x.code);

    it('skips unknown kinds and properties', () => {
      const odd = { id: nodeId('oddone'), kind: 'dance', style: 'tap' } as unknown as Statement;
      const extra = { ...comment('commnt'), mood: 'happy' } as unknown as Statement;
      expect(lenient(withBody([odd, extra]))).toEqual([]);
    });

    it('still refuses what it knows is wrong', () => {
      const broken = { id: nodeId('counta'), kind: 'count', body: [] } as unknown as Statement;
      expect(lenient(withBody([broken]))).toContain('shape');
      expect(lenient(3)).toContain('shape');
    });

    it('still refuses nesting too deep', () => {
      let e: unknown = { id: 'deep00', kind: 'dance' };
      for (let i = 0; i < 300; i++) e = { id: 'deep00', kind: 'dance', inner: e };
      expect(lenient({ schemaVersion: '2.0.0', types: [e] })).toContain('too_deep');
    });
  });
});
