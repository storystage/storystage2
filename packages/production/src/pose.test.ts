import { describe, expect, it } from 'vitest';
import { readArchive, writeArchive } from './archive.ts';
import { exampleProduction } from './example.ts';
import { openProduction, saveProduction } from './file.ts';
import { SKELETONS, jointFromAlice, jointsOf } from '@storystage/backstage';
import {
  JOINT_ID,
  POSE_JOINTS_MAX,
  POSE_TOLERANCE,
  isJointId,
  isPoseTurn,
  keptJoints,
} from './pose.ts';
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

  it("keeps a model's own joints beyond its class's skeleton: the stage judges what it has", () => {
    // An Alice bird's extra joint, named from its Alice name by the joint map.
    const pose = { head: NOD, plumageCenterTip: QUARTER, leftUpperArm: AT_REST };
    const opened = open(saveProduction(posed(pose)));
    expect(opened.status).toBe('ok');
    expect(objectIn(opened.production, 'penguin').joints).toEqual(pose);
    expect(opened.dropped).toEqual([]);
  });

  it('drops a name that is not a well-formed joint id, reports it, and keeps the rest', () => {
    const bad = ['left arm', 'left_arm', '2ndTail', 'Head', '', 'x'.repeat(65)];
    const opened = open(
      saveProduction(posed({ head: NOD, ...Object.fromEntries(bad.map((n) => [n, NOD])) })),
    );
    expect(opened.status).toBe('ok');
    expect(objectIn(opened.production, 'penguin').joints).toEqual({ head: NOD });
    expect(opened.dropped).toHaveLength(bad.length);
    expect(opened.dropped).toContain(
      'scenes/s1.json: setup.objects[0].joints.left arm: dropped: not a joint name',
    );
    // A long name is shortened in the report.
    expect(opened.dropped).toContain(
      `scenes/s1.json: setup.objects[0].joints.${'x'.repeat(64)}…: dropped: not a joint name`,
    );
  });

  it(`keeps at most ${POSE_JOINTS_MAX} joints in a pose, and reports the rest as one`, () => {
    const many = Object.fromEntries(
      Array.from({ length: POSE_JOINTS_MAX + 10 }, (_, i) => [`joint${i}`, AT_REST]),
    );
    const opened = open(saveProduction(posed(many)));
    expect(Object.keys(objectIn(opened.production, 'penguin').joints!)).toHaveLength(
      POSE_JOINTS_MAX,
    );
    expect(opened.dropped).toEqual([
      `scenes/s1.json: setup.objects[0].joints: dropped 10 more: a pose holds at most ${POSE_JOINTS_MAX} joints`,
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
    for (const empty of [{}, { 'not a joint': NOD }]) {
      const opened = open(saveProduction(posed(empty)));
      expect(objectIn(opened.production, 'penguin')).not.toHaveProperty('joints');
      expect(saveProduction(opened.production, opened.files)).toEqual(saveProduction(p));
    }
  });

  it("treats __proto__ and Object's members (constructor, toString…) as names that are not joints", () => {
    // As JSON.parse reads a file: each is the object's own key, not Object's member.
    // In the order a saved file has them: its keys sorted.
    const names = ['__proto__', 'constructor', 'hasOwnProperty', 'toString', 'valueOf'];
    const joints = JSON.parse(
      `{${[...names, 'head'].map((n) => `"${n}": ${JSON.stringify(NOD)}`).join(', ')}}`,
    ) as Record<string, unknown>;
    expect(Object.keys(joints)).toEqual([...names, 'head']);
    const opened = open(saveProduction(posed(joints)));
    const kept = objectIn(opened.production, 'penguin').joints!;
    expect(Object.keys(kept)).toEqual(['head']);
    expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
    expect(opened.dropped).toEqual(
      names.map((n) => `scenes/s1.json: setup.objects[0].joints.${n}: dropped: not a joint name`),
    );
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
    expect(opened.production.manifest.formatVersion).toBe('1.7.0');
    expect(saveProduction(opened.production, opened.files)).toEqual(saveProduction(p));
  });
});

describe('the pose rules', () => {
  it('fit every joint id the joint map gives, for every skeleton and from Alice names', () => {
    for (const skeleton of SKELETONS)
      for (const { id } of jointsOf(skeleton)) {
        expect(id).toMatch(JOINT_ID);
        expect(isJointId(id)).toBe(true);
      }
    for (const alice of ['PLUMAGE_CENTER_TIP', 'HAIR_0', 'HAIR_6', 'FINGER_1_TIP', 'X'])
      expect(isJointId(jointFromAlice('flyer', alice))).toBe(true);
    expect(jointFromAlice('flyer', 'PLUMAGE_CENTER_TIP')).toBe('plumageCenterTip');
  });

  it('keep no pose on a class without joints', () => {
    for (const cls of ['Prop', 'Text', 'Camera'] as const)
      expect(
        keptJoints({ model: 'example/Prop/box' as never, class: cls, joints: { head: NOD } }, 'x'),
      ).toEqual({
        joints: undefined,
        dropped: [`x: dropped: not posable: a ${cls} has no joints`],
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
