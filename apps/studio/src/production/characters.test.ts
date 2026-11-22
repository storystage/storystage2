import { applyAll, serializeProgram } from '@storystage/ast';
import { exampleProduction, type Production } from '@storystage/production';
import { backstageId } from '@storystage/story-api';
import { checkProgram } from '@storystage/story-api/program-check';
import { describe, expect, it } from 'vitest';
import {
  characterOf,
  characterOfClass,
  classMethods,
  classWords,
  modelFields,
  sceneType,
} from './characters.ts';
import { newCharacterMethod, newMethodWithInputs } from './newMethodEdits.ts';

// A character's own moves (decision 0074, workplan 7.14): the example's three scenes each have a
// penguin (a Backstage model) and a fox (a stand-in).

const PENGUIN = backstageId('example/Flyer/penguin');
const named = (id: string) => (id === PENGUIN ? 'Emperor penguin' : null);
const p = exampleProduction();
const [s1, s2, s3] = p.scenes.map((s) => s.id) as [
  (typeof p.scenes)[0]['id'],
  (typeof p.scenes)[0]['id'],
  (typeof p.scenes)[0]['id'],
];
const fieldNamed = (q: Production, scene: typeof s1, name: string) =>
  sceneType(q, scene)!.fields.find((f) => f.name === name)!;

/** `p` with the edits made, as the studio's session makes them. */
const after = (edits: Parameters<typeof applyAll>[1]): Production => ({
  ...p,
  program: applyAll(p.program, edits).program,
});

describe('a character in the Code editor (0074)', () => {
  it('finds every object of a model, in every scene, and a stand-in’s by its label', () => {
    expect(modelFields(p, PENGUIN)).toEqual(
      [s1, s2, s3].map((s) => fieldNamed(p, s, 'penguin').id),
    );
    const penguin = characterOf(p, s1, fieldNamed(p, s1, 'penguin').id, named)!;
    expect(penguin.model).toEqual({ name: 'Emperor penguin', storyClass: 'Flyer' });
    expect(penguin.type).toBeNull();
    // The fox is a stand-in: a model by its label, as an Alice world's characters come in.
    expect(characterOf(p, s1, fieldNamed(p, s1, 'fox').id, named)).toEqual({
      model: { name: 'fox', storyClass: 'Quadruped' },
      fields: [s1, s2, s3].map((s) => fieldNamed(p, s, 'fox').id),
      type: null,
    });
    // A model this device hasn't got is named from its id.
    expect(characterOf(p, s1, fieldNamed(p, s1, 'penguin').id, () => null)!.model.name).toBe(
      'penguin',
    );
  });

  it('names a packed model this device hasn’t checked as the film does', () => {
    const item = { id: PENGUIN, class: 'Flyer', displayName: 'Waddles' };
    const packed = {
      ...p,
      manifest: { ...p.manifest, models: [{ folder: 'waddles', item }] },
    } as unknown as Production;
    const id = fieldNamed(p, s1, 'penguin').id;
    expect(characterOf(packed, s1, id, () => null)!.model.name).toBe('Waddles');
    // Backstage's own name still comes first.
    expect(characterOf(packed, s1, id, named)!.model.name).toBe('Emperor penguin');
  });

  it('makes the class, the move and its inputs as one undo step, for every scene', () => {
    const penguin = characterOf(p, s1, fieldNamed(p, s1, 'penguin').id, named)!;
    const label = 'Add move waddle for Emperor penguin with steps';
    const made = newCharacterMethod(
      p.program,
      penguin.model,
      penguin.fields,
      'waddle',
      null,
      [{ name: 'steps', type: 'WholeNumber' }],
      label,
    )!;
    expect(made.edits.every((e) => e.label === label)).toBe(true);
    const q = after(made.edits);
    expect(checkProgram(q.program)).toEqual([]);
    const cls = q.program.types.find((t) => t.id === made.type)!;
    expect(cls).toMatchObject({ name: 'EmperorPenguin', extends: { name: 'Flyer' } });
    expect(cls.methods.map((m) => [m.name, m.params.map((x) => x.name)])).toEqual([
      ['waddle', ['steps']],
    ]);
    // Every scene's penguin is of it, and has its move as a tab, named for whose it is.
    for (const s of [s1, s2, s3]) {
      expect(fieldNamed(q, s, 'penguin').type).toEqual({ kind: 'user', type: made.type });
      expect(classMethods(q, s).map((c) => c.method.id)).toEqual([made.id]);
    }
    expect(classWords(cls)).toBe('emperor penguin');
    // Undone, the program is as it was.
    const undone = applyAll(q.program, [...applyAll(p.program, made.edits).inverses].reverse());
    expect(serializeProgram(undone.program)).toBe(serializeProgram(p.program));

    // A second move joins the same class; inside it, the character is found from its objects.
    const again = characterOfClass(q, cls, named);
    expect(again).toMatchObject({ type: made.type, model: { name: 'Emperor penguin' } });
    const hop = newCharacterMethod(q.program, again.model, again.fields, 'hop', 'Number', [], '')!;
    expect(hop.type).toBe(made.type);
    expect(hop.edits.map((e) => e.kind)).toEqual(['declare']);
  });

  it('finds the class its objects are of after the model’s name changes (S6, #624)', () => {
    const penguin = characterOf(p, s1, fieldNamed(p, s1, 'penguin').id, () => null)!;
    const made = newCharacterMethod(
      p.program,
      penguin.model,
      penguin.fields,
      'waddle',
      null,
      [],
      '',
    )!;
    const q = after(made.edits);
    // Made as "penguin", from its id; this device now has the model, as "Emperor penguin".
    const now = characterOf(q, s2, fieldNamed(q, s2, 'penguin').id, named)!;
    expect(now.type).toBe(made.type);
    const hop = newCharacterMethod(q.program, now.model, now.fields, 'hop', null, [], '')!;
    expect(hop.type).toBe(made.type);
    expect(hop.edits.map((e) => e.kind)).toEqual(['declare']);
  });

  it('names a class with no objects left after itself', () => {
    const penguin = characterOf(p, s1, fieldNamed(p, s1, 'penguin').id, named)!;
    const made = newCharacterMethod(p.program, penguin.model, [], 'waddle', null, [], '')!;
    const q = after(made.edits);
    const cls = q.program.types.find((t) => t.id === made.type)!;
    expect(characterOfClass(q, cls, named)).toEqual({
      model: { name: 'emperor penguin', storyClass: 'Flyer' },
      fields: [],
      type: made.type,
    });
    // The scene's own methods aren't a character's.
    const own = newMethodWithInputs(p.program, sceneType(p, s1)!.id, 'w', null, [], '')!;
    expect(classMethods(after(own.edits), s1)).toEqual([]);
  });
});
