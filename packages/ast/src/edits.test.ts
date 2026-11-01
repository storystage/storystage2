import { describe, expect, it } from 'vitest';
import { applyEdit, applyEdits, defaultLabel, EditRefused, type EditOperation } from './edits.ts';
import { nodeId, type NodeId } from './ids.ts';
import type { Declaration, Expression, MethodDecl, Program, Statement, TypeDecl } from './nodes.ts';
import { serializeProgram } from './serialize.ts';
import { ids, sampleProgram } from './testing.ts';
import { validateProgram } from './validate.ts';
import { indexProgram } from './walk.ts';

const label = 'Change';
const comment = (id: string, text = 'hi'): Statement => ({ id: nodeId(id), kind: 'comment', text });
const text = (id: string, value = 'Hi'): Expression => ({ id: nodeId(id), kind: 'text', value });
const number = (id: string, value = 1): Expression => ({ id: nodeId(id), kind: 'number', value });

const scene = (p: Program): TypeDecl => p.types[0]!;
const main = (p: Program): MethodDecl => scene(p).methods[0]!;
const nodeOf = (p: Program, id: NodeId) => indexProgram(p).get(id)?.node;
const bodyIds = (p: Program, id: NodeId = ids.main) =>
  (nodeOf(p, id) as { body: readonly Statement[] }).body.map((s) => s.id);

/** Applies an edit and checks the inverse gives back the same bytes. */
function roundTrip(edit: EditOperation, start: Program = sampleProgram()): Program {
  const { program, inverse } = applyEdit(start, edit);
  expect(validateProgram(program)).toEqual([]);
  expect(serializeProgram(applyEdit(program, inverse).program)).toBe(serializeProgram(start));
  return program;
}

function refusal(edit: EditOperation, start: Program = sampleProgram()): EditRefused {
  try {
    applyEdit(start, edit);
  } catch (e) {
    if (e instanceof EditRefused) return e;
    throw e;
  }
  throw new Error('The edit was not refused.');
}

describe('insert', () => {
  it('adds a statement at an index, and undoes', () => {
    const p = roundTrip({
      kind: 'insert',
      label,
      parent: ids.main,
      slot: 'body',
      index: 1,
      node: comment('newone'),
    });
    expect(bodyIds(p).slice(0, 3)).toEqual([ids.say, nodeId('newone'), ids.together]);
  });

  it('adds at the end when the index is the length', () => {
    const end = main(sampleProgram()).body.length;
    const p = roundTrip({
      kind: 'insert',
      label,
      parent: ids.main,
      slot: 'body',
      index: end,
      node: comment('newone'),
    });
    expect(bodyIds(p).at(-1)).toBe('newone');
  });

  it('goes in the else of an if', () => {
    const p = roundTrip({
      kind: 'insert',
      label,
      parent: ids.branch,
      slot: 'else',
      index: 0,
      node: comment('newone'),
    });
    expect((nodeOf(p, ids.branch) as { else: readonly Statement[] }).else).toHaveLength(1);
  });

  it('shares what it did not change', () => {
    const start = sampleProgram();
    const { program } = applyEdit(start, {
      kind: 'insert',
      label,
      parent: ids.hop,
      slot: 'body',
      index: 0,
      node: comment('newone'),
    });
    expect(scene(program).methods[0]).toBe(scene(start).methods[0]);
    expect(scene(program).fields).toBe(scene(start).fields);
    expect(start).toEqual(sampleProgram());
  });

  it('refuses an unknown parent', () => {
    expect(
      refusal({
        kind: 'insert',
        label,
        parent: nodeId('nosuch'),
        slot: 'body',
        index: 0,
        node: comment('newone'),
      }).code,
    ).toBe('gone');
  });

  it.each([
    ['a slot the parent has not got', { parent: ids.say, slot: 'body', index: 0 }],
    ['the then of a method', { parent: ids.main, slot: 'then', index: 0 }],
    ['a list that holds no statements', { parent: ids.scene, slot: 'fields', index: 0 }],
    ['an index past the end', { parent: ids.hop, slot: 'body', index: 1 }],
    ['a negative index', { parent: ids.hop, slot: 'body', index: -1 }],
    ['a fractional index', { parent: ids.hop, slot: 'body', index: 0.5 }],
  ])('refuses %s', (_, where) => {
    const edit = { kind: 'insert', label, node: comment('newone'), ...where } as EditOperation;
    expect(refusal(edit).code).toBe('not_here');
  });

  it('refuses a declaration in place of a statement', () => {
    const node = scene(sampleProgram()).fields[0] as unknown as Statement;
    expect(
      refusal({ kind: 'insert', label, parent: ids.hop, slot: 'body', index: 0, node }).code,
    ).toBe('not_here');
  });

  it('refuses an id already in use', () => {
    expect(
      refusal({
        kind: 'insert',
        label,
        parent: ids.hop,
        slot: 'body',
        index: 0,
        node: comment(ids.say),
      }).code,
    ).toBe('would_break');
  });

  it('refuses a return inside do together, as somewhere it can not go', () => {
    const node: Statement = { id: nodeId('return'), kind: 'return', value: null };
    expect(
      refusal({ kind: 'insert', label, parent: ids.together, slot: 'body', index: 0, node }).code,
    ).toBe('not_here');
  });

  it('refuses text past the limit', () => {
    const node = comment('newone', 'x'.repeat(10_001));
    expect(
      refusal({ kind: 'insert', label, parent: ids.hop, slot: 'body', index: 0, node }).code,
    ).toBe('too_big');
  });

  it('refuses nesting past the limit', () => {
    let node: Statement = comment('deepa0');
    for (let i = 1; i < 150; i++)
      node = {
        id: nodeId(`deep${i.toString(36).padStart(2, '0')}`),
        kind: 'doInOrder',
        body: [node],
      };
    expect(
      refusal({ kind: 'insert', label, parent: ids.hop, slot: 'body', index: 0, node }).code,
    ).toBe('too_big');
  });
});

describe('remove', () => {
  it('takes out a statement, and undo brings back the same ids', () => {
    const p = roundTrip({ kind: 'remove', label, node: ids.together });
    expect(bodyIds(p)).not.toContain(ids.together);
    expect(nodeOf(p, ids.move)).toBeUndefined();
  });

  it('takes out the last statement in a list', () => {
    roundTrip({ kind: 'remove', label, node: ids.sequence });
  });

  it('takes out a declaration not in use, and undo declares it again', () => {
    const p = roundTrip({ kind: 'remove', label, node: ids.double });
    expect(scene(p).methods.map((m) => m.name)).toEqual(['myFirstMethod', 'hop']);
  });

  it('takes out a listener', () => {
    expect(scene(roundTrip({ kind: 'remove', label, node: ids.click })).listeners).toEqual([]);
  });

  it('takes out a type, and undo puts it back in place', () => {
    const start = sampleProgram();
    const other: TypeDecl = {
      ...scene(start),
      id: nodeId('othert'),
      name: 'Other',
      fields: [],
      methods: [],
      listeners: [],
    };
    const two: Program = { ...start, types: [other, ...start.types] };
    expect(
      roundTrip({ kind: 'remove', label, node: other.id }, two).types.map((t) => t.name),
    ).toEqual(['Scene1']);
  });

  it('refuses a field in use, by name', () => {
    const refused = refusal({ kind: 'remove', label, node: ids.cat });
    expect(refused.code).toBe('in_use');
    expect(refused.reason).toBe('cat is still used in your code. Take those blocks out first.');
  });

  it('refuses a method, parameter or local in use', () => {
    expect(refusal({ kind: 'remove', label, node: ids.hop }).code).toBe('in_use');
    expect(refusal({ kind: 'remove', label, node: ids.clicked }).code).toBe('in_use');
    expect(refusal({ kind: 'remove', label, node: ids.local }).code).toBe('in_use');
  });

  it('allows it once the uses have gone', () => {
    const p = applyEdits(sampleProgram(), [
      { kind: 'remove', label, node: ids.callHop },
      { kind: 'remove', label, node: ids.hop },
    ]);
    expect(scene(p).methods.map((m) => m.name)).toEqual(['myFirstMethod', 'double']);
  });

  it('refuses an expression, or a loop item: only the slot can change', () => {
    const anExpression = (main(sampleProgram()).body[0] as { target: Expression }).target.id;
    expect(refusal({ kind: 'remove', label, node: anExpression }).code).toBe('not_here');
    expect(refusal({ kind: 'remove', label, node: ids.item }).code).toBe('not_here');
  });

  it('refuses an unknown id', () => {
    expect(refusal({ kind: 'remove', label, node: nodeId('nosuch') }).code).toBe('gone');
  });
});

describe('move', () => {
  it('moves within a list: index is where it ends up', () => {
    const p = roundTrip({
      kind: 'move',
      label,
      node: ids.say,
      parent: ids.main,
      slot: 'body',
      index: 2,
    });
    expect(bodyIds(p).slice(0, 3)).toEqual([ids.together, ids.count, ids.say]);
  });

  it('moves up within a list', () => {
    const p = roundTrip({
      kind: 'move',
      label,
      node: ids.count,
      parent: ids.main,
      slot: 'body',
      index: 0,
    });
    expect(bodyIds(p)[0]).toBe(ids.count);
  });

  it('moves to the very end', () => {
    const last = main(sampleProgram()).body.length - 1;
    const p = roundTrip({
      kind: 'move',
      label,
      node: ids.say,
      parent: ids.main,
      slot: 'body',
      index: last,
    });
    expect(bodyIds(p).at(-1)).toBe(ids.say);
  });

  it('moves between lists, and keeps ids', () => {
    const p = roundTrip({
      kind: 'move',
      label,
      node: ids.move,
      parent: ids.hop,
      slot: 'body',
      index: 0,
    });
    expect(bodyIds(p, ids.hop)).toEqual([ids.move]);
    expect(bodyIds(p, ids.together)).toEqual([ids.turn]);
  });

  it('refuses a move into itself or its own insides', () => {
    expect(
      refusal({
        kind: 'move',
        label,
        node: ids.together,
        parent: ids.together,
        slot: 'body',
        index: 0,
      }).code,
    ).toBe('into_itself');
    const nested: Program = applyEdit(sampleProgram(), {
      kind: 'insert',
      label,
      parent: ids.sequence,
      slot: 'body',
      index: 0,
      node: { id: nodeId('innerb'), kind: 'doInOrder', body: [] },
    }).program;
    const refused = refusal(
      { kind: 'move', label, node: ids.sequence, parent: nodeId('innerb'), slot: 'body', index: 0 },
      nested,
    );
    expect(refused.code).toBe('into_itself');
    expect(refused.reason).toBe("A block can't go inside itself.");
  });

  it('counts the index after the block has left', () => {
    const length = main(sampleProgram()).body.length;
    expect(
      refusal({ kind: 'move', label, node: ids.say, parent: ids.main, slot: 'body', index: length })
        .code,
    ).toBe('not_here');
  });

  it('refuses moving a use out of a local’s scope', () => {
    const start = applyEdit(sampleProgram(), {
      kind: 'insert',
      label,
      parent: ids.sequence,
      slot: 'body',
      index: 0,
      node: {
        id: nodeId('useofx'),
        kind: 'assign',
        target: { id: nodeId('useof1'), kind: 'variableRef', variable: ids.local },
        value: number('useof2'),
      },
    }).program;
    expect(
      refusal(
        { kind: 'move', label, node: nodeId('useofx'), parent: ids.hop, slot: 'body', index: 0 },
        start,
      ).code,
    ).toBe('not_here');
  });

  it('refuses moving a local below its uses', () => {
    const last = main(sampleProgram()).body.length - 1;
    expect(
      refusal({ kind: 'move', label, node: ids.local, parent: ids.main, slot: 'body', index: last })
        .code,
    ).toBe('not_here');
  });

  it('refuses something that is not a statement', () => {
    expect(
      refusal({ kind: 'move', label, node: ids.cat, parent: ids.hop, slot: 'body', index: 0 }).code,
    ).toBe('not_here');
  });

  it('refuses unknown ids', () => {
    expect(
      refusal({
        kind: 'move',
        label,
        node: nodeId('nosuch'),
        parent: ids.hop,
        slot: 'body',
        index: 0,
      }).code,
    ).toBe('gone');
    expect(
      refusal({
        kind: 'move',
        label,
        node: ids.say,
        parent: nodeId('nosuch'),
        slot: 'body',
        index: 0,
      }).code,
    ).toBe('gone');
  });
});

describe('setArgument', () => {
  it('replaces an argument, and undoes', () => {
    const p = roundTrip({
      kind: 'setArgument',
      label,
      node: ids.say,
      slot: 'args',
      param: 'text',
      value: text('newtxt'),
    });
    expect((nodeOf(p, ids.say) as { args: Record<string, Expression> }).args.text?.id).toBe(
      'newtxt',
    );
  });

  it('adds a detail and takes it out', () => {
    const p = roundTrip({
      kind: 'setArgument',
      label,
      node: ids.say,
      slot: 'details',
      param: 'duration',
      value: number('newnum'),
    });
    const details = (node: unknown) => Object.keys((node as { details: object }).details);
    expect(details(nodeOf(p, ids.say))).toEqual(['duration']);
    const q = roundTrip(
      {
        kind: 'setArgument',
        label,
        node: ids.say,
        slot: 'details',
        param: 'duration',
        value: null,
      },
      p,
    );
    expect(details(nodeOf(q, ids.say))).toEqual([]);
  });

  it('gives the same bytes whichever order details were added', () => {
    const add = (param: string, id: string): EditOperation => ({
      kind: 'setArgument',
      label,
      node: ids.say,
      slot: 'details',
      param,
      value: number(id),
    });
    const one = applyEdits(sampleProgram(), [add('duration', 'numone'), add('style', 'numtwo')]);
    const two = applyEdits(sampleProgram(), [add('style', 'numtwo'), add('duration', 'numone')]);
    expect(serializeProgram(one)).toBe(serializeProgram(two));
  });

  it('replaces a single slot', () => {
    const p = roundTrip({
      kind: 'setArgument',
      label,
      node: ids.count,
      slot: 'times',
      value: { id: nodeId('newnum'), kind: 'wholeNumber', value: 9 },
    });
    expect((nodeOf(p, ids.count) as { times: Expression }).times.id).toBe('newnum');
  });

  it('clears the slots that may be empty', () => {
    roundTrip({ kind: 'setArgument', label, node: ids.score, slot: 'initial', value: null });
    roundTrip({ kind: 'setArgument', label, node: ids.height, slot: 'default', value: null });
  });

  it('reaches inside an expression', () => {
    const say = main(sampleProgram()).body[0] as { target: { id: NodeId } };
    roundTrip({
      kind: 'setArgument',
      label,
      node: say.target.id,
      slot: 'target',
      value: { id: nodeId('newths'), kind: 'this' },
    });
  });

  it('refuses to empty a slot that needs a value', () => {
    expect(
      refusal({ kind: 'setArgument', label, node: ids.count, slot: 'times', value: null }).code,
    ).toBe('would_break');
  });

  it('refuses a statement in an expression slot', () => {
    const value = comment('newone') as unknown as Expression;
    expect(
      refusal({ kind: 'setArgument', label, node: ids.count, slot: 'times', value }).code,
    ).toBe('would_break');
  });

  it('refuses a slot the node has not got', () => {
    expect(
      refusal({
        kind: 'setArgument',
        label,
        node: ids.count,
        slot: 'nosuch',
        value: number('newnum'),
      }).code,
    ).toBe('not_here');
  });

  it("refuses the loop's item, which isn't an expression", () => {
    expect(
      refusal({ kind: 'setArgument', label, node: ids.loop, slot: 'item', value: number('newnum') })
        .code,
    ).toBe('not_here');
  });

  it('wants a parameter for args and none elsewhere', () => {
    expect(
      refusal({ kind: 'setArgument', label, node: ids.say, slot: 'args', value: number('newnum') })
        .code,
    ).toBe('not_here');
    expect(
      refusal({
        kind: 'setArgument',
        label,
        node: ids.count,
        slot: 'times',
        param: 'x',
        value: number('newnum'),
      }).code,
    ).toBe('not_here');
  });

  it('refuses an argument name that would reach the prototype', () => {
    expect(
      refusal({
        kind: 'setArgument',
        label,
        node: ids.say,
        slot: 'details',
        param: '__proto__',
        value: number('newnum'),
      }).code,
    ).toBe('would_break');
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it('refuses a reference out of scope', () => {
    const value: Expression = { id: nodeId('reffff'), kind: 'variableRef', variable: ids.local };
    expect(
      refusal({
        kind: 'setArgument',
        label,
        node: ids.say,
        slot: 'details',
        param: 'duration',
        value,
      }).code,
    ).toBe('not_here');
  });

  it('checks a call to a user method through the parameter id', () => {
    roundTrip({
      kind: 'setArgument',
      label,
      node: ids.callHop,
      slot: 'args',
      param: ids.height,
      value: number('newnum'),
    });
    roundTrip({
      kind: 'setArgument',
      label,
      node: ids.callHop,
      slot: 'args',
      param: ids.height,
      value: null,
    });
    expect(
      refusal({
        kind: 'setArgument',
        label,
        node: ids.callHop,
        slot: 'args',
        param: 'nosuch',
        value: number('newnum'),
      }).code,
    ).toBe('would_break');
  });
});

describe('declare', () => {
  const field = (name: string, id = 'newfld') =>
    ({
      id: nodeId(id),
      kind: 'field',
      name,
      type: { kind: 'story', name: 'Biped' },
      initial: null,
    }) as const;

  it('adds a field to a type', () => {
    const p = roundTrip({
      kind: 'declare',
      label,
      parent: ids.scene,
      index: 1,
      node: field('dog'),
    });
    expect(scene(p).fields.map((f) => f.name)).toEqual(['camera', 'dog', 'cat', 'score']);
  });

  it('adds a method, a listener and a type', () => {
    roundTrip({
      kind: 'declare',
      label,
      parent: ids.scene,
      index: 0,
      node: {
        id: nodeId('newmth'),
        kind: 'method',
        name: 'jump',
        returns: null,
        params: [],
        body: [],
      },
    });
    roundTrip({
      kind: 'declare',
      label,
      parent: ids.scene,
      index: 0,
      node: {
        id: nodeId('newlis'),
        kind: 'listener',
        event: 'timer',
        args: {},
        params: [],
        body: [],
      },
    });
    const p = roundTrip({
      kind: 'declare',
      label,
      parent: null,
      index: 1,
      node: {
        id: nodeId('newtyp'),
        kind: 'type',
        name: 'Cat',
        extends: { kind: 'story', name: 'Quadruped' },
        fields: [],
        methods: [],
        listeners: [],
      },
    });
    expect(p.types.map((t) => t.name)).toEqual(['Scene1', 'Cat']);
  });

  it('adds a parameter with a default to a method in use', () => {
    const p = roundTrip({
      kind: 'declare',
      label,
      parent: ids.hop,
      index: 1,
      node: {
        id: nodeId('newpar'),
        kind: 'parameter',
        name: 'speed',
        type: { kind: 'story', name: 'Number' },
        default: number('newnum'),
      },
    });
    expect((nodeOf(p, ids.hop) as MethodDecl).params).toHaveLength(2);
  });

  it('refuses a parameter with no default on a method in use', () => {
    expect(
      refusal({
        kind: 'declare',
        label,
        parent: ids.hop,
        index: 1,
        node: {
          id: nodeId('newpar'),
          kind: 'parameter',
          name: 'speed',
          type: { kind: 'story', name: 'Number' },
          default: null,
        },
      }).code,
    ).toBe('would_break');
  });

  it('refuses a name already used, by name', () => {
    const refused = refusal({
      kind: 'declare',
      label,
      parent: ids.scene,
      index: 0,
      node: field('cat'),
    });
    expect(refused.code).toBe('name_taken');
    expect(refused.reason).toBe("There's already something called cat here. Try another name.");
  });

  it('refuses the wrong parent', () => {
    expect(
      refusal({ kind: 'declare', label, parent: ids.hop, index: 0, node: field('dog') }).code,
    ).toBe('not_here');
    expect(
      refusal({ kind: 'declare', label, parent: null, index: 0, node: field('dog') }).code,
    ).toBe('not_here');
    expect(
      refusal({ kind: 'declare', label, parent: ids.scene, index: 99, node: field('dog') }).code,
    ).toBe('not_here');
  });

  it('refuses an unknown parent', () => {
    expect(
      refusal({ kind: 'declare', label, parent: nodeId('nosuch'), index: 0, node: field('dog') })
        .code,
    ).toBe('gone');
  });

  it('refuses a statement in place of a declaration', () => {
    const node = comment('newone') as unknown as Declaration;
    expect(refusal({ kind: 'declare', label, parent: ids.scene, index: 0, node }).code).toBe(
      'not_here',
    );
  });
});

describe('rename', () => {
  it('renames each kind of named node, keeping references', () => {
    for (const node of [ids.scene, ids.cat, ids.hop, ids.height, ids.local, ids.item]) {
      const p = roundTrip({ kind: 'rename', label, node, name: 'renamed' });
      expect((nodeOf(p, node) as { name: string }).name).toBe('renamed');
    }
  });

  it('allows the same name', () => {
    roundTrip({ kind: 'rename', label, node: ids.cat, name: 'cat' });
  });

  it('refuses a name already in use', () => {
    const refused = refusal({ kind: 'rename', label, node: ids.score, name: 'cat' });
    expect(refused.code).toBe('name_taken');
    expect(refused.reason).toContain('cat');
  });

  it('refuses a bad name, in plain words', () => {
    const refused = refusal({ kind: 'rename', label, node: ids.cat, name: '2 cats' });
    expect(refused.code).toBe('bad_name');
    expect(refused.reason).toBe('Names start with a letter and use only letters, numbers and _.');
  });

  it('refuses something with no name', () => {
    expect(refusal({ kind: 'rename', label, node: ids.say, name: 'x' }).code).toBe('not_here');
    expect(refusal({ kind: 'rename', label, node: ids.click, name: 'x' }).code).toBe('not_here');
  });
});

describe('setEnabled', () => {
  it('switches a statement off, with undo', () => {
    const p = roundTrip({ kind: 'setEnabled', label, node: ids.say, enabled: false });
    expect((nodeOf(p, ids.say) as Statement).enabled).toBe(false);
  });

  it('switches one on by leaving the field out', () => {
    const p = roundTrip({ kind: 'setEnabled', label, node: ids.turn, enabled: true });
    expect(Object.hasOwn(nodeOf(p, ids.turn)!, 'enabled')).toBe(false);
  });

  it('does nothing to a statement already there', () => {
    const start = sampleProgram();
    roundTrip({ kind: 'setEnabled', label, node: ids.say, enabled: true }, start);
    roundTrip({ kind: 'setEnabled', label, node: ids.turn, enabled: false }, start);
  });

  it('refuses something that is not a statement', () => {
    expect(refusal({ kind: 'setEnabled', label, node: ids.cat, enabled: false }).code).toBe(
      'not_here',
    );
  });
});

describe('setComment', () => {
  it('changes a comment, with undo', () => {
    const p = roundTrip({ kind: 'setComment', label, node: ids.note, text: 'New words' });
    expect((nodeOf(p, ids.note) as { text: string }).text).toBe('New words');
  });

  it('refuses anything else', () => {
    expect(refusal({ kind: 'setComment', label, node: ids.say, text: 'x' }).code).toBe('not_here');
  });
});

describe('applyEdit in general', () => {
  it('gives an inverse with the same label', () => {
    const { inverse } = applyEdit(sampleProgram(), {
      kind: 'remove',
      label: 'Remove say',
      node: ids.say,
    });
    expect(inverse.label).toBe('Remove say');
  });

  it('refuses an unknown kind of edit', () => {
    expect(refusal({ kind: 'dance', label } as unknown as EditOperation).code).toBe('would_break');
  });

  it('refuses a mangled edit from outside, rather than failing', () => {
    expect(refusal({ kind: 'insert', label } as unknown as EditOperation).code).not.toBe(undefined);
    expect(
      refusal({ kind: 'declare', label, parent: ids.scene } as unknown as EditOperation).code,
    ).not.toBe(undefined);
  });

  it('passes a check from outside, with its reason in plain words', () => {
    const check = () => [
      {
        code: 'outside' as const,
        message: 'scene method',
        node: ids.main,
        reason: 'Every scene needs its first method.',
      },
    ];
    try {
      applyEdit(sampleProgram(), { kind: 'remove', label, node: ids.note }, { check });
      expect.unreachable();
    } catch (e) {
      expect((e as EditRefused).reason).toBe('Every scene needs its first method.');
    }
  });
});

describe('applyEdits', () => {
  it('applies in order', () => {
    const p = applyEdits(sampleProgram(), [
      { kind: 'rename', label, node: ids.cat, name: 'tom' },
      { kind: 'rename', label, node: ids.cat, name: 'tim' },
    ]);
    expect(scene(p).fields[1]?.name).toBe('tim');
  });

  it('is all or nothing: a refused edit throws and leaves the start as it was', () => {
    const start = sampleProgram();
    const before = serializeProgram(start);
    expect(() =>
      applyEdits(start, [
        { kind: 'rename', label, node: ids.cat, name: 'tom' },
        { kind: 'remove', label, node: nodeId('nosuch') },
      ]),
    ).toThrow(EditRefused);
    expect(serializeProgram(start)).toBe(before);
  });
});

describe('defaultLabel', () => {
  const program = sampleProgram();
  const call = main(program).body[0]!;
  const cases: [string, EditOperation, string][] = [
    [
      'a say',
      {
        kind: 'insert',
        label,
        parent: ids.main,
        slot: 'body',
        index: 0,
        node: { ...call, id: nodeId('newone') },
      },
      'Make cat say Hello',
    ],
    [
      'a control block',
      {
        kind: 'insert',
        label,
        parent: ids.main,
        slot: 'body',
        index: 0,
        node: { id: nodeId('newone'), kind: 'doTogether', body: [] },
      },
      'Add do together',
    ],
    [
      'a field',
      {
        kind: 'declare',
        label,
        parent: ids.scene,
        index: 0,
        node: {
          id: nodeId('newone'),
          kind: 'field',
          name: 'dog',
          type: { kind: 'story', name: 'Biped' },
          initial: null,
        },
      },
      'Add dog',
    ],
    ['removing a call', { kind: 'remove', label, node: ids.say }, 'Remove cat say'],
    ['removing a method', { kind: 'remove', label, node: ids.hop }, 'Remove hop'],
    [
      'moving a block',
      { kind: 'move', label, node: ids.together, parent: ids.hop, slot: 'body', index: 0 },
      'Move do together',
    ],
    [
      'a new argument',
      {
        kind: 'setArgument',
        label,
        node: ids.move,
        slot: 'args',
        param: 'amount',
        value: number('newnum'),
      },
      'Change amount',
    ],
    [
      'a single slot',
      { kind: 'setArgument', label, node: ids.count, slot: 'times', value: number('newnum') },
      'Change times',
    ],
    ['a rename', { kind: 'rename', label, node: ids.cat, name: 'tom' }, 'Rename cat to tom'],
    [
      'switching off',
      { kind: 'setEnabled', label, node: ids.say, enabled: false },
      'Switch off cat say',
    ],
    [
      'switching on',
      { kind: 'setEnabled', label, node: ids.turn, enabled: true },
      'Switch on cat turn',
    ],
    ['a comment', { kind: 'setComment', label, node: ids.note, text: 'x' }, 'Change comment'],
  ];

  it.each(cases)('names %s', (_, edit, expected) => {
    expect(defaultLabel(program, edit)).toBe(expected);
  });

  it('uses no words the learner should not see', () => {
    for (const [, edit] of cases)
      expect(defaultLabel(program, edit)).not.toMatch(
        /\b(ast|node|field|invocation|edit|token|schema|api)\b/i,
      );
  });

  it('copes with a node that has gone', () => {
    expect(defaultLabel(program, { kind: 'remove', label, node: nodeId('nosuch') })).toBe(
      'Remove it',
    );
  });
});
