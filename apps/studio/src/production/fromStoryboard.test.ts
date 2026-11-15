import type { BackstageItem } from '@storystage/backstage';
import { facing, heightOnPicture, inCamera, project } from '@storystage/check';
import {
  exampleProduction,
  type Frame,
  type PlacedSketch,
  type Production,
} from '@storystage/production';
import type { BackstageId, Transform } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LENS,
  placeFromStoryboard,
  storyboardPlan,
  type Placement,
} from './fromStoryboard.ts';

// Set the stage from the storyboard (WP10.10; M4 gate section 4): the check's geometry backwards.

const item = (id: string, section: BackstageItem['section'], cls: string, height = 1.6) =>
  ({
    id,
    section,
    class: cls,
    displayName: id
      .split('/')
      .pop()!
      .replace(/^./, (c) => c.toUpperCase()),
    themes: [],
    defaultSize: { height },
  }) as unknown as BackstageItem;

const ITEMS = [
  item('kaykit/Biped/knight', 'cast', 'Biped'),
  item('kaykit/Biped/rogue', 'cast', 'Biped'),
  item('kaykit/Flyer/owl', 'cast', 'Flyer', 0.5),
  item('kaykit/Prop/chest', 'props', 'Prop', 0.6),
  item('kaykit/Ground/forest-floor', 'backdrops', 'Ground'),
  item('kaykit/Sky/clear-day', 'backdrops', 'Sky'),
];
const backstage = {
  item: (id: string) => ITEMS.find((i) => i.id === id),
  backdrops: ITEMS.filter((i) => i.section === 'backdrops'),
};

const sketch = (id: string, over: Partial<PlacedSketch>): PlacedSketch => ({
  id,
  item: 'kaykit/Biped/knight' as BackstageId,
  facing: 'front',
  pose: null,
  x: 0.5,
  y: 0.6,
  scale: 1,
  flipped: false,
  layer: 0,
  ...over,
});

const example = exampleProduction();
const scene = example.scenes[0]!.id;
const first = example.frames.find((f) => f.scene === scene)!;

/** Scene 1 with nothing on its stage, frame 1.1 sketched as given, and a frame 1.2 after it. */
function storyboarded(
  sketches: PlacedSketch[],
  later: PlacedSketch[] = [],
  shot = 'wide',
): Production {
  const second: Frame = {
    ...first,
    id: 'later' as Frame['id'],
    order: 1,
    sketches: later,
    links: [],
  };
  return {
    ...example,
    scenes: example.scenes.map((s) =>
      s.id === scene ? { ...s, setup: { ...s.setup, objects: [] } } : s,
    ),
    frames: [
      ...example.frames.map((f) =>
        f.id === first.id ? { ...f, sketches, shot: shot as Frame['shot'] } : f,
      ),
      second,
    ],
  };
}

const cameraOf = (p: Production) => p.scenes[0]!.setup.camera.transform;
const objects = (plan: Placement[]) =>
  plan.filter((x): x is Extract<Placement, { kind: 'object' }> => x.kind === 'object');
const middle = (t: Transform, height = 1.6) => ({ ...t.position, y: t.position.y + height / 2 });

describe('setting the stage from the storyboard', () => {
  it('stands each character on the side it’s sketched, facing as sketched', () => {
    const p = storyboarded([
      sketch('a', { x: 0.25, facing: 'front' }),
      sketch('b', {
        item: 'kaykit/Biped/rogue' as BackstageId,
        x: 0.75,
        facing: 'side',
        flipped: true,
      }),
    ]);
    const [knight, rogue] = objects(storyboardPlan(p, scene, backstage));
    const camera = cameraOf(p);
    expect(knight!.name).toBe('Knight');
    expect(project(camera, DEFAULT_LENS, middle(knight!.transform)).x).toBeCloseTo(0.25, 1);
    expect(facing(knight!.transform, camera).view).toBe('front');
    expect(project(camera, DEFAULT_LENS, middle(rogue!.transform)).x).toBeCloseTo(0.75, 1);
    // Unflipped, a side sketch faces the picture's left; flipped, its right.
    expect(facing(rogue!.transform, camera)).toEqual({ view: 'side', towards: 'right' });
    for (const o of [knight!, rogue!]) expect(o.transform.position.y).toBe(0);
  });

  it('stands a bigger sketch nearer, as big on the picture as it was drawn', () => {
    const p = storyboarded(
      [
        sketch('a', { x: 0.3, scale: 1.5 }),
        sketch('b', { item: 'kaykit/Biped/rogue' as BackstageId, x: 0.7, scale: 0.8 }),
      ],
      [],
      'medium',
    );
    const [near, far] = objects(storyboardPlan(p, scene, backstage));
    const camera = cameraOf(p);
    const depth = (t: Transform) => inCamera(camera, middle(t)).z;
    expect(depth(near!.transform)).toBeLessThan(depth(far!.transform));
    expect(heightOnPicture(1.6, depth(far!.transform), DEFAULT_LENS)).toBeCloseTo(0.3 * 0.8, 1);
  });

  it('keeps a wide shot wide, whatever size the sketch', () => {
    const p = storyboarded([sketch('a', { scale: 3 })], [], 'wide');
    const [knight] = objects(storyboardPlan(p, scene, backstage));
    const depth = inCamera(cameraOf(p), middle(knight!.transform)).z;
    expect(heightOnPicture(1.6, depth, DEFAULT_LENS)).toBeLessThanOrEqual(0.6);
  });

  it('places props, and keeps cast of later frames just off stage on their side', () => {
    const p = storyboarded(
      [sketch('a', { x: 0.5 }), sketch('c', { item: 'kaykit/Prop/chest' as BackstageId, x: 0.6 })],
      [sketch('o', { item: 'kaykit/Flyer/owl' as BackstageId, x: 0.1, facing: 'side' })],
    );
    const plan = objects(storyboardPlan(p, scene, backstage));
    expect(plan.map((o) => [o.name, o.section, o.offStage])).toEqual([
      ['Knight', 'cast', false],
      ['Chest', 'props', false],
      ['Owl', 'cast', true],
    ]);
    const owl = plan[2]!;
    const seen = project(cameraOf(p), DEFAULT_LENS, middle(owl.transform, 0.5));
    expect(seen.onScreen).toBe(false);
    expect(seen.x).toBeLessThan(0);
    // Facing in, towards the picture's middle.
    expect(facing(owl.transform, cameraOf(p))).toEqual({ view: 'side', towards: 'right' });
  });

  it('chooses a Backstage backdrop like the backdrop sketch, and skips marks', () => {
    const p = storyboarded([
      sketch('t', { item: 'backdrop/trees' as BackstageId }),
      sketch('m', { item: 'mark/speech' as BackstageId }),
    ]);
    expect(storyboardPlan(p, scene, backstage)).toEqual([
      {
        kind: 'backdrop',
        key: 'backdrop:ground',
        name: 'Forest-floor',
        part: 'ground',
        id: 'kaykit/Ground/forest-floor',
      },
    ]);
  });

  it('leaves out what the stage has already, and plans nothing for a scene with no frame', () => {
    const p = storyboarded([sketch('a', {}), sketch('b', { x: 0.8 })]);
    const once = placeFromStoryboard(p, scene, storyboardPlan(p, scene, backstage), 'Set up');
    if (!once.ok) throw new Error('refused');
    expect(storyboardPlan(once.step.production, scene, backstage)).toEqual([]);
    const none = { ...p, frames: p.frames.filter((f) => f.scene !== scene) };
    expect(storyboardPlan(none, scene, backstage)).toEqual([]);
  });

  it('places the plan as one step, two knights given names of their own', () => {
    const p = storyboarded([
      sketch('a', { x: 0.3 }),
      sketch('b', { x: 0.7 }),
      sketch('t', { item: 'backdrop/trees' as BackstageId }),
    ]);
    const plan = storyboardPlan(p, scene, backstage);
    const placed = placeFromStoryboard(p, scene, plan, 'Set up scene 1 from the storyboard');
    if (!placed.ok) throw new Error('refused');
    const setup = placed.step.production.scenes[0]!.setup;
    expect(setup.objects.map((o) => o.id)).toEqual(['knight', 'knight2']);
    expect(setup.backdrop.ground).toBe('kaykit/Ground/forest-floor');
    expect(placed.step.label).toBe('Set up scene 1 from the storyboard');
    expect(placed.step.edits.length).toBe(placed.step.inverses.length);
  });
});
