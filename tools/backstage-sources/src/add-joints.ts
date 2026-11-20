/**
 * Joints a model lacks, added by its source list (`addJoints`; the owner's choice of 20 Nov 2026,
 * for Styloo's chicken and ladybird). Each is a new node hung on one of the model's own bones at
 * a place in the model's frame as fetched, and added to every skin that bone is in, with no
 * vertex weighted to it, so it moves nothing. It lets a model meet its class's required joints
 * where its maker left one out: the chicken has no wings to beat but walks on its two legs, and
 * the ladybird's wings beat once it has a head. The bones map then names it like any other bone.
 */
import type { Document } from '@gltf-transform/core';

export interface AddedJoint {
  /** Its name, new in the model. */
  readonly name: string;
  /** The model's own bone it hangs on. */
  readonly parent: string;
  /** Where it is, in the model's frame as fetched (before any turn or scaling). */
  readonly at: readonly [number, number, number];
}

/** What's wrong with an `addJoints` list, or null. */
export function addJointsProblem(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return 'addJoints must be a list of joints to add.';
  const names = new Set<string>();
  for (const j of v) {
    if (typeof j !== 'object' || j === null || Array.isArray(j))
      return 'each added joint must be { name, parent, at }.';
    const { name, parent, at, ...rest } = j as Record<string, unknown>;
    if (Object.keys(rest).length) return 'each added joint has only name, parent and at.';
    if (typeof name !== 'string' || !name.trim()) return 'an added joint needs a name.';
    if (names.has(name)) return `addJoints: ${name} is given twice.`;
    names.add(name);
    if (typeof parent !== 'string' || !parent.trim())
      return `addJoints: ${name} needs a parent bone.`;
    if (
      !Array.isArray(at) ||
      at.length !== 3 ||
      !at.every((x) => typeof x === 'number' && Number.isFinite(x))
    )
      return `addJoints: ${name}'s at must be three numbers.`;
  }
  return null;
}

/** Adds each joint; a name already in the model, or a parent not one of its bones, throws. */
export function addJoints(doc: Document, joints: readonly AddedJoint[]): void {
  const root = doc.getRoot();
  for (const { name, parent, at } of joints) {
    const nodes = root.listNodes();
    if (nodes.some((n) => n.getName() === name))
      throw new Error(`addJoints: the model already has a node called "${name}".`);
    const found = nodes.filter((n) => n.getName() === parent);
    if (found.length !== 1)
      throw new Error(
        `addJoints: the model has ${found.length} nodes called "${parent}", not one.`,
      );
    const bone = found[0]!;
    const skins = root.listSkins().filter((s) => s.listJoints().includes(bone));
    if (skins.length === 0)
      throw new Error(`addJoints: "${parent}" is not one of the model's bones.`);
    // Where `at` is in the bone's own frame, so the new node, a child of it, sits there.
    const m = bone.getWorldMatrix();
    const local = solve3(
      [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]],
      [at[0] - m[12], at[1] - m[13], at[2] - m[14]],
    );
    const joint = doc.createNode(name).setTranslation(local as [number, number, number]);
    bone.addChild(joint);
    // Its inverse bind matrix is the inverse of where it is as fetched, which is right while the
    // skinned mesh's bind frame is the scene's. No vertex is weighted to it, so it never shows,
    // and the stage reads joint places from the nodes; weighting vertices to an added joint would
    // need the mesh's own bind frame here (S3's review of #576).
    const inverse = invertAffine(joint.getWorldMatrix());
    for (const skin of skins) {
      const ibm = skin.getInverseBindMatrices();
      if (ibm) {
        const old = ibm.getArray()!;
        const grown = new Float32Array(old.length + 16);
        grown.set(old);
        grown.set(inverse, old.length);
        ibm.setArray(grown);
      }
      skin.addJoint(joint);
    }
  }
}

/** Solves M·x = b for a 3×3 matrix given column by column. */
function solve3(c: readonly number[], b: readonly number[]): number[] {
  const inv = invert3(c);
  return [0, 1, 2].map((r) => inv[r]! * b[0]! + inv[3 + r]! * b[1]! + inv[6 + r]! * b[2]!);
}

/** The inverse of a 3×3 matrix given column by column, column by column. */
function invert3(c: readonly number[]): number[] {
  const [a, d, g, b, e, h, cc, f, i] = c as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + cc * (d * h - e * g);
  if (Math.abs(det) < 1e-12) throw new Error('addJoints: a bone with no size.');
  // Rows of the inverse, then laid out column by column.
  const r = [
    [(e * i - f * h) / det, -(b * i - cc * h) / det, (b * f - cc * e) / det],
    [-(d * i - f * g) / det, (a * i - cc * g) / det, -(a * f - cc * d) / det],
    [(d * h - e * g) / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
  return [
    r[0]![0]!,
    r[1]![0]!,
    r[2]![0]!,
    r[0]![1]!,
    r[1]![1]!,
    r[2]![1]!,
    r[0]![2]!,
    r[1]![2]!,
    r[2]![2]!,
  ];
}

/** The inverse of an affine 4×4 matrix, column by column. */
function invertAffine(m: readonly number[]): number[] {
  const inv = invert3([m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!]);
  const t = [0, 1, 2].map((r) => -(inv[r]! * m[12]! + inv[3 + r]! * m[13]! + inv[6 + r]! * m[14]!));
  return [
    inv[0]!,
    inv[1]!,
    inv[2]!,
    0,
    inv[3]!,
    inv[4]!,
    inv[5]!,
    0,
    inv[6]!,
    inv[7]!,
    inv[8]!,
    0,
    t[0]!,
    t[1]!,
    t[2]!,
    1,
  ];
}
