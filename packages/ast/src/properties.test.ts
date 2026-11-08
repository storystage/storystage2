/**
 * The WP2 test: any sequence of edits followed by full undo gives back the original program byte
 * for byte, and every valid edit keeps the program valid. A run is a list of random numbers, read
 * against the program as it stands, so a sequence can reach anything edits can make, and fast-check
 * can shrink a failure to a short list.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { idMinter, newProgram } from './build.ts';
import { copyNode } from './copy.ts';
import { applyEdit, EditRefused, type EditOperation, type StatementSlot } from './edits.ts';
import type { NodeId } from './ids.ts';
import type { AstNode, Declaration, Expression, Program, Statement, TypeRef } from './nodes.ts';
import { isStatement, EXPRESSION_KINDS } from './nodes.ts';
import { serializeProgram } from './serialize.ts';
import { sampleProgram } from './testing.ts';
import { validateProgram } from './validate.ts';
import { indexProgram, shapeOf, walkProgram } from './walk.ts';

vi.setConfig({ testTimeout: 300_000 });

const NUMBER: TypeRef = { kind: 'story', name: 'Number' };
const NAMES = ['cat', 'dog', 'x', 'item', 'hop', 'score', 'tŷ', 'màthair'];

type Picker = (n: number) => number;

/** Reads a run's numbers one at a time, each as a choice among `n` things. */
function picker(numbers: readonly number[]): Picker {
  let i = 0;
  return (n) => (n <= 0 ? 0 : numbers[i++ % numbers.length]! % n);
}

const one = <T>(pick: Picker, list: readonly T[]): T => list[pick(list.length)]!;

function nodesOf(program: Program) {
  const all: AstNode[] = [];
  walkProgram(program, (n) => all.push(n));
  return all;
}

function expression(
  pick: Picker,
  mint: () => NodeId,
  nodes: readonly AstNode[],
  depth = 0,
): Expression {
  const id = mint();
  const inner = () => expression(pick, mint, nodes, depth + 1);
  switch (depth > 2 ? pick(4) : pick(10)) {
    case 0:
      return { id, kind: 'number', value: pick(100) / 4 };
    case 1:
      return { id, kind: 'text', value: one(pick, NAMES) };
    case 2:
      return { id, kind: 'boolean', value: pick(2) === 0 };
    case 3:
      return { id, kind: 'this' };
    case 4: {
      const fields = nodes.filter((n) => n.kind === 'field');
      return fields.length === 0
        ? { id, kind: 'none' }
        : {
            id,
            kind: 'fieldRef',
            target: { id: mint(), kind: 'this' },
            field: one(pick, fields).id,
          };
    }
    case 5: {
      const variables = nodes.filter((n) => ['local', 'parameter', 'loopItem'].includes(n.kind));
      return variables.length === 0
        ? { id, kind: 'none' }
        : { id, kind: 'variableRef', variable: one(pick, variables).id };
    }
    case 6:
      return { id, kind: 'arithmetic', op: 'add', left: inner(), right: inner() };
    case 7:
      return { id, kind: 'not', value: inner() };
    case 8:
      return { id, kind: 'arrayOf', of: NUMBER, items: [inner(), inner()] };
    default:
      return {
        id,
        kind: 'functionCall',
        target: inner(),
        callee: { kind: 'story', name: 'getWidth' },
        args: {},
        details: pick(2) === 0 ? {} : { asSeenBy: inner() },
      };
  }
}

function statement(
  pick: Picker,
  mint: () => NodeId,
  nodes: readonly AstNode[],
  depth = 0,
): Statement {
  const id = mint();
  const value = () => expression(pick, mint, nodes);
  const body = () =>
    depth > 2 ? [] : Array.from({ length: pick(3) }, () => statement(pick, mint, nodes, depth + 1));
  const item = () =>
    ({ id: mint(), kind: 'loopItem', name: one(pick, NAMES), type: NUMBER }) as const;
  switch (pick(12)) {
    case 0:
      return { id, kind: 'doInOrder', body: body() };
    case 1:
      return { id, kind: 'doTogether', body: body() };
    case 2:
      return { id, kind: 'count', times: value(), body: body() };
    case 3:
      return { id, kind: 'while', condition: value(), body: body() };
    case 4:
      return { id, kind: 'forEach', item: item(), items: value(), body: body() };
    case 5:
      return { id, kind: 'eachTogether', item: item(), items: value(), body: body() };
    case 6:
      return { id, kind: 'if', condition: value(), then: body(), else: body() };
    case 7:
      return { id, kind: 'local', name: one(pick, NAMES), type: NUMBER, value: value() };
    case 8:
      return { id, kind: 'assign', target: value(), value: value() };
    case 9:
      return { id, kind: 'comment', text: one(pick, NAMES) };
    case 10:
      return { id, kind: 'return', value: pick(2) === 0 ? null : value() };
    default:
      return {
        id,
        kind: 'call',
        target: value(),
        callee: { kind: 'story', name: 'say' },
        args: { text: value() },
        details: pick(3) === 0 ? { duration: value() } : {},
      };
  }
}

function declaration(pick: Picker, mint: () => NodeId, nodes: readonly AstNode[]): Declaration {
  const id = mint();
  const name = one(pick, NAMES);
  const value = () => expression(pick, mint, nodes);
  switch (pick(5)) {
    case 0:
      return { id, kind: 'field', name, type: NUMBER, initial: pick(2) === 0 ? null : value() };
    case 1:
      return {
        id,
        kind: 'method',
        name,
        returns: pick(2) === 0 ? null : NUMBER,
        params: [],
        body: [],
      };
    case 2:
      return { id, kind: 'parameter', name, type: NUMBER, default: value() };
    case 3:
      return {
        id,
        kind: 'listener',
        event: 'timer',
        args: { seconds: value() },
        details: {},
        params: [],
        body: [],
      };
    default:
      return {
        id,
        kind: 'type',
        name,
        extends: { kind: 'story', name: 'Biped' },
        fields: [],
        methods: [],
        listeners: [],
      };
  }
}

/** A list slot that holds statements, somewhere in the program. */
function statementList(pick: Picker, nodes: readonly AstNode[]) {
  const holders = nodes.filter((n) =>
    shapeOf(n.kind).lists?.some(
      (s) =>
        s !== 'params' && s !== 'items' && s !== 'fields' && s !== 'methods' && s !== 'listeners',
    ),
  );
  if (holders.length === 0) return null;
  const parent = one(pick, holders);
  const slots = (shapeOf(parent.kind).lists ?? []).filter((s) =>
    ['body', 'then', 'else'].includes(s),
  );
  const slot = one(pick, slots) as StatementSlot;
  const length = (parent as unknown as Record<string, readonly unknown[]>)[slot]!.length;
  return { parent: parent.id, slot, length };
}

/** A copy of a statement, as paste makes it. Refers to whatever the original refers to. */
function pasted(pick: Picker, mint: () => NodeId, nodes: readonly AstNode[]): Statement | null {
  const statements = nodes.filter(isStatement);
  return statements.length === 0 ? null : copyNode(one(pick, statements), mint);
}

/** One edit, chosen by the numbers. Many are refused, which the property allows for. */
function editFrom(program: Program, numbers: readonly number[]): EditOperation {
  const pick = picker(numbers);
  const mint = idMinter(program);
  const nodes = nodesOf(program);
  const label = 'Change';
  // A run can remove every type. All that's left to do then is to declare one.
  if (nodes.length === 0) {
    const node: Declaration = { ...newProgram().types[0]!, id: mint() };
    return { kind: 'declare', label, parent: null, index: 0, node };
  }
  const anyNode = one(pick, nodes);
  const list = statementList(pick, nodes);
  const place = list && { parent: list.parent, slot: list.slot, index: pick(list.length + 1) };
  const expressions = nodes.filter((n) => (EXPRESSION_KINDS as readonly string[]).includes(n.kind));
  const statements = nodes.filter(isStatement);
  switch (pick(10)) {
    case 0:
      if (place) return { kind: 'insert', label, ...place, node: statement(pick, mint, nodes) };
      break;
    case 1: {
      const copy = pasted(pick, mint, nodes);
      if (place && copy) return { kind: 'insert', label, ...place, node: copy };
      break;
    }
    case 2:
      return { kind: 'remove', label, node: anyNode.id };
    case 3:
      if (place && statements.length > 0)
        return { kind: 'move', label, ...place, node: one(pick, statements).id };
      break;
    case 4: {
      const shape = shapeOf(anyNode.kind);
      const singles = (shape.singles ?? []).filter((s) => s !== 'item');
      if (singles.length > 0)
        return {
          kind: 'setArgument',
          label,
          node: anyNode.id,
          slot: one(pick, singles),
          value: pick(5) === 0 ? null : expression(pick, mint, nodes),
        };
      if (shape.maps)
        return {
          kind: 'setArgument',
          label,
          node: anyNode.id,
          slot: one(pick, shape.maps),
          param: one(pick, ['text', 'duration', 'asSeenBy']),
          value: pick(3) === 0 ? null : expression(pick, mint, nodes),
        };
      break;
    }
    case 5: {
      const node = declaration(pick, mint, nodes);
      const parents = nodes.filter((n) =>
        node.kind === 'parameter' ? n.kind === 'method' : n.kind === 'type',
      );
      const parent =
        node.kind === 'type' ? null : parents.length > 0 ? one(pick, parents).id : null;
      return { kind: 'declare', label, parent, index: pick(2), node };
    }
    case 6:
      return { kind: 'rename', label, node: anyNode.id, name: one(pick, NAMES) };
    case 7:
      return { kind: 'setEnabled', label, node: anyNode.id, enabled: pick(2) === 0 };
    case 8:
      return { kind: 'setComment', label, node: anyNode.id, text: one(pick, NAMES) };
    default:
      if (expressions.length > 0) return { kind: 'remove', label, node: one(pick, expressions).id };
  }
  return { kind: 'remove', label, node: anyNode.id };
}

interface Run {
  readonly start: Program;
  readonly end: Program;
  readonly applied: readonly EditOperation[];
  readonly inverses: readonly EditOperation[];
  readonly refused: number;
}

/** Applies a run's edits, checking the program after each. */
function run(start: Program, steps: readonly (readonly number[])[]): Run {
  let program = start;
  const applied: EditOperation[] = [];
  const inverses: EditOperation[] = [];
  let refused = 0;
  for (const numbers of steps) {
    const edit = editFrom(program, numbers);
    const before = serializeProgram(program);
    try {
      const result = applyEdit(program, edit);
      program = result.program;
      applied.push(edit);
      inverses.push(result.inverse);
      expect(validateProgram(program)).toEqual([]);
    } catch (e) {
      if (!(e instanceof EditRefused)) throw e;
      refused++;
      expect(serializeProgram(program)).toBe(before);
    }
  }
  return { start, end: program, applied, inverses, refused };
}

function undoAll(r: Run): Program {
  return [...r.inverses].reverse().reduce((p, inverse) => applyEdit(p, inverse).program, r.end);
}

const steps = fc.array(fc.array(fc.nat({ max: 1_000_000 }), { minLength: 12, maxLength: 12 }), {
  maxLength: 40,
});
const starts = fc.constantFrom<() => Program>(sampleProgram, () => newProgram());

describe('any sequence of edits', () => {
  it('keeps the program valid, and refusing leaves it as it was', () => {
    fc.assert(
      fc.property(starts, steps, (start, s) => void run(start(), s)),
      { numRuns: 150 },
    );
  });

  it('comes back byte for byte after full undo', () => {
    fc.assert(
      fc.property(starts, steps, (start, s) => {
        const r = run(start(), s);
        expect(serializeProgram(undoAll(r))).toBe(serializeProgram(r.start));
      }),
      { numRuns: 150 },
    );
  });

  it('lands in the same place after undo and redo', () => {
    fc.assert(
      fc.property(starts, steps, (start, s) => {
        const r = run(start(), s);
        const redone = r.applied.reduce((p, edit) => applyEdit(p, edit).program, undoAll(r));
        expect(serializeProgram(redone)).toBe(serializeProgram(r.end));
      }),
      { numRuns: 100 },
    );
  });

  it('comes back after undoing any number of edits and no more', () => {
    fc.assert(
      fc.property(starts, steps, fc.nat(), (start, s, n) => {
        const r = run(start(), s);
        const keep = r.applied.length === 0 ? 0 : n % r.applied.length;
        let middle = r.start;
        r.applied.slice(0, keep).forEach((edit) => (middle = applyEdit(middle, edit).program));
        const partly = [...r.inverses.slice(keep)]
          .reverse()
          .reduce((p, inverse) => applyEdit(p, inverse).program, r.end);
        expect(serializeProgram(partly)).toBe(serializeProgram(middle));
      }),
      { numRuns: 60 },
    );
  });

  it('keeps ids stable: every node that stays keeps its id', () => {
    fc.assert(
      fc.property(steps, (s) => {
        const r = run(sampleProgram(), s);
        const after = indexProgram(undoAll(r));
        for (const id of indexProgram(r.start).keys()) expect(after.has(id)).toBe(true);
      }),
      { numRuns: 40 },
    );
  });

  it('really does get things done: most runs change the program', () => {
    let accepted = 0;
    let refused = 0;
    fc.assert(
      fc.property(steps, (s) => {
        const r = run(sampleProgram(), s);
        accepted += r.applied.length;
        refused += r.refused;
      }),
      { numRuns: 60, seed: 1 },
    );
    const kinds = new Set<string>();
    fc.assert(
      fc.property(steps, (s) => {
        for (const edit of run(sampleProgram(), s).applied) kinds.add(edit.kind);
      }),
      { numRuns: 60, seed: 2 },
    );
    expect(accepted / (accepted + refused)).toBeGreaterThan(0.2);
    expect([...kinds].sort()).toEqual([
      'declare',
      'insert',
      'move',
      'remove',
      'rename',
      'setArgument',
      'setComment',
      'setEnabled',
    ]);
  });
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

describe('checking only what an edit adds (spec section 4.2)', () => {
  it('agrees with checking the whole program: same edits made, same refusals', () => {
    let refused = 0;
    let made = 0;
    fc.assert(
      fc.property(starts, steps, (start, s) => {
        let program = start();
        for (const numbers of s) {
          const edit = editFrom(program, numbers);
          const fast = outcome(program, edit, false);
          expect(fast).toEqual(outcome(program, edit, true));
          if ('bytes' in fast) {
            made++;
            program = applyEdit(program, edit).program;
          } else refused++;
        }
      }),
      { numRuns: 150 },
    );
    expect(made).toBeGreaterThan(100);
    expect(refused).toBeGreaterThan(100);
  });
});
