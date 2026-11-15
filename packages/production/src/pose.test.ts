import { describe, expect, it } from 'vitest';
import { readArchive, writeArchive } from './archive.ts';
import { exampleProduction } from './example.ts';
import { openProduction, saveProduction } from './file.ts';
import { POSE_TOLERANCE, isPoseTurn, keptJoints, poseJoints } from './pose.ts';
import type { Production } from './types.ts';

const p = exampleProduction();
const AT_REST = { x: 0, y: 0, z: 0, w: 1 };
/** A quarter turn about the joint's own y, as the Pose panel writes it. */
const QUARTER = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
const NOD = { x: 0.2588190451, y: 0, z: 0, w: 0.9659258263 };

/** The example with scene s1's object `name` (penguin, a Flyer by Backstage id; fox, a stand-in) posed. */
const posed = (joints: unknown, name: 'penguin' | 'fox' = 'penguin'): Production => ({
  ...p,
  scenes: p.scenes.map((s) =>
    s.id === 's1'
      ? {
          ...s,
          setup: {
            ...s.setup,
            objects: s.setup.objects.map((o) =>
              o.id === name ? { ...o, joints: joints as never } : o,
            ),
          },
        }
      : s,
  ),
});

const open = (file: Uint8Array) => {
  const opened = openProduction(file);
  if (opened.status === 'broken') throw new Error(opened.problems.join(' / '));
  return opened;
};
const objectIn = (production: Production, name: string, scene = 's1') =>
  production.scenes.find((s) => s.id === scene)!.setup.objects.find((o) => o.id === name)!;

describe('posing joints (format 1.5.0, spec 03 section 2.2)', () => {
  it('saves a pose as given and reopens it unchanged', () => {
    const pose = { head: NOD, leftWingShoulder: QUARTER, tail: AT_REST };
    const file = saveProduction(posed(pose));
    const opened = open(file);
    expect(opened.status).toBe('ok');
    expect(opened.dropped).toEqual([]);
    expect(opened.production).toEqual(posed(pose));
    expect(objectIn(opened.production, 'penguin').joints).toEqual(pose);
    expect(saveProduction(opened.production, opened.files)).toEqual(file);
  });

  it('drops a joint the class has no such name for, reports it, and keeps the rest', () => {
    const opened = open(saveProduction(posed({ head: NOD, leftUpperArm: QUARTER })));
    expect(opened.status).toBe('ok');
    expect(objectIn(opened.production, 'penguin').joints).toEqual({ head: NOD });
    expect(opened.dropped).toEqual([
      'scenes/s1.json: setup.objects[0].joints.leftUpperArm: dropped: not a joint of a Flyer',
    ]);
  });

  it('drops a turn more than 1e-3 off unit length, and keeps one within it as written', () => {
    const long = { x: 0, y: 0, z: 0, w: 1.002 };
    const near = { x: 0, y: 0, z: 0, w: 1.0005 };
    const opened = open(saveProduction(posed({ head: long, neck: near })));
    const joints = objectIn(opened.production, 'penguin').joints!;
    expect(joints).toEqual({ neck: near });
    // Not normalised: the stage makes it exact when it loads.
    expect(joints['neck' as never]).toEqual({ x: 0, y: 0, z: 0, w: 1.0005 });
    expect(opened.dropped).toEqual([
      'scenes/s1.json: setup.objects[0].joints.head: dropped: should be a unit quaternion { x, y, z, w }',
    ]);
  });

  it("drops a declared stand-in's pose: the stage has no joints to turn", () => {
    const opened = open(saveProduction(posed({ head: NOD }, 'fox')));
    expect(opened.status).toBe('ok');
    expect(objectIn(opened.production, 'fox')).not.toHaveProperty('joints');
    expect(opened.dropped).toEqual([
      'scenes/s1.json: setup.objects[1].joints: dropped: a stand-in has no pose',
    ]);
  });

  it('drops turns that are not four finite numbers x, y, z and w', () => {
    for (const bad of [
      'nod',
      null,
      [0, 0, 0, 1],
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0, w: '1' },
      { x: 0, y: 0, z: 0, w: 1, angle: 90 },
      { x: 0, y: 0, z: 0, w: 0 },
    ]) {
      const opened = open(saveProduction(posed({ head: bad, neck: NOD })));
      expect(objectIn(opened.production, 'penguin').joints).toEqual({ neck: NOD });
      expect(opened.dropped).toHaveLength(1);
    }
    // JSON has no NaN or Infinity: they're written as null, and dropped the same way.
    const opened = open(saveProduction(posed({ head: { ...NOD, w: NaN } })));
    expect(objectIn(opened.production, 'penguin')).not.toHaveProperty('joints');
  });

  it("drops joints that aren't an object, and a pose left empty, so a file never holds joints: {}", () => {
    for (const bad of ['wave', 3, null, [NOD]]) {
      const opened = open(saveProduction(posed(bad)));
      expect(opened.status).toBe('ok');
      expect(objectIn(opened.production, 'penguin')).not.toHaveProperty('joints');
      expect(opened.dropped).toEqual([
        'scenes/s1.json: setup.objects[0].joints: dropped: should be an object',
      ]);
    }
    for (const empty of [{}, { leftUpperArm: NOD }]) {
      const opened = open(saveProduction(posed(empty)));
      expect(objectIn(opened.production, 'penguin')).not.toHaveProperty('joints');
      expect(saveProduction(opened.production, opened.files)).toEqual(saveProduction(p));
    }
  });

  it('treats __proto__ and constructor as names that are not joints', () => {
    // As JSON.parse reads a file: each is the object's own key, not Object's member.
    const joints = JSON.parse(
      `{"__proto__": ${JSON.stringify(NOD)}, "constructor": ${JSON.stringify(NOD)}, "head": ${JSON.stringify(NOD)}}`,
    ) as Record<string, unknown>;
    expect(Object.keys(joints)).toEqual(['__proto__', 'constructor', 'head']);
    const opened = open(saveProduction(posed(joints)));
    const kept = objectIn(opened.production, 'penguin').joints!;
    expect(Object.keys(kept)).toEqual(['head']);
    expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
    expect(opened.dropped).toEqual([
      'scenes/s1.json: setup.objects[0].joints.__proto__: dropped: not a joint of a Flyer',
      'scenes/s1.json: setup.objects[0].joints.constructor: dropped: not a joint of a Flyer',
    ]);
  });

  it('still opens a 1.4.0 file, migrated, with its original to keep', () => {
    const r = readArchive(saveProduction(p), { wanted: () => true });
    if (!r.ok) throw new Error(r.problem.code);
    const manifest = JSON.parse(new TextDecoder().decode(r.entries.get('manifest.json')!));
    const old = writeArchive(
      r.names.map((name) => ({
        name,
        bytes:
          name === 'manifest.json'
            ? new TextEncoder().encode(JSON.stringify({ ...manifest, formatVersion: '1.4.0' }))
            : r.entries.get(name)!,
      })),
    );
    const opened = open(old);
    expect(opened.status).toBe('migrated');
    expect(opened.original).toBe(old);
    expect(opened.production.manifest.formatVersion).toBe('1.5.0');
    expect(saveProduction(opened.production, opened.files)).toEqual(saveProduction(p));
  });
});

describe('the pose rules', () => {
  it("name each class's joints, and none for a class without a skeleton", () => {
    expect(poseJoints('Biped').has('leftUpperArm')).toBe(true);
    expect(poseJoints('Flyer').has('leftWingShoulder')).toBe(true);
    // The extras every class may have (jointsOf), such as a tail or ears.
    expect(poseJoints('Biped').has('tail')).toBe(true);
    expect(poseJoints('Flyer').has('leftUpperArm')).toBe(false);
    expect(poseJoints('Prop').size).toBe(0);
    expect(
      keptJoints({ model: 'example/Prop/box' as never, class: 'Prop', joints: { head: NOD } }, 'x'),
    ).toEqual({
      joints: undefined,
      dropped: ['x.head: dropped: not a joint of a Prop'],
    });
  });

  it('keep a turn within 1e-3 of unit length, and nothing else', () => {
    expect(POSE_TOLERANCE).toBe(1e-3);
    expect(isPoseTurn(AT_REST)).toBe(true);
    expect(isPoseTurn(QUARTER)).toBe(true);
    expect(isPoseTurn({ x: 0, y: 0, z: 0, w: 0.9995 })).toBe(true);
    expect(isPoseTurn({ x: 0, y: 0, z: 0, w: 0.998 })).toBe(false);
    expect(isPoseTurn({ x: 0, y: 0, z: 0, w: Infinity })).toBe(false);
    expect(isPoseTurn(Object.assign(Object.create({ w: 1 }), { x: 0, y: 0, z: 0 }))).toBe(false);
  });
});
