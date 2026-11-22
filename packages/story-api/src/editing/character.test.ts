import {
  applyEdit,
  applyEdits,
  EditRefused,
  nodeId,
  serializeProgram,
  type EditOperation,
  type MethodDecl,
  type Program,
} from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { checkProgram } from '../catalog/program-check.ts';
import { classFor, classNameFor, classOf, fieldTypeFor } from './character.ts';
import { palette } from './palette.ts';
import { describer } from './words.ts';
import { field, ID, scene } from './testing.ts';

// A character's own moves (decision 0074, workplan 7.14): one class for each model, every object
// of the model of it, checked by the Story API's rules after every step as a session checks it.

const CAT = { name: 'cat', storyClass: 'Biped' } as const;
const check = (p: Program) => checkProgram(p);

function apply(program: Program, edits: readonly EditOperation[]) {
  let current = program;
  const inverses: EditOperation[] = [];
  for (const e of edits) {
    const applied = applyEdit(current, e, { check, checkWholeShape: true });
    current = applied.program;
    inverses.push(applied.inverse);
  }
  return { program: current, inverses };
}

const catType = (p: Program) => p.types[0]!.fields.find((f) => f.id === ID.cat)!.type;

/** A procedure `wave` on the class `type`, one that says Hi. */
const wave = (type: ReturnType<typeof nodeId>): EditOperation => ({
  kind: 'declare',
  parent: type,
  index: 0,
  label: '',
  node: {
    id: nodeId('wavemt'),
    kind: 'method',
    name: 'wave',
    returns: null,
    params: [],
    body: [
      {
        id: nodeId('wavesy'),
        kind: 'call',
        target: { id: nodeId('wavths'), kind: 'this' },
        callee: { kind: 'story', name: 'say' },
        args: { text: { id: nodeId('wavetx'), kind: 'text', value: 'Hi' } },
        details: {},
      },
    ],
  } satisfies MethodDecl,
});

describe('a class found by its objects (S5’s #623)', () => {
  it('keeps the class its objects are of when the model’s name changes', () => {
    // Made while the model was a stand-in called "kitty"; Backstage names it "cat" now.
    const made = classFor(scene([]), { name: 'kitty', storyClass: 'Biped' }, [ID.cat], '');
    const program = apply(scene([]), made!.edits).program;
    const kitty = made!.type;
    expect(classOf(program, CAT)).toBeNull();
    expect(classOf(program, CAT, [ID.cat])?.id).toBe(kitty);
    expect(fieldTypeFor(program, CAT, [ID.cat])).toEqual({ kind: 'user', type: kitty });
    // A move for the cat goes on the kitty class, and no second class is made.
    const again = classFor(program, CAT, [ID.cat], '');
    expect(again).toEqual({ edits: [], type: kitty });
  });

  it('isn’t fooled by an object of another kind’s class', () => {
    const made = classFor(scene([]), CAT, [ID.cat], '');
    const program = apply(scene([]), made!.edits).program;
    // The cat's class extends Biped; a dog that's an Animal isn't of it.
    expect(classOf(program, { name: 'dog', storyClass: 'Animal' }, [ID.cat])).toBeNull();
  });
});

describe('a character’s class (0074)', () => {
  it('is named after its model', () => {
    expect(classNameFor({ name: 'Emperor penguin', storyClass: 'Animal' })).toBe('EmperorPenguin');
    expect(classNameFor({ name: '3D bee', storyClass: 'Flyer' })).toBe('Flyer3DBee');
  });

  it('is made once, extending its Story API class, with the model’s objects of it', () => {
    const program = scene();
    const made = classFor(program, CAT, [ID.cat])!;
    const { program: after, inverses } = apply(program, made.edits);
    const cls = classOf(after, CAT)!;
    expect(cls).toMatchObject({ id: made.type, name: 'Cat', extends: { name: 'Biped' } });
    expect(catType(after)).toEqual({ kind: 'user', type: made.type });
    // What the cat did before, it still does: the Story API's check let every step through.
    expect(checkProgram(after)).toEqual([]);
    // One undo step gives back the same bytes.
    expect(serializeProgram(apply(after, [...inverses].reverse()).program)).toBe(
      serializeProgram(program),
    );
    expect(classFor(after, CAT, [ID.cat])).toEqual({ edits: [], type: made.type });
  });

  it('is labelled for the learner, and takes New’s label for one step', () => {
    expect(classFor(scene(), CAT, [ID.cat])!.edits[0]!.label).toBe('Teach cat its own moves');
    const labelled = classFor(scene(), CAT, [ID.cat], 'Add move wave for cat')!;
    expect(labelled.edits.every((e) => e.label === 'Add move wave for cat')).toBe(true);
  });

  it('gives a new object of the model its class, once there is one', () => {
    expect(fieldTypeFor(scene(), CAT)).toEqual({ kind: 'story', name: 'Biped' });
    const made = classFor(scene(), CAT, [ID.cat])!;
    const after = applyEdits(scene(), made.edits);
    expect(fieldTypeFor(after, CAT)).toEqual({ kind: 'user', type: made.type });
  });

  it('takes a free name if another type has the model’s, and is still found by it', () => {
    const start = applyEdits(scene(), [
      {
        kind: 'declare',
        parent: null,
        index: 2,
        label: '',
        node: {
          id: nodeId('cattyp'),
          kind: 'type',
          name: 'Cat',
          extends: { kind: 'story', name: 'Prop' },
          fields: [],
          methods: [],
          listeners: [],
        },
      },
    ]);
    const made = classFor(start, CAT, [ID.cat])!;
    const after = applyEdits(start, made.edits);
    expect(classOf(after, CAT)!.name).toBe('Cat2');
  });

  it('leaves a field of another type alone, and won’t take what isn’t a field', () => {
    const made = classFor(scene(), CAT, [ID.cat, ID.chair])!;
    expect(made.edits.filter((e) => e.kind === 'retype').map((e) => e.node)).toEqual([ID.cat]);
    expect(classFor(scene(), CAT, [ID.main])).toBeNull();
  });

  it('is refused by the Story API’s check if a use no longer fits', () => {
    // The cat says Hello in the script, which a number can't.
    const toNumber: EditOperation = {
      kind: 'retype',
      node: ID.cat,
      type: { kind: 'story', name: 'Number' },
      label: '',
    };
    expect(() => applyEdit(scene(), toNumber, { check })).toThrow(EditRefused);
  });

  it('offers its moves under “your own” for the character, with its Story API blocks', () => {
    const made = classFor(scene(), CAT, [ID.cat])!;
    const after = applyEdits(scene(), [...made.edits, wave(made.type)]);
    const groups = palette(after, field(ID.cat), ID.scene, 'actions');
    expect(groups.find((g) => g.key === 'yours')!.items.map((i) => i.words)).toEqual(['cat wave']);
    expect(groups.length).toBeGreaterThan(1);
    // A call to it from the scene passes the check.
    const call: EditOperation = {
      kind: 'insert',
      parent: ID.main,
      slot: 'body',
      index: 0,
      label: '',
      node: {
        id: nodeId('callwv'),
        kind: 'call',
        target: field(ID.cat),
        callee: { kind: 'user', method: nodeId('wavemt') },
        args: {},
        details: {},
      },
    };
    expect(() => applyEdit(after, call, { check })).not.toThrow();
  });

  it('calls the character “this cat” inside its own moves', () => {
    const made = classFor(scene(), CAT, [ID.cat])!;
    const after = applyEdits(scene(), [...made.edits, wave(made.type)]);
    const say = after.types.at(-1)!.methods[0]!.body[0]!;
    expect(describer(after).inside(say, made.type)).toBe('this cat say Hi');
  });
});
