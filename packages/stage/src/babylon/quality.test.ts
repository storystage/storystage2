import { SCENE_BUDGET } from '@storystage/backstage';
import { describe, expect, it } from 'vitest';
import { SETUP } from '../testing/conformance.ts';
import { headlessEngine } from './headless.ts';
import { QUALITY, pickRenderer } from './quality.ts';
import { BabylonStage } from './stage.ts';

describe('the renderer', () => {
  it('is WebGPU where the device has it, unless WebGL2 is asked for', () => {
    expect(pickRenderer('auto', true)).toBe('webgpu');
    expect(pickRenderer('auto', false)).toBe('webgl2');
    expect(pickRenderer('webgl2', true)).toBe('webgl2');
    expect(pickRenderer('webgpu', false)).toBe('webgl2');
  });
});

describe('quality', () => {
  it('draws smaller and rougher at low, for the reference devices', () => {
    expect(QUALITY.low.scale).toBeGreaterThan(1);
    expect(QUALITY.low.antialias).toBe(false);
    expect(QUALITY.standard).toEqual({ scale: 1, antialias: true });
  });

  it('is what the stage says it was made with', () => {
    const stage = new BabylonStage(headlessEngine(), { quality: 'low', renderer: 'webgl2' });
    expect(stage.quality).toBe('low');
    expect(stage.renderer).toBe('webgl2');
    expect(new BabylonStage(headlessEngine()).quality).toBe('standard');
  });
});

describe('measuring a scene', () => {
  it('counts the triangles drawn, against the scene budget', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const before = stage.measure();
    expect(before.budget).toBe(SCENE_BUDGET.triangles);
    expect(before.triangles).toBeGreaterThan(0);
    expect(before.fits).toBe(true);
    // A stand-in's body and nose are two boxes of 12 triangles each.
    const more = {
      ...SETUP,
      objects: [...SETUP.objects, { ...SETUP.objects[0]!, id: 'cub' as never }],
    };
    await stage.load(more);
    expect(stage.measure().triangles - before.triangles).toBe(24);
  });

  it('needs a scene to measure', () => {
    expect(() => new BabylonStage(headlessEngine()).measure()).toThrow(/no scene/);
  });
});
