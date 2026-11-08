import { applyAll, indexProgram, nodeId, type TypeDecl } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { exampleProduction } from './example.ts';
import { SCENE_LIMIT, addScene, deleteScene, moveScene, type SceneStepResult } from './scenes.ts';
import { checkReferences, frameId, sceneId, type Production } from './types.ts';

/** The same "random" numbers every run, so new node ids are the same every run. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function ok(result: SceneStepResult) {
  if (!result.ok) throw new Error(`Expected a step, got ${result.refusal.code}`);
  return result.step;
}

function refused(result: SceneStepResult) {
  if (result.ok) throw new Error('Expected a refusal');
  return result.refusal;
}

const typeOf = (p: Production, scene: string): TypeDecl => {
  const method = p.scenes.find((s) => s.id === scene)!.method;
  const index = indexProgram(p.program);
  return index.get(index.get(method)!.parent!)!.node as TypeDecl;
};

describe('addScene', () => {
  it('adds a card, a set-up, a type with its script method, and a place in the running order', () => {
    const before = exampleProduction();
    const step = ok(addScene(before, { heading: 'River, dawn', label: 'Add scene 4' }, seeded()));
    const p = step.production;
    expect(step.label).toBe('Add scene 4');
    expect(p.storyboard.cards.at(-1)).toEqual({
      id: 's4',
      heading: 'River, dawn',
      cast: [],
      arcPart: null,
    });
    expect(p.manifest.runningOrder.at(-1)).toEqual({
      scene: 's4',
      transition: { kind: 'cut', duration: 0 },
    });
    const type = typeOf(p, 's4');
    expect(type.name).toBe('Scene4');
    expect(type.extends).toEqual({ kind: 'story', name: 'Scene' });
    expect(type.methods.map((m) => m.name)).toEqual(['myFirstMethod']);
    expect(p.scenes.at(-1)!.setup.objects).toEqual([]);
    expect(checkReferences(p)).toEqual([]);
  });

  it('can put the new scene anywhere in the running order', () => {
    const step = ok(addScene(exampleProduction(), { heading: 'Prologue', at: 0, label: 'x' }));
    expect(step.production.manifest.runningOrder.map((r) => r.scene)).toEqual([
      's4',
      's1',
      's2',
      's3',
    ]);
  });

  it('records the program edits and the edits that undo them', () => {
    const before = exampleProduction();
    const step = ok(addScene(before, { heading: 'River', label: 'Add scene 4' }));
    expect(step.edits).toHaveLength(1);
    expect(step.edits[0]).toMatchObject({ kind: 'declare', parent: null, label: 'Add scene 4' });
    expect(applyAll(step.production.program, step.inverses).program).toEqual(before.program);
  });

  it('takes the first scene id and type name that are free', () => {
    const p = ok(deleteScene(exampleProduction(), sceneId('s2'), 'Delete scene 2')).production;
    const step = ok(addScene(p, { heading: 'Again', label: 'x' }));
    expect(step.production.scenes.at(-1)!.id).toBe('s2');
    expect(typeOf(step.production, 's2').name).toBe('Scene2');
  });

  it('waits for a logline and a synopsis (WP10.1)', () => {
    const p = exampleProduction();
    for (const storyboard of [
      { ...p.storyboard, logline: '  ' },
      { ...p.storyboard, synopsis: '' },
    ])
      expect(refused(addScene({ ...p, storyboard }, { heading: 'x', label: 'x' }))).toEqual({
        code: 'needsLoglineAndSynopsis',
      });
  });

  it(`stops at ${SCENE_LIMIT} scenes`, () => {
    let p = exampleProduction();
    while (p.scenes.length < SCENE_LIMIT)
      p = ok(addScene(p, { heading: 'More', label: 'x' })).production;
    expect(refused(addScene(p, { heading: 'One too many', label: 'x' }))).toEqual({
      code: 'tooManyScenes',
      limit: SCENE_LIMIT,
    });
    expect(checkReferences(p)).toEqual([]);
  });
});

describe('deleteScene', () => {
  it('takes away its card, set-up, type, frames and lines, and its place in the running order', () => {
    const before = exampleProduction();
    const step = ok(deleteScene(before, sceneId('s2'), 'Delete scene 2'));
    const p = step.production;
    expect(step.label).toBe('Delete scene 2');
    expect(p.scenes.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(p.storyboard.cards.map((c) => c.id)).toEqual(['s1', 's3']);
    expect(p.manifest.runningOrder.map((r) => r.scene)).toEqual(['s1', 's3']);
    expect(p.frames.some((f) => f.scene === 's2')).toBe(false);
    expect(p.script.some((l) => l.scene === 's2')).toBe(false);
    expect(p.program.types.map((t) => t.name)).not.toContain('Scene2');
    expect(checkReferences(p)).toEqual([]);
  });

  it('unpins lines in other scenes that were pinned to its frames', () => {
    const before = exampleProduction();
    const script = before.script.map((l) =>
      l.id === 'l1' ? { ...l, pinnedFrame: frameId('f2') } : l,
    );
    const p = ok(deleteScene({ ...before, script }, sceneId('s2'), 'x')).production;
    expect(p.script.find((l) => l.id === 'l1')!.pinnedFrame).toBeNull();
    expect(checkReferences(p)).toEqual([]);
  });

  it('keeps the learner’s recordings for the scene, no longer tied to it', () => {
    const before = exampleProduction();
    const manifest = {
      ...before.manifest,
      audio: [{ file: 'fox.webm', scene: sceneId('s2'), label: 'Fox' }],
    };
    const p = ok(deleteScene({ ...before, manifest }, sceneId('s2'), 'x')).production;
    expect(p.manifest.audio).toEqual([{ file: 'fox.webm', scene: null, label: 'Fox' }]);
  });

  it('records edits whose inverses bring the type back', () => {
    const before = exampleProduction();
    const step = ok(deleteScene(before, sceneId('s3'), 'Delete scene 3'));
    expect(step.edits).toEqual([{ kind: 'remove', label: 'Delete scene 3', node: 'scene3t' }]);
    expect(applyAll(step.production.program, step.inverses).program).toEqual(before.program);
  });

  it('refuses, in plain words, while other code still uses the scene', () => {
    const before = exampleProduction();
    const types = before.program.types.map((t) =>
      t.name === 'Scene1'
        ? {
            ...t,
            fields: [
              ...t.fields,
              {
                id: nodeId('scene1z'),
                kind: 'field' as const,
                name: 'next',
                type: { kind: 'user' as const, type: nodeId('scene2t') },
                initial: null,
              },
            ],
          }
        : t,
    );
    const refusal = refused(
      deleteScene({ ...before, program: { ...before.program, types } }, sceneId('s2'), 'x'),
    );
    expect(refusal.code).toBe('refused');
    expect(refusal).toHaveProperty('reason', expect.stringContaining('still used'));
  });

  it('refuses a scene that isn’t there', () => {
    expect(refused(deleteScene(exampleProduction(), sceneId('nope'), 'x'))).toEqual({
      code: 'noSuchScene',
    });
  });
});

describe('moveScene', () => {
  it('moves a scene in the running order, keeping its transition', () => {
    const before = exampleProduction();
    const step = ok(moveScene(before, sceneId('s3'), 0, 'Move scene 3'));
    expect(step.production.manifest.runningOrder).toEqual([
      before.manifest.runningOrder[2],
      before.manifest.runningOrder[0],
      before.manifest.runningOrder[1],
    ]);
    expect(step.edits).toEqual([]);
    expect(step.production.program).toBe(before.program);
    expect(checkReferences(step.production)).toEqual([]);
  });

  it('counts the place after the scene has left its old one', () => {
    const step = ok(moveScene(exampleProduction(), sceneId('s1'), 2, 'x'));
    expect(step.production.manifest.runningOrder.map((r) => r.scene)).toEqual(['s2', 's3', 's1']);
  });

  it('refuses a place outside the running order, and a scene that isn’t there', () => {
    expect(refused(moveScene(exampleProduction(), sceneId('s1'), 3, 'x'))).toEqual({
      code: 'noSuchPlace',
    });
    expect(refused(moveScene(exampleProduction(), sceneId('nope'), 0, 'x'))).toEqual({
      code: 'noSuchScene',
    });
  });
});
