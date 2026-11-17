import { exampleProduction } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import * as staging from './index.ts';
import { backdropPartOf, sceneFrames, withBackdrop, withCamera } from './scene.ts';

// What setting the stage needs of a scene, and that the whole package loads where S7's
// evaluation harness runs the Prompter: plain Node, with no DOM, canvas or WebGL.

describe('@storystage/staging', () => {
  it('loads in plain Node, with no DOM', () => {
    expect(typeof globalThis.document).toBe('undefined');
    expect(typeof staging.placeFromStoryboard).toBe('function');
    expect(typeof staging.storyboardPlan).toBe('function');
  });

  it('gives a scene’s own frames, in order, and none of another scene’s', () => {
    const p = exampleProduction();
    const [first, second] = p.scenes;
    // The fixture's frames, shuffled, with a second frame in the first scene out of order.
    const extra = { ...p.frames.find((f) => f.scene === first!.id)!, id: 'f9', order: -1 };
    const shuffled = { ...p, frames: [...p.frames, extra].reverse() } as typeof p;
    const expected = shuffled.frames
      .filter((f) => f.scene === first!.id)
      .sort((a, b) => a.order - b.order)
      .map((f) => f.id);
    expect(expected.length).toBeGreaterThan(1);
    expect(sceneFrames(shuffled, first!.id).map((f) => f.id)).toEqual(expected);
    expect(sceneFrames(shuffled, first!.id).every((f) => f.scene === first!.id)).toBe(true);
    expect(sceneFrames(shuffled, second!.id).map((f) => f.id)).not.toContain('f9');
  });

  it('sets a scene’s backdrop parts and its camera, and no other scene’s', () => {
    const p = exampleProduction();
    const scene = p.scenes[0]!.id;
    expect(backdropPartOf('Sky')).toBe('sky');
    expect(backdropPartOf('Biped')).toBeNull();
    const sky = withBackdrop(p, scene, 'sky', 'storystage/Sky/night');
    expect(sky.scenes[0]!.setup.backdrop.sky).toBe('storystage/Sky/night');
    expect(sky.scenes[1]).toBe(p.scenes[1]);
    const transform = { ...p.scenes[0]!.setup.camera.transform, position: { x: 1, y: 2, z: 3 } };
    expect(withCamera(p, scene, transform).scenes[0]!.setup.camera.transform).toEqual(transform);
  });
});
