import { describe, expect, it } from 'vitest';
import { FACINGS } from '@storystage/backstage';
import { dot } from './math.ts';
import { renderSketch, viewOf } from './render.ts';
import { box, boxes, figure } from './testing.ts';
import { poseMesh } from './pose.ts';

const cube = box([-0.5, 0, -0.5], [0.5, 1, 0.5]);
const paths = (svg: string, cls: string) =>
  [...svg.matchAll(new RegExp(`<path class="${cls}" d="([^"]*)"`, 'g'))].map((m) => m[1]!);
const loops = (d: string) => (d.match(/M/g) ?? []).length;

describe('viewOf', () => {
  it('looks at the model from the front, three-quarters, the side and the back', () => {
    expect(viewOf('front').forward).toEqual([0, 0, -1]);
    expect(viewOf('back').forward).toEqual([0, 0, 1]);
    expect(viewOf('side').forward).toEqual([-1, 0, 0]);
    for (const f of FACINGS) expect(viewOf(f).up).toEqual([0, 1, 0]);
  });

  it('turns the model to face the left of the sketch in three-quarter and side views', () => {
    // The model faces +Z; on screen, +Z must point left (negative "right").
    expect(dot(viewOf('side').right, [0, 0, 1])).toBeLessThan(0);
    expect(dot(viewOf('threeQuarter').right, [0, 0, 1])).toBeLessThan(0);
    // From the front, the model's left (+X) is on the viewer's right.
    expect(dot(viewOf('front').right, [1, 0, 0])).toBeGreaterThan(0);
  });
});

describe('renderSketch', () => {
  it('draws a cube from the front as one filled square with no inner lines', () => {
    const s = renderSketch(cube, 'front');
    expect(s.width).toBe(s.height);
    expect(s.metrics.fillRatio).toBeGreaterThan(0.9);
    expect(s.metrics.detailLength).toBe(0);
    // Four sides of about (320 - 2 × margin) each.
    expect(s.metrics.outlineLength).toBeGreaterThan(4 * 290);
    expect(s.metrics.outlineLength).toBeLessThan(4 * 320);
    expect(loops(paths(s.svg, 'fill')[0]!)).toBe(1);
  });

  it('shows the edge between two faces at three-quarters', () => {
    const s = renderSketch(cube, 'threeQuarter');
    expect(s.width / s.height).toBeCloseTo(Math.SQRT2, 1);
    // The cube is √2 wide, so its height is about 312 / √2 units.
    expect(s.metrics.detailLength).toBeGreaterThan(200);
    expect(s.metrics.detailLength).toBeLessThan(240);
  });

  it('hides lines behind nearer surfaces', () => {
    const big = box([-0.5, 0, 0], [0.5, 1, 0.2]);
    const hidden = boxes([
      { min: [-0.5, 0, 0], max: [0.5, 1, 0.2] },
      { min: [-0.2, 0.3, -0.6], max: [0.2, 0.7, -0.3] },
    ]);
    const alone = renderSketch(big, 'front').metrics;
    const both = renderSketch(hidden, 'front').metrics;
    expect(both.outlineLength).toBeCloseTo(alone.outlineLength, 0);
    expect(both.detailLength).toBe(0);
    // From the side the small box is beside the big one, so it shows.
    expect(renderSketch(hidden, 'side').metrics.outlineLength).toBeGreaterThan(
      renderSketch(big, 'side').metrics.outlineLength,
    );
  });

  it('leaves holes in the white fill, so what is behind shows through', () => {
    const frame = boxes([
      { min: [-0.5, 0, 0], max: [0.5, 0.2, 0.1] },
      { min: [-0.5, 0.8, 0], max: [0.5, 1, 0.1] },
      { min: [-0.5, 0.2, 0], max: [-0.3, 0.8, 0.1] },
      { min: [0.3, 0.2, 0], max: [0.5, 0.8, 0.1] },
    ]);
    const s = renderSketch(frame, 'front');
    expect(loops(paths(s.svg, 'fill')[0]!)).toBe(2);
    expect(s.svg).toContain('fill-rule="evenodd"');
  });

  it('writes a titled SVG that carries the Backstage id, facing and pose', () => {
    const s = renderSketch(figure(), 'side', {
      id: 'kenney/Biped/robot',
      title: 'Robot, side, walking',
      pose: 'walk',
    });
    expect(s.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
    expect(s.svg).toContain('data-backstage-id="kenney/Biped/robot"');
    expect(s.svg).toContain('data-facing="side"');
    expect(s.svg).toContain('data-pose="walk"');
    expect(s.svg).toContain('<title>Robot, side, walking</title>');
    expect(paths(s.svg, 'outline')).toHaveLength(1);
    expect(s.svg).not.toMatch(/NaN|Infinity/);
  });

  it('escapes text in the title and id', () => {
    const s = renderSketch(cube, 'front', { id: 'a"b', title: 'Tom & <Jerry>' });
    expect(s.svg).toContain('data-backstage-id="a&quot;b"');
    expect(s.svg).toContain('<title>Tom &amp; &lt;Jerry&gt;</title>');
  });

  it('gives the same sketch every time', () => {
    const fig = poseMesh(figure(), 'walk');
    expect(renderSketch(fig, 'threeQuarter').svg).toBe(renderSketch(fig, 'threeQuarter').svg);
  });

  it('draws the back as the front seen in a mirror', () => {
    const fig = poseMesh(figure(), 'point');
    const front = renderSketch(fig, 'front');
    const back = renderSketch(fig, 'back');
    expect(back.width).toBe(front.width);
    expect(back.metrics.fillRatio).toBeCloseTo(front.metrics.fillRatio, 2);
  });

  it('copes with an empty model', () => {
    const empty = { positions: new Float32Array(0), indices: new Uint32Array(0) };
    const s = renderSketch(empty, 'front');
    expect(s.metrics).toEqual({ fillRatio: 0, outlineLength: 0, detailLength: 0, lines: 0 });
    expect(s.svg).not.toMatch(/NaN|Infinity/);
  });
});
