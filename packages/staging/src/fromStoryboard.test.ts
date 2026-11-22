import type { BackstageItem } from '@storystage/backstage';
import {
  compareFrame,
  facing,
  heightOnPicture,
  inCamera,
  project,
  type FrameRun,
} from '@storystage/check';
import {
  addObject,
  applyProgramEdits,
  exampleProduction,
  type Frame,
  type PlacedSketch,
  type Production,
} from '@storystage/production';
import type { BackstageId, SceneObjectSetup, Transform } from '@storystage/story-api';
import { classFor } from '@storystage/story-api/editing';
import { describe, expect, it } from 'vitest';
import {
  chosenPlan,
  DEFAULT_LENS,
  headingBackdrops,
  placeFromStoryboard,
  placeLike,
  storyboardPlan,
  type Placement,
} from './fromStoryboard.ts';

// Set the stage from the storyboard (WP10.10; M4 gate section 4): the check's geometry backwards.

const item = (
  id: string,
  section: BackstageItem['section'],
  cls: string,
  height = 1.6,
  themes: string[] = [],
  displayName = id
    .split('/')
    .pop()!
    .replace(/^./, (c) => c.toUpperCase()),
) =>
  ({
    id,
    section,
    class: cls,
    displayName,
    themes,
    defaultSize: { height },
  }) as unknown as BackstageItem;

const ITEMS = [
  item('kaykit/Biped/knight', 'cast', 'Biped'),
  item('kaykit/Biped/rogue', 'cast', 'Biped'),
  item('kaykit/Flyer/owl', 'cast', 'Flyer', 0.5),
  item('kaykit/Prop/chest', 'props', 'Prop', 0.6),
  item('kaykit/Ground/forest-floor', 'backdrops', 'Ground'),
  item('kaykit/Sky/clear-day', 'backdrops', 'Sky'),
  item('kaykit/Sky/night', 'backdrops', 'Sky', 1.6, ['night']),
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

/**
 * Scene 1 with nothing on its stage (or `objects`), frame 1.1 sketched as given, and a frame 1.2
 * after it. `heading` clears the backdrop and heads the scene.
 */
function storyboarded(
  sketches: PlacedSketch[],
  later: PlacedSketch[] = [],
  shot = 'wide',
  { objects = [], heading }: { objects?: SceneObjectSetup[]; heading?: string } = {},
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
      s.id === scene
        ? {
            ...s,
            setup: {
              ...s.setup,
              objects,
              ...(heading === undefined ? {} : { backdrop: {} }),
            },
          }
        : s,
    ),
    storyboard: {
      ...example.storyboard,
      cards: example.storyboard.cards.map((c) =>
        c.id === scene && heading !== undefined ? { ...c, heading } : c,
      ),
    },
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

  it('stands a stand-in as tall as the stage draws one: a metre', () => {
    const p = storyboarded([sketch('d', { item: { standIn: 'dragon' } })], [], 'medium');
    const [dragon] = objects(storyboardPlan(p, scene, backstage));
    const depth = inCamera(cameraOf(p), middle(dragon!.transform, 1)).z;
    expect(heightOnPicture(1, depth, DEFAULT_LENS)).toBeCloseTo(0.3, 2);
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
        from: 'sketch',
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

  it.each([
    ['a Backstage model', 'kaykit/Biped/knight' as BackstageId],
    ['a stand-in', { standIn: 'Knight' } as SceneObjectSetup['model']],
  ])('places %s as of the class the learner made for it, in any scene (0074)', (_, model) => {
    const bare = storyboarded([
      sketch('a', { x: 0.3, item: model as PlacedSketch['item'] }),
      sketch('b', { x: 0.7, item: model as PlacedSketch['item'] }),
    ]);
    const other = bare.scenes[1]!;
    const there = addObject(
      bare,
      other.id,
      { model, class: 'Biped', name: 'Sir', transform: other.setup.camera.transform },
      'Add',
    );
    if (!there.ok) throw new Error('refused');
    const field = there.step.production.program.types
      .flatMap((t) => t.fields)
      .find((f) => f.name === 'sir')!;
    // Made under another name, so only the object in scene 2 finds it (S6, #624).
    const made = classFor(
      there.step.production.program,
      { name: 'Old knight', storyClass: 'Biped' },
      [field.id],
    )!;
    const edited = applyProgramEdits(there.step.production, made.edits);
    if (!('program' in edited)) throw new Error('refused');
    const p = { ...there.step.production, program: edited.program };
    const step = placed(p);
    const names = step.production.scenes[0]!.setup.objects.map((o) => o.id as string);
    expect(names).toHaveLength(2);
    const types = step.production.program.types
      .flatMap((t) => t.fields)
      .filter((f) => names.includes(f.name))
      .map((f) => f.type)
      .filter((t) => t.kind === 'user');
    expect(types).toEqual([
      { kind: 'user', type: made.type },
      { kind: 'user', type: made.type },
    ]);
  });
});

/** What the check flags in frame 1.1 for `p`'s scene 1 as it's set up. */
function flags(p: Production) {
  const setup = p.scenes[0]!.setup;
  const frame = p.frames.find((f) => f.id === first.id)!;
  const run = {
    frame,
    sceneNumber: 1,
    frameNumber: '1.1',
    span: { start: 0, end: 1_000_000 },
    camera: setup.camera.transform,
    lens: DEFAULT_LENS,
    characters: setup.objects.map((o) => ({
      object: o.id,
      name: o.id,
      model: o.model,
      transform: o.transform,
      height: backstage.item(o.model as string)!.defaultSize.height,
      showing: true,
      seenDuring: true,
    })),
    script: [],
    said: [],
    spoken: [],
    lines: new Map(),
    otherFrames: [],
    error: null,
    missing: [],
    cast: [],
  } as unknown as FrameRun;
  return compareFrame(run)
    .filter((i) => i.outcome === 'flag')
    .map((i) => i.kind);
}

/** A knight on the stage at 0.4 across the picture, filling `share` of its height. */
const knightAt = (p: Production, share: number): SceneObjectSetup => ({
  id: 'knight' as SceneObjectSetup['id'],
  model: 'kaykit/Biped/knight' as BackstageId,
  class: 'Biped' as SceneObjectSetup['class'],
  transform: placeLike(cameraOf(p), DEFAULT_LENS, 1.6, 0.4, share, 'front', null),
});

function placed(p: Production, plan = storyboardPlan(p, scene, backstage)) {
  const done = placeFromStoryboard(p, scene, plan, 'Set up');
  if (!done.ok) throw new Error('refused');
  return done.step;
}

describe('the backdrop from the scene’s heading', () => {
  const backdrop = (id: string, cls: string, name: string, themes: string[]) =>
    item(id, 'backdrops', cls, 0, themes, name);
  const BACKDROPS = [
    backdrop('storystage/Ground/darkForestFloor', 'Ground', 'Dark forest floor', [
      'forest',
      'night',
    ]),
    backdrop('storystage/Ground/forestFloor', 'Ground', 'Forest floor', ['forest', 'nature']),
    backdrop('storystage/Ground/ice', 'Ground', 'Ice', ['winter']),
    backdrop('storystage/Ground/room', 'Ground', 'Room', ['home', 'school']),
    backdrop('storystage/Sky/clearDay', 'Sky', 'Clear day', ['day']),
    backdrop('storystage/Sky/cloudy', 'Sky', 'Cloudy', ['day']),
    backdrop('storystage/Sky/night', 'Sky', 'Night', ['night']),
    backdrop('storystage/Sky/sunset', 'Sky', 'Sunset', ['evening']),
  ];
  const read = (heading: string) =>
    Object.fromEntries(
      [...headingBackdrops(heading, BACKDROPS)].map(([part, i]) => [part, i.displayName]),
    );

  it('reads the place and the time', () => {
    expect(read('Forest, night')).toEqual({ ground: 'Dark forest floor', sky: 'Night' });
    expect(read('Ice shelf, morning')).toEqual({ ground: 'Ice', sky: 'Clear day' });
    expect(read('The woods at dusk')).toEqual({ ground: 'Forest floor', sky: 'Sunset' });
    expect(read('Kitchen, cloudy afternoon')).toEqual({ ground: 'Room', sky: 'Cloudy' });
    expect(read('Somewhere')).toEqual({});
  });

  it('sets only what neither a sketch nor the stage has', () => {
    const p = storyboarded([sketch('t', { item: 'backdrop/trees' as BackstageId })], [], 'wide', {
      heading: 'Forest, night',
    });
    const backdrops = storyboardPlan(p, scene, backstage).filter((x) => x.kind === 'backdrop');
    expect(backdrops.map((b) => [b.part, b.id, b.from])).toEqual([
      ['ground', 'kaykit/Ground/forest-floor', 'sketch'],
      ['sky', 'kaykit/Sky/night', 'heading'],
    ]);
    // Once set, the heading offers nothing more.
    expect(storyboardPlan(placed(p).production, scene, backstage)).toEqual([]);
  });
});

describe('the camera, for the first frame’s shot', () => {
  const two = () => [
    sketch('a', { x: 0.4 }),
    sketch('b', { item: 'kaykit/Biped/rogue' as BackstageId, x: 0.8 }),
  ];

  it('goes closer for a close-up of someone on the stage already, keeping them in place', () => {
    const empty = storyboarded([sketch('a', { x: 0.4 })], [], 'closeUp');
    const p = storyboarded([sketch('a', { x: 0.4 })], [], 'closeUp', {
      objects: [knightAt(empty, 0.1)],
    });
    expect(flags(p)).toEqual(['shot']);
    const plan = storyboardPlan(p, scene, backstage);
    expect(plan.map((x) => [x.kind, x.kind === 'camera' && x.name])).toEqual([
      ['camera', 'Knight'],
    ]);
    const after = placed(p).production;
    expect(flags(after)).toEqual([]);
    const knight = middle(after.scenes[0]!.setup.objects[0]!.transform);
    expect(project(cameraOf(after), DEFAULT_LENS, knight).x).toBeCloseTo(
      project(cameraOf(p), DEFAULT_LENS, knight).x,
      3,
    );
  });

  it('goes back for a wide shot, and places the rest for where it goes', () => {
    const empty = storyboarded(two());
    const p = storyboarded(two(), [], 'wide', { objects: [knightAt(empty, 0.9)] });
    expect(flags(p)).toContain('shot');
    const after = placed(p).production;
    expect(after.scenes[0]!.setup.objects.map((o) => o.id)).toEqual(['knight', 'rogue']);
    expect(flags(after)).toEqual([]);
  });

  it('stays where it is when left out, the rest placed for it there', () => {
    const empty = storyboarded(two());
    const p = storyboarded(two(), [], 'wide', { objects: [knightAt(empty, 0.9)] });
    const plan = storyboardPlan(p, scene, backstage);
    const rogue = plan.find((x) => x.kind === 'object')!;
    const after = placed(p, chosenPlan(p, scene, backstage, plan, new Set([rogue.key]))).production;
    expect(cameraOf(after)).toEqual(cameraOf(p));
    const placedRogue = after.scenes[0]!.setup.objects[1]!;
    expect(project(cameraOf(p), DEFAULT_LENS, middle(placedRogue.transform)).x).toBeCloseTo(0.8, 1);
  });
});

describe('the M4 gate: setting the stage from a five-sketch frame', () => {
  it('places each on its side, facing its way, with the backdrop and shot, in one undo', () => {
    const p = storyboarded(
      [
        sketch('k', { x: 0.15, facing: 'front' }),
        sketch('r', {
          item: 'kaykit/Biped/rogue' as BackstageId,
          x: 0.85,
          facing: 'side',
          flipped: true,
        }),
        sketch('o', {
          item: 'kaykit/Flyer/owl' as BackstageId,
          x: 0.5,
          facing: 'threeQuarter',
          scale: 0.6,
        }),
        sketch('c', { item: 'kaykit/Prop/chest' as BackstageId, x: 0.35, scale: 0.7 }),
        sketch('t', { item: 'backdrop/trees' as BackstageId }),
      ],
      [],
      'wide',
      { heading: 'Forest, night' },
    );
    const step = placed(p);
    const setup = step.production.scenes[0]!.setup;
    expect(setup.objects.map((o) => o.id).sort()).toEqual(['chest', 'knight', 'owl', 'rogue']);
    expect(setup.backdrop).toMatchObject({
      ground: 'kaykit/Ground/forest-floor',
      sky: 'kaykit/Sky/night',
    });
    // The check passes everything it judges: who's on screen, sides, facing, order and shot.
    expect(flags(step.production)).toEqual([]);
    expect(step.edits.length).toBe(step.inverses.length);
  });
});
