import { describe, expect, it } from 'vitest';
import { Document } from '@gltf-transform/core';
import { clipsProblem, standardClips } from './clips.ts';

/** A model with a two-bone skin under a turned armature, and animations on its root. */
function model(turned = false) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const armature = doc.createNode('Armature');
  // Blender's exports often stand the armature up with a quarter turn about x.
  if (turned) armature.setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
  const hips = doc.createNode('Hips');
  const leg = doc.createNode('Leg');
  armature.addChild(hips);
  hips.addChild(leg);
  doc.createScene().addChild(armature);
  const skin = doc.createSkin().addJoint(hips).addJoint(leg);
  const mesh = doc.createNode('Body').setSkin(skin);
  armature.addChild(mesh);
  const track = (
    anim: string,
    node: typeof hips,
    path: 'translation' | 'rotation',
    times: number[],
    values: number[],
  ) => {
    const a =
      doc
        .getRoot()
        .listAnimations()
        .find((x) => x.getName() === anim) ?? doc.createAnimation(anim);
    const s = doc
      .createAnimationSampler()
      .setInput(
        doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buffer),
      )
      .setOutput(
        doc
          .createAccessor()
          .setType(path === 'translation' ? 'VEC3' : 'VEC4')
          .setArray(new Float32Array(values))
          .setBuffer(buffer),
      )
      .setInterpolation('LINEAR');
    a.addSampler(s).addChannel(
      doc.createAnimationChannel().setSampler(s).setTargetNode(node).setTargetPath(path),
    );
  };
  return { doc, hips, leg, track };
}

const keys = (doc: Document, clip: string) => {
  const a = doc
    .getRoot()
    .listAnimations()
    .find((x) => x.getName() === clip)!;
  return a.listChannels().map((c) => ({
    node: c.getTargetNode()!.getName(),
    path: c.getTargetPath(),
    times: Array.from(c.getSampler()!.getInput()!.getArray()!),
    values: Array.from(c.getSampler()!.getOutput()!.getArray()!).map(
      (v) => Math.round(v * 1000) / 1000,
    ),
  }));
};

describe('clipsProblem', () => {
  it('takes the six standard names, each an animation or a stretch of one', () => {
    expect(
      clipsProblem({ walk: 'Walk', idle: { clip: 'Take 001', start: 0, end: 1.25 } }),
    ).toBeNull();
    expect(clipsProblem({ dance: 'Dance' })).toMatch(/not one of idle, walk, run, jump, fly, swim/);
    expect(clipsProblem({ walk: '' })).toMatch(/names no animation/);
    expect(clipsProblem({ walk: { clip: 'Take 001', start: 2, end: 1 } })).toMatch(
      /end after start/,
    );
    expect(clipsProblem({})).toMatch(/at least one/);
    expect(clipsProblem(['walk'])).toMatch(/must map/);
  });
});

describe('standardClips', () => {
  it("renames the chosen clips, drops the rest, and takes the walk's forward drift out but keeps its bob", () => {
    const { doc, hips, leg, track } = model();
    // A walk that moves 2 m forward in z, bobbing 0.1 m, while its leg swings.
    track('Armature|Walk', hips, 'translation', [0, 0.5, 1], [0, 1, 0, 0, 1.1, 1, 0, 1, 2]);
    track('Armature|Walk', leg, 'rotation', [0, 1], [0, 0, 0, 1, 0, 0, 0.1, 0.995]);
    track('Armature|Die', hips, 'translation', [0, 1], [0, 1, 0, 0, 0, 0]);
    standardClips(doc, { walk: 'Armature|Walk' });
    expect(
      doc
        .getRoot()
        .listAnimations()
        .map((a) => a.getName()),
    ).toEqual(['walk']);
    const [root, swing] = keys(doc, 'walk');
    expect(root!.values).toEqual([0, 1, 0, 0, 1.1, 0, 0, 1, 0]);
    expect(swing!.values).toEqual([0, 0, 0, 1, 0, 0, 0.1, 0.995]);
  });

  it('takes drift out along the ground when the armature is turned', () => {
    const { doc, hips, track } = model(true);
    // Under the quarter turn, the hips' local y is the world's -z: 2 m forward along local y.
    track('Run', hips, 'translation', [0, 1], [0, 0, 0.5, 0, 2, 0.5]);
    standardClips(doc, { run: 'Run' });
    expect(keys(doc, 'run')[0]!.values).toEqual([0, 0, 0.5, 0, 0, 0.5]);
  });

  it('cuts a stretch out of one long track and starts it at 0', () => {
    const { doc, leg, track } = model();
    const q = (x: number) => [x, 0, 0, Math.sqrt(1 - x * x)];
    // idle 0 to 1 s, walk 1 to 2 s, baked onto one track.
    track(
      'clip',
      leg,
      'rotation',
      [0, 0.5, 1, 1.5, 2],
      [...q(0), ...q(0.1), ...q(0), ...q(0.3), ...q(0)],
    );
    standardClips(doc, {
      idle: { clip: 'clip', start: 0, end: 1 },
      walk: { clip: 'clip', start: 1, end: 2 },
    });
    expect(
      doc
        .getRoot()
        .listAnimations()
        .map((a) => a.getName()),
    ).toEqual(['idle', 'walk']);
    const walk = keys(doc, 'walk')[0]!;
    expect(walk.times).toEqual([0, 0.5, 1]);
    expect(walk.values.filter((_, i) => i % 4 === 0)).toEqual([0, 0.3, 0]);
  });

  it("refuses an animation it can't find once, and a stretch with no keys", () => {
    const { doc, hips, track } = model();
    track('Walk', hips, 'translation', [0, 1], [0, 0, 0, 0, 0, 0]);
    expect(() => standardClips(doc, { run: 'Run' })).toThrow(/0 animations called "Run"/);
    expect(() => standardClips(doc, { walk: { clip: 'Walk', start: 5, end: 6 } })).toThrow(
      /no keys/,
    );
  });
});
