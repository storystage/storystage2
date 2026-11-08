import { describe, expect, it } from 'vitest';
import { backstageId } from '@storystage/story-api';
import { BACKDROP_SKETCHES, MARKS, backdropSketchFor } from './marks.ts';
import { checkSketch } from './readability.ts';
import { renderSketch } from './render.ts';
import { sketchFile, sketchPlan, sketchTitle } from './library.ts';
import { box, boxes, figure, type Part } from './testing.ts';
import { poseMesh } from './pose.ts';

const id = backstageId('kenney/Biped/robot');

describe('sketchPlan', () => {
  it('gives a posable cast member four facings standing and in each pose', () => {
    const plan = sketchPlan({ id, section: 'cast' }, true);
    expect(plan).toHaveLength(16);
    expect(plan[0]).toEqual({
      facing: 'front',
      pose: null,
      file: 'sketches/kenney/Biped/robot/front.svg',
    });
    expect(plan.map((p) => p.file)).toContain('sketches/kenney/Biped/robot/side-walk.svg');
  });

  it('gives props, sets and unposable cast four facings, and backdrops one sketch', () => {
    expect(sketchPlan({ id, section: 'props' }, true)).toHaveLength(4);
    expect(sketchPlan({ id, section: 'cast' }, false)).toHaveLength(4);
    expect(sketchPlan({ id, section: 'backdrops' }, false)).toEqual([
      { facing: 'front', pose: null, file: 'sketches/kenney/Biped/robot/backdrop.svg' },
    ]);
  });

  it('names files and titles plainly', () => {
    expect(sketchFile('a/b', 'threeQuarter', 'sit')).toBe('sketches/a/b/threeQuarter-sit.svg');
    expect(sketchTitle('Robot', 'threeQuarter', 'walk')).toBe('Robot, three-quarter, walking');
    expect(sketchTitle('Robot', 'front', null)).toBe('Robot, front');
  });
});

describe('hand-made sketches', () => {
  it('has the storyboard marks the workplan lists', () => {
    expect(MARKS.map((m) => m.id)).toEqual(
      expect.arrayContaining(['mark/speech', 'mark/move', 'mark/camera', 'mark/text']),
    );
  });

  it.each([...MARKS, ...BACKDROP_SKETCHES])('$id is a titled SVG with its id', (s) => {
    expect(s.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
    expect(s.svg).toContain(`data-sketch-id="${s.id}"`);
    expect(s.svg).toContain(`<title>${s.label}</title>`);
  });

  it('chooses a backdrop sketch from the name and themes', () => {
    expect(backdropSketchFor({ displayName: 'Forest floor', themes: [] }).id).toBe(
      'backdrop/trees',
    );
    expect(backdropSketchFor({ displayName: 'Starry sky', themes: ['night'] }).id).toBe(
      'backdrop/night',
    );
    expect(backdropSketchFor({ displayName: 'Grey', themes: [] }).id).toBe('backdrop/ground');
  });
});

describe('checkSketch', () => {
  it('passes ordinary sketches', () => {
    expect(checkSketch(renderSketch(poseMesh(figure(), 'walk'), 'threeQuarter'))).toEqual([]);
    expect(checkSketch(renderSketch(box([0, 0, 0], [1, 1, 1]), 'threeQuarter'))).toEqual([]);
  });

  it('flags a flat sign seen edge-on as thin', () => {
    const sign = box([-0.5, 0, 0], [0.5, 1, 0.005]);
    expect(checkSketch(renderSketch(sign, 'front'))).toEqual([]);
    expect(checkSketch(renderSketch(sign, 'side')).map((f) => f.issue)).toEqual(['thin']);
  });

  it('flags a sketch with nothing in it as empty', () => {
    const empty = { positions: new Float32Array(0), indices: new Uint32Array(0) };
    expect(checkSketch(renderSketch(empty, 'front')).map((f) => f.issue)).toEqual(['empty']);
  });

  it('flags a tangle of small lines as busy', () => {
    const parts = Array.from({ length: 400 }, (_, i): Part => {
      const [x, y, z] = [(i % 20) * 0.05, Math.floor(i / 20) * 0.05, (i % 7) * 0.01];
      return { min: [x, y, z], max: [x + 0.03, y + 0.03, z + 0.02] };
    });
    const flags = checkSketch(renderSketch(boxes(parts), 'threeQuarter'));
    expect(flags.map((f) => f.issue)).toContain('busy');
  });
});
