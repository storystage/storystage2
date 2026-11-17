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

  it('gives a scene’s frames in order, its backdrop parts and its camera', () => {
    const p = exampleProduction();
    const scene = p.scenes[0]!.id;
    expect(sceneFrames(p, scene).map((f) => f.order)).toEqual(
      [...sceneFrames(p, scene).map((f) => f.order)].sort((a, b) => a - b),
    );
    expect(backdropPartOf('Sky')).toBe('sky');
    expect(backdropPartOf('Biped')).toBeNull();
    const sky = withBackdrop(p, scene, 'sky', 'storystage/Sky/night');
    expect(sky.scenes[0]!.setup.backdrop.sky).toBe('storystage/Sky/night');
    expect(sky.scenes[1]).toBe(p.scenes[1]);
    const transform = { ...p.scenes[0]!.setup.camera.transform, position: { x: 1, y: 2, z: 3 } };
    expect(withCamera(p, scene, transform).scenes[0]!.setup.camera.transform).toEqual(transform);
  });
});
