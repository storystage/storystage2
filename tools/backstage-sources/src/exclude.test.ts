import { describe, expect, it } from 'vitest';
import { WebIO } from '@gltf-transform/core';
import { documentFromMesh, figure, box } from '@storystage/sketches/testing';
import { applyExcludes, globToRegExp } from './exclude.ts';

/** The figure, holding a "1H_Sword", with an "Idle" clip and a "1H_Melee_Attack_Chop" clip. */
async function armedFigure(): Promise<Uint8Array> {
  const doc = documentFromMesh(figure());
  const buffer = doc.getRoot().listBuffers()[0]!;
  const sword = documentFromMesh(box([0.8, 1.3, -0.02], [0.84, 2.1, 0.02]));
  const swordPrim = sword.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc
        .createAccessor()
        .setType('VEC3')
        .setArray(
          swordPrim.getAttribute('POSITION')!.getArray()!.slice() as Float32Array<ArrayBuffer>,
        )
        .setBuffer(buffer),
    )
    .setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(swordPrim.getIndices()!.getArray()!.slice() as Uint32Array<ArrayBuffer>)
        .setBuffer(buffer),
    );
  const hand = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === 'rightHand')!;
  hand.addChild(doc.createNode('1H_Sword').setMesh(doc.createMesh('1H_Sword').addPrimitive(prim)));
  for (const name of ['Idle', '1H_Melee_Attack_Chop']) {
    const sampler = doc
      .createAnimationSampler()
      .setInput(
        doc
          .createAccessor()
          .setType('SCALAR')
          .setArray(new Float32Array([0, 1]))
          .setBuffer(buffer),
      )
      .setOutput(
        doc
          .createAccessor()
          .setType('VEC3')
          .setArray(new Float32Array([0, 0, 0, 0, 0.1, 0]))
          .setBuffer(buffer),
      );
    const channel = doc
      .createAnimationChannel()
      .setTargetNode(hand)
      .setTargetPath('translation')
      .setSampler(sampler);
    doc.createAnimation(name).addSampler(sampler).addChannel(channel);
  }
  return new WebIO().writeBinary(doc);
}

describe('globToRegExp', () => {
  it('matches whole names, with * for any run of characters', () => {
    expect(globToRegExp('*Sword*').test('1H_Sword_Offhand')).toBe(true);
    expect(globToRegExp('Hit_*').test('Hit_A')).toBe(true);
    expect(globToRegExp('Hit_*').test('Big_Hit_A')).toBe(false);
    expect(globToRegExp('T-Pose').test('T-Pose')).toBe(true);
    expect(globToRegExp('a.b').test('axb')).toBe(false);
  });
});

describe('applyExcludes', () => {
  it('removes matching nodes and clips, and what only they used', async () => {
    const before = await armedFigure();
    const result = await applyExcludes(before, { nodes: ['*Sword*'], animations: ['*Melee*'] });
    expect(result.removed).toEqual({ nodes: ['1H_Sword'], animations: ['1H_Melee_Attack_Chop'] });
    const doc = await new WebIO().readBinary(result.bytes);
    expect(
      doc
        .getRoot()
        .listNodes()
        .map((n) => n.getName()),
    ).not.toContain('1H_Sword');
    expect(doc.getRoot().listMeshes()).toHaveLength(1);
    expect(
      doc
        .getRoot()
        .listAnimations()
        .map((a) => a.getName()),
    ).toEqual(['Idle']);
    expect(result.bytes.length).toBeLessThan(before.length);
  });

  it('leaves a model alone when nothing matches', async () => {
    const before = await armedFigure();
    const result = await applyExcludes(before, { nodes: ['Nothing'] });
    expect(result.removed).toEqual({ nodes: [], animations: [] });
    expect(result.bytes).toBe(before);
  });
});
