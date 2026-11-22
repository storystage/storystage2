import { applyEdit, EditRefused, type EditOperation, type Program } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import {
  addParameter,
  callsOf,
  parameterNameProblem,
  parameterWords,
  removeParameter,
  renameParameter,
  takesParameters,
} from './parameters.ts';
import { field, ID, mint, num, scene } from './testing.ts';

const variable = (id: typeof ID.height) => ({
  id: mint(),
  kind: 'variableRef' as const,
  variable: id,
});

const hopRex = (height = num(2)) => ({
  id: mint(),
  kind: 'call' as const,
  target: field(ID.rex),
  callee: { kind: 'user' as const, method: ID.hop },
  args: { [ID.height]: height },
  details: {},
});

/** Each edit applied in turn, the whole program checked after each, as a session would. */
function apply(program: Program, edits: readonly EditOperation[]) {
  let current = program;
  const inverses: EditOperation[] = [];
  for (const e of edits) {
    const applied = applyEdit(current, e, { checkWholeShape: true });
    current = applied.program;
    inverses.push(applied.inverse);
  }
  return { program: current, inverses };
}

const hop = (p: Program) => p.types[1]!.methods[0]!;

describe('a learner’s method taking inputs (0074, 7.14)', () => {
  it('adds an input, and every call already in the code gets a starting value for it', () => {
    const program = scene([hopRex(), hopRex()]);
    const added = addParameter(program, ID.hop, 'times', { kind: 'story', name: 'WholeNumber' })!;
    const { program: after, inverses } = apply(program, added.edits);
    expect(hop(after).params.map((p) => p.name)).toEqual(['height', 'times']);
    expect(hop(after).params[1]!.default).toBeNull();
    for (const id of callsOf(after, ID.hop)) {
      const call = after.types[0]!.methods[0]!.body.find((s) => s.id === id) as ReturnType<
        typeof hopRex
      >;
      expect(call.args[added.id]).toMatchObject({ kind: 'wholeNumber', value: 1 });
    }
    // One undo step gives the program back.
    expect(apply(after, [...inverses].reverse()).program).toEqual(program);
  });

  it('labels the step with the learner’s word', () => {
    const added = addParameter(scene(), ID.hop, 'times', { kind: 'story', name: 'Number' })!;
    expect(added.edits[0]!.label).toBe('Add input times to hop');
  });

  it('won’t give the scene’s script an input, as nothing calls it with one', () => {
    expect(takesParameters(scene(), ID.main)).toBe(false);
    expect(addParameter(scene(), ID.main, 'x', { kind: 'story', name: 'Number' })).toBeNull();
    expect(takesParameters(scene(), ID.hop)).toBe(true);
  });

  it('checks the name as New does, and against the method’s own names', () => {
    const program = scene();
    expect(parameterNameProblem(program, ID.hop, '')).toBe('empty');
    expect(parameterNameProblem(program, ID.hop, '2fast')).toBe('shape');
    expect(parameterNameProblem(program, ID.hop, 'x'.repeat(61))).toBe('long');
    expect(parameterNameProblem(program, ID.hop, 'height')).toBe('taken');
    expect(parameterNameProblem(program, ID.hop, 'height', ID.height)).toBeNull();
    expect(parameterNameProblem(program, ID.hop, 'tŷ')).toBeNull();
    expect(addParameter(program, ID.hop, 'height', { kind: 'story', name: 'Number' })).toBeNull();
  });

  it('renames an input, and what reads it follows', () => {
    const edits = renameParameter(scene(), ID.height, 'howHigh')!;
    const after = apply(scene(), edits).program;
    expect(hop(after).params[0]!.name).toBe('howHigh');
    expect(edits[0]!.label).toBe('Rename input height to howHigh');
    expect(renameParameter(scene(), ID.height, 'height')).toEqual([]);
    expect(renameParameter(scene(), ID.height, 'no good')).toBeNull();
  });

  it('removes an input and its value from every call', () => {
    const program = scene([hopRex(), hopRex()]);
    const removed = removeParameter(program, ID.height)!;
    if (!('edits' in removed)) throw new Error('refused');
    const { program: after, inverses } = apply(program, removed.edits);
    expect(hop(after).params).toEqual([]);
    expect(
      after.types[0]!.methods[0]!.body.slice(2).map((s) => (s as ReturnType<typeof hopRex>).args),
    ).toEqual([{}, {}]);
    expect(apply(after, [...inverses].reverse()).program).toEqual(program);
  });

  it('won’t remove an input the method still reads, and says which values read it', () => {
    const read = variable(ID.height);
    const base = scene();
    const program: Program = {
      ...base,
      types: [
        base.types[0]!,
        {
          ...base.types[1]!,
          methods: [
            {
              ...hop(base),
              body: [
                {
                  id: mint(),
                  kind: 'call',
                  target: { id: mint(), kind: 'this' },
                  callee: { kind: 'story', name: 'move' },
                  args: {
                    direction: { id: mint(), kind: 'enum', type: 'MoveDirection', value: 'up' },
                    amount: read,
                  },
                  details: {},
                },
              ],
            },
          ],
        },
      ],
    };
    expect(removeParameter(program, ID.height)).toEqual({ usedBy: [read.id] });
  });

  it('removing it through the ast alone is refused, so the check above is the learner’s', () => {
    const program = scene([hopRex()]);
    expect(() => apply(program, [{ kind: 'remove', node: ID.height, label: '' }])).toThrow(
      EditRefused,
    );
  });

  it('shows an input as its name and type', () => {
    expect(parameterWords(scene(), hop(scene()).params[0]!)).toBe('height: number');
  });
});

it('calls an imported sound input a sound', () => {
  expect(
    parameterWords(scene(), {
      id: ID.height,
      kind: 'parameter',
      name: 'noise',
      type: { kind: 'story', name: 'Audio' },
      default: null,
    }),
  ).toBe('noise: sound');
});
