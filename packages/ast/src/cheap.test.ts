/**
 * Checking an edit cheaply (spec section 4.2, WP7.10): an edit costs what it changes, not the
 * whole program, and gives the same result as checking it all.
 */
import { describe, expect, it } from 'vitest';
import { applyEdit, EditRefused, type EditOperation } from './edits.ts';
import { nodeId, type NodeId } from './ids.ts';
import type { Expression, Program, Statement } from './nodes.ts';
import { MAX_DEPTH } from './schema.ts';
import { serializeProgram } from './serialize.ts';
import { ids, sampleProgram } from './testing.ts';
import type { Problem } from './validate.ts';
import { indexProgram } from './walk.ts';

const label = 'Change';
/** A node id: at least six characters, as `NODE_ID_PATTERN` asks. */
const nid = (s: string): NodeId => nodeId(s.padEnd(6, 'x'));
const comment = (id: string): Statement => ({ id: nid(id), kind: 'comment', text: 'hi' });
const text = (id: string, value = 'Hi'): Expression => ({ id: nid(id), kind: 'text', value });
const self = (id: string): Expression => ({ id: nid(id), kind: 'this' });
const catRef = (id: string): Expression => ({
  id: nid(id),
  kind: 'fieldRef',
  target: self(`${id}t`),
  field: ids.cat,
});
const say = (id: string, words: Expression = text(`${id}w`)): Statement => ({
  id: nid(id),
  kind: 'call',
  target: catRef(`${id}c`),
  callee: { kind: 'story', name: 'say' },
  args: { text: words },
  details: {},
});

/** What applying an edit did: the bytes it gave, or the code it was refused with. */
function outcome(program: Program, edit: EditOperation, checkWholeShape: boolean) {
  try {
    return { bytes: serializeProgram(applyEdit(program, edit, { checkWholeShape }).program) };
  } catch (e) {
    if (e instanceof EditRefused) return { refused: e.code };
    throw e;
  }
}

/** The edit's outcome, after checking it agrees with checking the whole program. */
function agreed(program: Program, edit: EditOperation) {
  const fast = outcome(program, edit, false);
  expect(fast).toEqual(outcome(program, edit, true));
  return fast;
}

/** `n` do-in-order blocks, one inside the next, around a comment. */
function nested(prefix: string, n: number): Statement {
  let node: Statement = comment(`${prefix}cmt`);
  for (let i = 0; i < n; i++)
    node = {
      id: nid(`${prefix}${i.toString(36).padStart(3, '0')}`),
      kind: 'doInOrder',
      body: [node],
    };
  return node;
}

/** `n` nots, one inside the next, around a boolean. */
function nots(prefix: string, n: number): Expression {
  let e: Expression = { id: nid(`${prefix}yes`), kind: 'boolean', value: true };
  for (let i = 0; i < n; i++)
    e = { id: nid(`${prefix}${i.toString(36).padStart(3, '0')}`), kind: 'not', value: e };
  return e;
}

/** The edits for sizes 0 to `sizes`: some made, the deepest refused, all as the whole check says. */
function acrossTheLimit(make: (n: number) => [Program, EditOperation], sizes = MAX_DEPTH) {
  const results = Array.from({ length: sizes }, (_, i) => {
    const [program, edit] = make(i);
    return 'bytes' in agreed(program, edit);
  });
  // Shallow edits are made, the deepest refused, and nothing in between flips back.
  expect(results[0]).toBe(true);
  expect(results.at(-1)).toBe(false);
  const first = results.indexOf(false);
  expect(results.slice(first).every((made) => !made)).toBe(true);
}

describe('one index for each program', () => {
  it('gives the same index for the same program, and a new one for a new program', () => {
    const program = sampleProgram();
    expect(indexProgram(program)).toBe(indexProgram(program));
    const { program: after } = applyEdit(program, {
      kind: 'insert',
      label,
      parent: ids.main,
      slot: 'body',
      index: 0,
      node: comment('newone'),
    });
    expect(indexProgram(after)).not.toBe(indexProgram(program));
    expect(indexProgram(after).has(nid('newone'))).toBe(true);
    expect(indexProgram(program).has(nid('newone'))).toBe(false);
  });
});

describe('the same edit made twice', () => {
  const edit: EditOperation = {
    kind: 'insert',
    label,
    parent: ids.main,
    slot: 'body',
    index: 0,
    node: comment('newone'),
  };

  it('gives back the same program, so what is worked out for it carries over', () => {
    const program = sampleProgram();
    const tried = applyEdit(program, edit);
    const made = applyEdit(program, edit);
    expect(made.program).toBe(tried.program);
    expect(made.inverse).toEqual(tried.inverse);
  });

  it('is still checked each time, with the check it is given', () => {
    const program = sampleProgram();
    applyEdit(program, edit);
    const outside: Problem = { code: 'outside', message: 'No.', node: null, reason: 'Not now.' };
    expect(() => applyEdit(program, edit, { check: () => [outside] })).toThrow(EditRefused);
  });

  it('is a new edit when it is a new object, even with the same words', () => {
    const program = sampleProgram();
    const first = applyEdit(program, edit).program;
    expect(applyEdit(program, { ...edit }).program).not.toBe(first);
  });
});

describe('the depth, checked only where an edit adds (spec section 4.2)', () => {
  it('agrees for a statement put in at any depth', () => {
    acrossTheLimit((n) => [
      sampleProgram(),
      { kind: 'insert', label, parent: ids.main, slot: 'body', index: 0, node: nested('d', n) },
    ]);
  });

  it('agrees for a statement put in deep inside others', () => {
    // A program already 60 deep, and a statement of any depth put at the bottom of it.
    const base = applyEdit(sampleProgram(), {
      kind: 'insert',
      label,
      parent: ids.main,
      slot: 'body',
      index: 0,
      node: nested('w', 60),
    }).program;
    acrossTheLimit((n) => [
      base,
      { kind: 'insert', label, parent: nid('w000'), slot: 'body', index: 0, node: nested('d', n) },
    ]);
  });

  it('agrees for a value of any depth', () => {
    acrossTheLimit((n) => [
      sampleProgram(),
      {
        kind: 'setArgument',
        label,
        node: ids.say,
        slot: 'args',
        param: 'text',
        value: nots('v', n),
      },
    ]);
  });

  it('agrees for a value in a slot holding one', () => {
    const program = applyEdit(sampleProgram(), {
      kind: 'insert',
      label,
      parent: ids.main,
      slot: 'body',
      index: 0,
      node: {
        id: nid('whilst'),
        kind: 'while',
        condition: { id: nid('cond'), kind: 'boolean', value: false },
        body: [],
      },
    }).program;
    acrossTheLimit((n) => [
      program,
      { kind: 'setArgument', label, node: nid('whilst'), slot: 'condition', value: nots('v', n) },
    ]);
  });

  it('agrees for a method of any depth', () => {
    acrossTheLimit((n) => [
      sampleProgram(),
      {
        kind: 'declare',
        label,
        parent: ids.scene,
        index: 0,
        node: {
          id: nid('deepm'),
          kind: 'method',
          name: 'deep',
          returns: null,
          params: [],
          body: [nested('d', n)],
        },
      },
    ]);
  });

  it('agrees for a statement moved deep inside others', () => {
    acrossTheLimit((n) => {
      // A 60-deep stack, and beside it a statement `n` deep, moved to the bottom of the stack.
      const program = [nested('w', 60), nested('d', n)].reduce(
        (p, node) =>
          applyEdit(p, { kind: 'insert', label, parent: ids.main, slot: 'body', index: 0, node })
            .program,
        sampleProgram(),
      );
      return [
        program,
        {
          kind: 'move',
          label,
          node: n === 0 ? nid('dcmt') : nid(`d${(n - 1).toString(36).padStart(3, '0')}`),
          parent: nid('w000'),
          slot: 'body',
          index: 0,
        },
      ];
      // Up to 120 deep: as deep as fits beside the stack before the move.
    }, 120);
  });
});

describe('the rules, checked only around an edit when it can be (spec section 4.2)', () => {
  const insert = (node: Statement, program = sampleProgram()) =>
    agreed(program, { kind: 'insert', label, parent: ids.main, slot: 'body', index: 0, node });
  const setText = (value: Expression | null, program = sampleProgram()) =>
    agreed(program, {
      kind: 'setArgument',
      label,
      node: ids.say,
      slot: 'args',
      param: 'text',
      value,
    });

  it('makes a statement that needs nothing around it', () => {
    expect(insert(say('newsay'))).toHaveProperty('bytes');
  });

  it('refuses one with an id already in use, even inside it', () => {
    expect(insert(say('newsay', text(ids.say)))).toEqual({ refused: 'would_break' });
    expect(insert(say(ids.say))).toEqual({ refused: 'would_break' });
  });

  it('refuses one with the same id twice inside it', () => {
    const twice: Statement = {
      id: nid('two'),
      kind: 'doInOrder',
      body: [say('same'), say('same')],
    };
    expect(insert(twice)).toEqual({ refused: 'would_break' });
  });

  it('refuses one naming a field, type or method that isn’t there', () => {
    const noField: Expression = {
      ...(catRef('nf') as object),
      field: nid('nofield'),
    } as Expression;
    expect(insert(say('a1', noField))).toEqual({ refused: 'would_break' });
    const list: Expression = {
      id: nid('lst'),
      kind: 'arrayOf',
      of: { kind: 'user', type: nid('notype') },
      items: [],
    };
    expect(setText(list)).toEqual({ refused: 'would_break' });
    expect(
      insert({
        id: nid('a2'),
        kind: 'call',
        target: self('a2s'),
        callee: { kind: 'user', method: nid('nomethod') },
        args: {},
        details: {},
      }),
    ).toEqual({ refused: 'would_break' });
  });

  it('checks a value naming a variable as it always has', () => {
    const v: Expression = { id: nid('vr'), kind: 'variableRef', variable: nid('novar') };
    expect(setText(v)).toEqual({ refused: 'would_break' });
  });

  it('gives a replaced value’s ids to the new one', () => {
    const program = sampleProgram();
    const old = indexProgram(program).get(ids.say)!.node as Statement & { kind: 'call' };
    expect(setText(text(old.args.text!.id, 'Bye'), program)).toHaveProperty('bytes');
  });

  it('refuses taking away a value something needs, and adding one it can’t have', () => {
    expect(setText(null)).toHaveProperty('bytes');
    const program = sampleProgram();
    const assign: Statement = {
      id: nid('asg'),
      kind: 'assign',
      target: { id: nid('asgt'), kind: 'fieldRef', target: self('asgs'), field: ids.score },
      value: { id: nid('asgv'), kind: 'wholeNumber', value: 1 },
    };
    const withAssign = applyEdit(program, {
      kind: 'insert',
      label,
      parent: ids.main,
      slot: 'body',
      index: 0,
      node: assign,
    }).program;
    expect(
      agreed(withAssign, {
        kind: 'setArgument',
        label,
        node: nid('asg'),
        slot: 'target',
        value: text('lit'),
      }),
    ).toEqual({ refused: 'not_here' });
  });

  it('takes out, moves, switches off and rewords a statement that declares nothing', () => {
    const program = applyEdit(sampleProgram(), {
      kind: 'insert',
      label,
      parent: ids.main,
      slot: 'body',
      index: 0,
      node: say('newsay'),
    }).program;
    const at = nid('newsay');
    expect(agreed(program, { kind: 'remove', label, node: at })).toHaveProperty('bytes');
    expect(
      agreed(program, {
        kind: 'move',
        label,
        node: at,
        parent: ids.together,
        slot: 'body',
        index: 0,
      }),
    ).toHaveProperty('bytes');
    expect(agreed(program, { kind: 'setEnabled', label, node: at, enabled: false })).toHaveProperty(
      'bytes',
    );
  });

  it('still refuses taking out a local in use, or moving a use out of its scope', () => {
    const local: Statement = {
      id: nid('loc'),
      kind: 'local',
      name: 'n',
      type: { kind: 'story', name: 'Number' },
      value: { id: nid('locv'), kind: 'number', value: 1 },
    };
    const use = say('use', { id: nid('usev'), kind: 'variableRef', variable: nid('loc') });
    const block: Statement = { id: nid('blk'), kind: 'doInOrder', body: [local, use] };
    const program = applyEdit(sampleProgram(), {
      kind: 'insert',
      label,
      parent: ids.main,
      slot: 'body',
      index: 0,
      node: block,
    }).program;
    expect(agreed(program, { kind: 'remove', label, node: nid('loc') })).toEqual({
      refused: 'in_use',
    });
    expect(
      agreed(program, {
        kind: 'move',
        label,
        node: nid('use'),
        parent: ids.main,
        slot: 'body',
        index: 0,
      }),
    ).toEqual({ refused: 'not_here' });
  });

  it('runs the check it is given on the whole program, as before', () => {
    const seen: Program[] = [];
    const check = (p: Program) => {
      seen.push(p);
      return [];
    };
    const { program } = applyEdit(
      sampleProgram(),
      { kind: 'insert', label, parent: ids.main, slot: 'body', index: 0, node: say('newsay') },
      { check },
    );
    expect(seen).toEqual([program]);
  });
});
