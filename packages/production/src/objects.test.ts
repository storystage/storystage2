import { describe, expect, it } from 'vitest';
import { indexProgram, validateProgram } from '@storystage/ast';
import { IDENTITY, backstageId, objectId, type Transform } from '@storystage/story-api';
import { exampleProduction } from './example.ts';
import {
  OBJECT_LIMIT,
  addObject,
  objectName,
  objectUses,
  removeObject,
  setObject,
  withObject,
} from './objects.ts';
import { ProductionSession } from './session.ts';
import { checkReferences, sceneId, type Production } from './types.ts';

const s1 = sceneId('s1');
const s2 = sceneId('s2');
const owl = backstageId('kenney/Flyer/owl');
const here: Transform = { ...IDENTITY, position: { x: 1, y: 0, z: 2 } };

/** The step's production, or the test fails. */
function done(result: ReturnType<typeof addObject>): Production {
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  return result.step.production;
}

const objectsOf = (p: Production, scene = s1) =>
  p.scenes.find((s) => s.id === scene)!.setup.objects.map((o) => o.id);
const fieldsOf = (p: Production, scene = s1) => {
  const method = p.scenes.find((s) => s.id === scene)!.method;
  return p.program.types.find((t) => t.methods.some((m) => m.id === method))!.fields;
};

describe('objectName (07-ux section 7.2)', () => {
  const p = exampleProduction();

  it("makes a model's display name a field name the code can use", () => {
    expect(objectName(p, s1, 'Owl')).toBe('owl');
    expect(objectName(p, s1, 'Woolly mammoth skeleton')).toBe('woollyMammothSkeleton');
    expect(objectName(p, s1, 'Café table')).toBe('cafeTable');
    expect(objectName(p, s1, "Captain Scott's snow goggles")).toBe('captainScottsSnowGoggles');
    expect(objectName(p, s1, '3D printer')).toBe('thing3dPrinter');
  });

  it("numbers one the scene's type already has, and only that scene's", () => {
    expect(objectName(p, s1, 'Fox')).toBe('fox2');
    const withOwl = done(
      addObject(p, s1, { model: owl, class: 'Flyer', name: 'Owl', transform: here }, 'Add owl'),
    );
    expect(objectName(withOwl, s1, 'Owl')).toBe('owl2');
    // Scene 2 has no owl yet, so the same character there gets the same name, and its voice.
    expect(objectName(withOwl, s2, 'Owl')).toBe('owl');
    expect(objectName(p, sceneId('nowhere'), 'Owl')).toBeNull();
  });
});

describe('addObject', () => {
  it('adds a field of its class and a set-up entry, together', () => {
    const p = done(
      addObject(
        exampleProduction(),
        s1,
        { model: owl, class: 'Flyer', name: 'Owl', transform: here },
        'Add owl',
      ),
    );
    const field = fieldsOf(p).find((f) => f.name === 'owl')!;
    expect(field.type).toEqual({ kind: 'story', name: 'Flyer' });
    expect(field.initial).toBeNull();
    expect(p.scenes[0]!.setup.objects.at(-1)).toEqual({
      id: 'owl',
      model: owl,
      class: 'Flyer',
      transform: here,
    });
    expect(validateProgram(p.program)).toEqual([]);
    expect(checkReferences(p)).toEqual([]);
  });

  it('takes a stand-in as well as a Backstage item', () => {
    const p = done(
      addObject(
        exampleProduction(),
        s1,
        { model: { standIn: 'dragon' }, class: 'Flyer', name: 'Dragon', transform: here },
        'Add dragon',
      ),
    );
    expect(p.scenes[0]!.setup.objects.at(-1)!.model).toEqual({ standIn: 'dragon' });
  });

  it('is one undo step in the session: undo takes out the field and the entry', () => {
    const s = new ProductionSession<'stage'>(exampleProduction());
    const result = addObject(
      s.production(),
      s1,
      { model: owl, class: 'Flyer', name: 'Owl', transform: here },
      'Add owl',
    );
    if (!result.ok) throw new Error('refused');
    s.step(result.step, 'stage');
    expect(objectsOf(s.production())).toContain('owl');
    expect(s.undoLabel()).toBe('Add owl');
    s.undo();
    expect(s.production()).toEqual(exampleProduction());
    s.redo();
    expect(fieldsOf(s.production()).map((f) => f.name)).toContain('owl');
  });

  it("refuses a scene that isn't there, and one that's full", () => {
    const p = exampleProduction();
    expect(
      addObject(
        p,
        sceneId('nowhere'),
        { model: owl, class: 'Flyer', name: 'Owl', transform: here },
        'Add owl',
      ),
    ).toEqual({
      ok: false,
      refusal: { code: 'noSuchScene' },
    });
    let full = p;
    for (let i = full.scenes[0]!.setup.objects.length; i < OBJECT_LIMIT; i++)
      full = done(
        addObject(
          full,
          s1,
          { model: owl, class: 'Flyer', name: 'Owl', transform: here },
          'Add owl',
        ),
      );
    expect(
      addObject(full, s1, { model: owl, class: 'Flyer', name: 'Owl', transform: here }, 'Add owl'),
    ).toEqual({
      ok: false,
      refusal: { code: 'tooManyObjects', limit: OBJECT_LIMIT },
    });
  });
});

describe('removeObject', () => {
  it('is refused while code uses the object, with the blocks that do', () => {
    const p = exampleProduction();
    const uses = objectUses(p, s1, 'penguin');
    expect(uses.length).toBeGreaterThan(0);
    const index = indexProgram(p.program);
    expect(uses.every((id) => index.get(id)?.node.kind === 'fieldRef')).toBe(true);
    expect(removeObject(p, s1, 'penguin', 'Remove penguin')).toEqual({
      ok: false,
      refusal: { code: 'objectInUse', uses },
    });
  });

  it("takes out an unused object's field and entry, and what rode on it rides on the scene", () => {
    const withOwl = done(
      addObject(
        exampleProduction(),
        s1,
        { model: owl, class: 'Flyer', name: 'Owl', transform: here },
        'Add owl',
      ),
    );
    // The fox rides on the owl.
    const onOwl: Production = {
      ...withOwl,
      scenes: withOwl.scenes.map((s) =>
        s.id === s1
          ? {
              ...s,
              setup: {
                ...s.setup,
                objects: s.setup.objects.map((o) =>
                  o.id === 'fox' ? { ...o, vehicle: objectId('owl') } : o,
                ),
              },
            }
          : s,
      ),
    };
    const p = done(removeObject(onOwl, s1, 'owl', 'Remove owl'));
    expect(objectsOf(p)).not.toContain('owl');
    expect(fieldsOf(p).map((f) => f.name)).not.toContain('owl');
    expect(p.scenes[0]!.setup.objects.find((o) => o.id === 'fox')!.vehicle).toBeNull();
    expect(checkReferences(p)).toEqual([]);
  });

  it("refuses an object the scene doesn't have", () => {
    expect(removeObject(exampleProduction(), s1, 'owl', 'Remove owl')).toEqual({
      ok: false,
      refusal: { code: 'noSuchObject' },
    });
  });
});

describe('setObject and withObject', () => {
  it('change how an object starts, and never the program', () => {
    const p = exampleProduction();
    const moved = done(
      setObject(p, s1, 'fox', { transform: here, opacity: 0.5, paint: 'red' }, 'Move fox'),
    );
    const fox = moved.scenes[0]!.setup.objects.find((o) => o.id === 'fox')!;
    expect(fox).toMatchObject({ transform: here, opacity: 0.5, paint: 'red' });
    expect(moved.program).toBe(p.program);
    expect(withObject(p, s1, 'fox', { opacity: 2 })).toMatchObject({ code: 'refused' });
    expect(withObject(p, s1, 'owl', { opacity: 1 })).toEqual({ code: 'noSuchObject' });
  });
});
