import { describe, expect, it } from 'vitest';
import { exampleProduction } from './example.ts';
import {
  checkFrameShape,
  checkManifestShape,
  checkSceneShape,
  checkStoryboardShape,
} from './validate.ts';

const p = exampleProduction();
/** As it comes out of a file: plain JSON, no `undefined` fields. */
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('the shape checks', () => {
  it('pass every part of the example production', () => {
    expect(checkManifestShape(json(p.manifest))).toEqual([]);
    for (const s of p.scenes) expect(checkSceneShape(json(s), `scenes/${s.id}.json`)).toEqual([]);
    expect(checkStoryboardShape(json(p.storyboard))).toEqual([]);
    for (const f of p.frames) expect(checkFrameShape(json(f), `frames/${f.id}.json`)).toEqual([]);
  });

  it('name the file and the path of each problem', () => {
    const frame = { ...json(p.frames[0]!), lengthSeconds: -1 };
    expect(checkFrameShape(frame, 'frames/f1.json')).toEqual([
      'frames/f1.json: lengthSeconds: should be a number from 0',
    ]);
  });

  it("refuse fields this version doesn't know, unless the file is newer", () => {
    const manifest = { ...json(p.manifest), extra: 1 };
    expect(checkManifestShape(manifest)).toEqual([
      'manifest.json: (top): has an unknown field extra',
    ]);
    expect(checkManifestShape(manifest, { allowExtra: true })).toEqual([]);
  });

  it("check a packed model's record by Backstage's own rules", () => {
    const manifest = {
      ...json(p.manifest),
      models: [{ folder: 'class-cat', item: { id: 'class/Quadruped/cat' } }],
    };
    expect(checkManifestShape(manifest).join('\n')).toMatch(/models\[0\]\.item: .*section/);
  });

  it('check numbers are finite and in range', () => {
    const scene = json(p.scenes[0]!);
    const odd = {
      ...scene,
      setup: { ...scene.setup, backdrop: { ...scene.setup.backdrop, fog: 2 } },
    };
    expect(checkSceneShape(odd, 'scenes/s1.json')).toEqual([
      'scenes/s1.json: setup.backdrop.fog: should be a number from 0 to 1',
    ]);
  });
});
