import { describe, expect, it } from 'vitest';
import { exampleProduction } from './example.ts';
import { ZIP_LAYOUT, checkReferences, frameId, sceneId, type Production } from './types.ts';

describe('the example production', () => {
  it('has sound references', () => {
    expect(checkReferences(exampleProduction())).toEqual([]);
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
});

describe('ZIP_LAYOUT', () => {
  it('matches workplan 8.1', () => {
    expect(ZIP_LAYOUT.scene(sceneId('s1'))).toBe('scenes/s1.json');
    expect(ZIP_LAYOUT.frame(frameId('f1'))).toBe('frames/f1.json');
    expect(ZIP_LAYOUT.script).toBe('script.fountain');
  });
});
