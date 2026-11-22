import { describe, expect, it } from 'vitest';
import { Document } from '@gltf-transform/core';
import { addJoints, addJointsProblem } from './add-joints.ts';

/** A body bone, turned and scaled under a root, in one skin, with an inverse bind matrix. */
function skinned() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const root = doc.createNode('root').setTranslation([1, 0, 0]).setScale([2, 2, 2]);
  const body = doc
    .createNode('body')
    .setTranslation([0, 0.5, 0])
    .setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]); // a quarter turn about y
  root.addChild(body);
  doc.createScene().addChild(root);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const skin = doc
    .createSkin()
    .addJoint(body)
    .setInverseBindMatrices(
      doc.createAccessor().setType('MAT4').setArray(new Float32Array(identity)).setBuffer(buffer),
    );
  return { doc, body, skin };
}

describe('addJoints (owner, 20 Nov 2026: the chicken and ladybird)', () => {
  it('hangs a new joint on a bone, at a place in the model, in the bone’s skins', () => {
    const { doc, body, skin } = skinned();
    addJoints(doc, [{ name: 'head', parent: 'body', at: [1.4, 1.6, -0.2] }]);
    const head = doc
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === 'head')!;
    expect(head.getParentNode()).toBe(body);
    expect(head.getWorldTranslation().map((x) => Math.round(x * 1e6) / 1e6 + 0)).toEqual([
      1.4, 1.6, -0.2,
    ]);
    expect(skin.listJoints()).toEqual([body, head]);
    // Its inverse bind matrix undoes where it is: its own place goes to the origin.
    const ibm = skin.getInverseBindMatrices()!.getArray()!;
    expect(ibm.length).toBe(32);
    const m = Array.from(ibm.slice(16));
    const w = head.getWorldMatrix();
    const at = [0, 1, 2].map(
      (r) => m[r]! * w[12]! + m[4 + r]! * w[13]! + m[8 + r]! * w[14]! + m[12 + r]!,
    );
    expect(at.map((x) => Math.round(x * 1e6) / 1e6 + 0)).toEqual([0, 0, 0]);
  });

  it('refuses a name already there, and a parent that isn’t one bone of a skin', () => {
    const { doc } = skinned();
    expect(() => addJoints(doc, [{ name: 'body', parent: 'body', at: [0, 0, 0] }])).toThrow(
      /already has a node called "body"/,
    );
    expect(() => addJoints(doc, [{ name: 'x', parent: 'tail', at: [0, 0, 0] }])).toThrow(
      /0 nodes called "tail"/,
    );
    expect(() => addJoints(doc, [{ name: 'x', parent: 'root', at: [0, 0, 0] }])).toThrow(
      /not one of the model's bones/,
    );
  });

  it('checks a source list’s addJoints', () => {
    expect(addJointsProblem([{ name: 'head', parent: 'Bone', at: [0, 0.07, 0] }])).toBeNull();
    for (const [v, why] of [
      [[], /a list of joints/],
      [[{ name: 'a', parent: 'b', at: [0, 0] }], /three numbers/],
      [[{ name: '', parent: 'b', at: [0, 0, 0] }], /needs a name/],
      [[{ name: 'a', parent: 'b', at: [0, 0, 0], turn: 1 }], /only name, parent and at/],
      [
        [
          { name: 'a', parent: 'b', at: [0, 0, 0] },
          { name: 'a', parent: 'b', at: [1, 0, 0] },
        ],
        /given twice/,
      ],
    ] as const)
      expect(addJointsProblem(v)).toMatch(why);
  });
});
