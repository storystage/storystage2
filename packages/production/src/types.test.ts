import {
  EditSession,
  nodeId,
  validateProgram,
  type FieldDecl,
  type Program,
  type TypeDecl,
} from '@storystage/ast';
import type { BackstageItem } from '@storystage/backstage';
import { backstageId, objectId } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { exampleProduction } from './example.ts';
import {
  SAFE_ID,
  ZIP_LAYOUT,
  checkReferences,
  frameId,
  sceneId,
  sceneMethodCheck,
  type PackedModel,
  type Production,
} from './types.ts';

/** The production with one change to its first scene's type. */
function withFirstType(p: Production, change: (t: TypeDecl) => TypeDecl): Production {
  const [first, ...rest] = p.program.types;
  const program: Program = { ...p.program, types: [change(first!), ...rest] };
  return { ...p, program };
}

describe('the example production', () => {
  it('has sound references', () => {
    expect(checkReferences(exampleProduction())).toEqual([]);
  });

  it('has a valid program, with code in every scene', () => {
    const p = exampleProduction();
    expect(validateProgram(p.program)).toEqual([]);
    expect(p.program.types).toHaveLength(3);
    for (const t of p.program.types) expect(t.methods[0]!.body.length).toBeGreaterThan(0);
  });

  it('links each frame to a block that exists', () => {
    const p = exampleProduction();
    const statements = new Set(p.program.types.flatMap((t) => t.methods[0]!.body.map((s) => s.id)));
    for (const f of p.frames) for (const l of f.links) expect(statements.has(l)).toBe(true);
  });

  it('is marked as made in StoryStage', () => {
    expect(exampleProduction().manifest.origin).toBe('storystage');
  });

  it('survives JSON unchanged, as it will inside the .storystage zip', () => {
    const p = exampleProduction();
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it('has a logline and synopsis, and at least one frame per scene', () => {
    const p = exampleProduction();
    expect(p.storyboard.logline).not.toBe('');
    expect(p.storyboard.synopsis).not.toBe('');
    for (const s of p.scenes) expect(p.frames.some((f) => f.scene === s.id)).toBe(true);
  });
});

describe('checkReferences', () => {
  const broken = (change: (p: Production) => Production) =>
    checkReferences(change(exampleProduction()));

  it('finds a running order entry for a missing scene', () => {
    const problems = broken((p) => ({
      ...p,
      manifest: {
        ...p.manifest,
        runningOrder: [
          ...p.manifest.runningOrder,
          { scene: sceneId('s9'), transition: { kind: 'cut', duration: 0 } },
        ],
      },
    }));
    expect(problems).toEqual(["The running order lists scene s9, which doesn't exist."]);
  });

  it('finds frames and pins that point nowhere, and duplicate ids', () => {
    const problems = broken((p) => ({
      ...p,
      frames: [...p.frames, { ...p.frames[0]!, scene: sceneId('s9') }],
      script: p.script.map((l, i) => (i === 0 ? { ...l, pinnedFrame: frameId('f9') } : l)),
    }));
    expect(problems).toHaveLength(3);
  });

  it('refuses audio file names that reach outside audio/', () => {
    const problems = broken((p) => ({
      ...p,
      manifest: { ...p.manifest, audio: [{ file: '../../etc/passwd', scene: null, label: 'x' }] },
    }));
    expect(problems).toHaveLength(1);
  });

  it('wants every scene in the running order exactly once', () => {
    const missing = broken((p) => ({
      ...p,
      manifest: { ...p.manifest, runningOrder: p.manifest.runningOrder.slice(1) },
    }));
    expect(missing).toEqual(['Scene s1 is not in the running order.']);

    const twice = broken((p) => ({
      ...p,
      manifest: {
        ...p.manifest,
        runningOrder: [...p.manifest.runningOrder, p.manifest.runningOrder[0]!],
      },
    }));
    expect(twice).toEqual(['Scene s1 is in the running order twice.']);
  });

  it('refuses ids that are not safe as file names', () => {
    for (const id of ['../evil', 'a/b', 'a\\b', '.hidden', 'A', '', 'x'.repeat(33)])
      expect(SAFE_ID.test(id), id).toBe(false);
    for (const id of ['s1', 'f1', 'scene-2', 'x'.repeat(32)])
      expect(SAFE_ID.test(id), id).toBe(true);

    const scenes = broken((p) => ({
      ...p,
      scenes: [{ ...p.scenes[0]!, id: sceneId('../evil') }, ...p.scenes.slice(1)],
    }));
    expect(scenes).toContain('Scene id ../evil is not safe as a file name.');

    const frames = broken((p) => ({
      ...p,
      frames: [{ ...p.frames[0]!, id: frameId('../evil') }, ...p.frames.slice(1)],
    }));
    expect(frames).toContain('Frame id ../evil is not safe as a file name.');
  });

  it('wants each scene method to exist, in a type extending Scene', () => {
    const gone = broken((p) => ({
      ...p,
      scenes: [{ ...p.scenes[0]!, method: nodeId('nosuch') }, ...p.scenes.slice(1)],
    }));
    expect(gone).toContain("Scene s1's method nosuch doesn't exist.");

    const notAScene = broken((p) =>
      withFirstType(p, (t) => ({ ...t, extends: { kind: 'story', name: 'Prop' } })),
    );
    expect(notAScene).toContain("Scene s1's method isn't in a type extending Scene.");
  });

  it('refuses two scenes sharing a type', () => {
    const problems = broken((p) => ({
      ...p,
      scenes: [p.scenes[0]!, { ...p.scenes[1]!, method: p.scenes[0]!.method }, p.scenes[2]!],
    }));
    expect(problems).toContain('Scenes s1 and s2 share a type.');
  });

  it('wants each set-up object to have a field, and each scene field an object', () => {
    const noField = broken((p) =>
      withFirstType(p, (t) => ({ ...t, fields: t.fields.filter((f) => f.name !== 'fox') })),
    );
    expect(noField).toContain('Scene s1 sets up fox, which has no field.');

    const noObject = broken((p) => ({
      ...p,
      scenes: [
        {
          ...p.scenes[0]!,
          setup: {
            ...p.scenes[0]!.setup,
            objects: p.scenes[0]!.setup.objects.filter((o) => o.id !== objectId('fox')),
          },
        },
        ...p.scenes.slice(1),
      ],
    }));
    expect(noObject).toContain('Scene s1 has a field fox, but no object in its set-up.');
  });

  it('wants the camera field only, not a camera object, and ignores fields with a value', () => {
    const score: FieldDecl = {
      id: nodeId('scorex'),
      kind: 'field',
      name: 'score',
      type: { kind: 'story', name: 'WholeNumber' },
      initial: { id: nodeId('scorev'), kind: 'wholeNumber', value: 0 },
    };
    const problems = broken((p) =>
      withFirstType(p, (t) => ({ ...t, fields: [...t.fields, score] })),
    );
    expect(problems).toEqual([]);
  });

  it('wants a field of a Story API class to match the object', () => {
    const problems = broken((p) =>
      withFirstType(p, (t) => ({
        ...t,
        fields: t.fields.map((f) =>
          f.name === 'fox' ? { ...f, type: { kind: 'story', name: 'Biped' } } : f,
        ),
      })),
    );
    expect(problems).toContain('Scene s1: fox is a Quadruped in the set-up and a Biped in code.');
  });

  it('refuses two frames in one place in a scene', () => {
    const problems = broken((p) => ({
      ...p,
      frames: [...p.frames, { ...p.frames[0]!, id: frameId('f9') }],
    }));
    expect(problems).toEqual(['Frames f1 and f9 are both at place 0 in scene s1.']);
  });

  it('leaves links alone: a removed block may come back on undo', () => {
    const problems = broken((p) => ({
      ...p,
      frames: [{ ...p.frames[0]!, links: [nodeId('nosuch')] }, ...p.frames.slice(1)],
    }));
    expect(problems).toEqual([]);
  });

  describe('packed models', () => {
    const item: BackstageItem = {
      id: backstageId('class/Quadruped/robot-dog'),
      section: 'cast',
      class: 'Quadruped',
      displayName: 'Robot dog',
      themes: [],
      files: { model: 'model.glb', thumbnail: 'thumbnail.png' },
      joints: 'prop-only',
      defaultSize: { height: 1 },
      licence: 'CC-BY-4.0',
      credit: 'Robot dog by A. Maker (CC BY 4.0)',
      source: { url: 'https://example.org/robot-dog' },
      origin: 'imported',
      sketches: [{ facing: 'front', file: 'sketches/front.svg' }],
    };
    const withModels = (models: readonly PackedModel[]) =>
      broken((p) => ({ ...p, manifest: { ...p.manifest, models } }));

    it('accepts an imported model with its files in its folder', () => {
      expect(withModels([{ folder: 'robot-dog', item }])).toEqual([]);
    });

    it('puts its files under models/', () => {
      expect(ZIP_LAYOUT.model('robot-dog', item.files.model)).toBe('models/robot-dog/model.glb');
    });

    it('refuses a shipped model: every copy of StoryStage has those', () => {
      const shipped = { ...item, origin: 'shipped' } as const;
      expect(withModels([{ folder: 'robot-dog', item: shipped }])).toEqual([
        `Model ${item.id} is shipped with StoryStage, so it shouldn't be in the file.`,
      ]);
    });

    it('refuses a folder that is not safe as a file name', () => {
      expect(withModels([{ folder: '../evil', item }])).toEqual([
        'Model folder ../evil is not safe as a file name.',
      ]);
    });

    it('refuses the same folder or model twice', () => {
      const other = { ...item, id: backstageId('class/Prop/box') };
      expect(
        withModels([
          { folder: 'one', item },
          { folder: 'one', item: other },
        ]),
      ).toEqual(['Two models use the folder one.']);
      expect(
        withModels([
          { folder: 'one', item },
          { folder: 'two', item },
        ]),
      ).toEqual([`Model ${item.id} is in the file twice.`]);
    });

    it.each(['../model.glb', 'a/../../b.glb', '/etc/passwd', 'a\\b.glb', '.hidden', 'a//b', ''])(
      'refuses a model file called %j',
      (model) => {
        const bad = { ...item, files: { ...item.files, model } };
        expect(withModels([{ folder: 'one', item: bad }])).toEqual([
          `Model ${item.id} names a file outside its folder: ${model}.`,
        ]);
      },
    );

    it('checks sketches and thumbnails too', () => {
      const thumbnail = { ...item, files: { ...item.files, thumbnail: '../t.png' } };
      const sketch = { ...item, sketches: [{ facing: 'front', file: '../s.svg' }] } as const;
      expect(withModels([{ folder: 'one', item: thumbnail }])).toHaveLength(1);
      expect(withModels([{ folder: 'one', item: sketch }])).toHaveLength(1);
    });
  });
});

describe('sceneMethodCheck', () => {
  const session = () => {
    const p = exampleProduction();
    return { p, s: new EditSession(p.program, { check: sceneMethodCheck(p.scenes) }) };
  };

  it("refuses removing a scene's script method, in plain words", () => {
    const { p, s } = session();
    const declared = p.program.types[0]!.methods[0]!;
    const body = declared.body.map((b) => ({ kind: 'remove', label: 'x', node: b.id }) as const);
    expect(s.apply(body, 'Clear', 'blocks').ok).toBe(true);
    expect(
      s.apply([{ kind: 'remove', label: 'x', node: declared.id }], 'Remove', 'blocks'),
    ).toEqual({
      ok: false,
      reason: 'Every scene needs its first method, so this one has to stay.',
    });
  });

  it('allows everything else', () => {
    const { p, s } = session();
    const extra = nodeId('hopmth');
    const declare = {
      kind: 'declare',
      label: 'Add hop',
      parent: p.program.types[0]!.id,
      index: 1,
      node: { id: extra, kind: 'method', name: 'hop', returns: null, params: [], body: [] },
    } as const;
    expect(s.apply([declare], 'Add', 'blocks').ok).toBe(true);
    expect(s.apply([{ kind: 'remove', label: 'x', node: extra }], 'Remove', 'blocks').ok).toBe(
      true,
    );
  });
});

describe('ZIP_LAYOUT', () => {
  it('matches workplan 8.1', () => {
    expect(ZIP_LAYOUT.scene(sceneId('s1'))).toBe('scenes/s1.json');
    expect(ZIP_LAYOUT.frame(frameId('f1'))).toBe('frames/f1.json');
    expect(ZIP_LAYOUT.script).toBe('script.fountain');
  });
});
