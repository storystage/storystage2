/**
 * A small, complete three-scene production for tests in every lane: the save and open round
 * trip (WP8), export (WP11), the self-test (WP18.1) and the Prompter's storyboard tools (WP13).
 * It uses stand-ins and made-up Backstage ids, so it needs no model files.
 */
import { nodeId, type NodeId, type TypeDecl } from '@storystage/ast';
import {
  IDENTITY,
  backstageId,
  micros,
  objectId,
  type BackstageId,
  type Quat,
  type SceneSetup,
  type StandIn,
} from '@storystage/story-api';
import { FORMAT_VERSION, frameId, lineId, sceneId, type Production } from './types.ts';

const penguin = backstageId('example/Flyer/penguin');
const fox = { standIn: 'fox' } as const;

const setup = (ground: string, sky: string): SceneSetup => ({
  backdrop: {
    ground: backstageId(`example/Ground/${ground}`),
    sky: backstageId(`example/Sky/${sky}`),
    fog: 0,
  },
  objects: [
    {
      id: objectId('penguin'),
      model: penguin,
      class: 'Flyer',
      transform: { ...IDENTITY, position: { x: -1, y: 0, z: 0 } },
    },
    {
      id: objectId('fox'),
      model: fox,
      class: 'Quadruped',
      transform: { ...IDENTITY, position: { x: 1.5, y: 0, z: 0.5 } },
    },
  ],
  camera: { transform: { ...IDENTITY, position: { x: 0, y: 1.6, z: -5 } } },
  markers: [],
});

const s1 = sceneId('s1');
const s2 = sceneId('s2');
const s3 = sceneId('s3');

/** The ids of scene `n`'s method and its one block, for scenes and frame links. */
const methodOf = (n: number): NodeId => nodeId(`scene${n}m`);
const blockOf = (n: number): NodeId => nodeId(`scene${n}b`);

/** Scene `n` as a type: a camera, the two actors and a script method where one of them speaks. */
function sceneType(n: number, speaker: 'penguin' | 'fox', line: string): TypeDecl {
  const id = (part: string) => nodeId(`scene${n}${part}`);
  const penguinField = id('p');
  const foxField = id('f');
  return {
    id: id('t'),
    kind: 'type',
    name: `Scene${n}`,
    extends: { kind: 'story', name: 'Scene' },
    fields: [
      {
        id: id('c'),
        kind: 'field',
        name: 'camera',
        type: { kind: 'story', name: 'Camera' },
        initial: null,
      },
      {
        id: penguinField,
        kind: 'field',
        name: 'penguin',
        type: { kind: 'story', name: 'Flyer' },
        initial: null,
      },
      {
        id: foxField,
        kind: 'field',
        name: 'fox',
        type: { kind: 'story', name: 'Quadruped' },
        initial: null,
      },
    ],
    methods: [
      {
        id: methodOf(n),
        kind: 'method',
        name: 'myFirstMethod',
        returns: null,
        params: [],
        body: [
          {
            id: blockOf(n),
            kind: 'call',
            target: {
              id: id('r'),
              kind: 'fieldRef',
              target: { id: id('s'), kind: 'this' },
              field: speaker === 'penguin' ? penguinField : foxField,
            },
            callee: { kind: 'story', name: 'say' },
            args: { text: { id: id('x'), kind: 'text', value: line } },
            details: {},
          },
        ],
      },
    ],
    listeners: [],
  };
}

export function exampleProduction(): Production {
  return {
    manifest: {
      format: 'storystage',
      formatVersion: FORMAT_VERSION,
      createdWith: { app: 'StoryStage', version: '0.0.0' },
      title: 'The Lost Penguin',
      origin: 'storystage',
      runningOrder: [
        { scene: s1, transition: { kind: 'cut', duration: 0 } },
        { scene: s2, transition: { kind: 'fadeToBlack', duration: micros(1) } },
        { scene: s3, transition: { kind: 'crossfade', duration: micros(0.5) } },
      ],
      audio: [],
      models: [],
    },
    program: {
      schemaVersion: '1.0.0',
      types: [
        sceneType(1, 'penguin', 'Oh no, the ice is moving!'),
        sceneType(2, 'fox', "Don't be scared. I'm lost too."),
        sceneType(3, 'penguin', 'Home! Thank you, Fox.'),
      ],
    },
    scenes: [
      { id: s1, setup: setup('ice', 'morning'), method: methodOf(1) },
      { id: s2, setup: setup('forest', 'night'), method: methodOf(2) },
      { id: s3, setup: setup('ice', 'evening'), method: methodOf(3) },
    ],
    storyboard: {
      logline: 'A penguin lost in a forest finds an unlikely friend who helps her home.',
      synopsis:
        'Pip the penguin drifts away from the ice on a floe and lands in a dark forest. A fox she is afraid of turns out to be lost too. Together they find the river that leads back to the sea.',
      arc: { template: 'threePart', parts: ['beginning', 'middle', 'end'] },
      cards: [
        { id: s1, heading: 'Ice shelf, morning', cast: [penguin], arcPart: 'beginning' },
        { id: s2, heading: 'Forest, night', cast: [penguin, fox], arcPart: 'middle' },
        { id: s3, heading: 'Ice shelf, evening', cast: [penguin, fox], arcPart: 'end' },
      ],
    },
    script: [
      {
        id: lineId('l1'),
        scene: s1,
        kind: 'action',
        character: null,
        text: 'Pip slides to the edge of the ice.',
        pinnedFrame: frameId('f1'),
      },
      {
        id: lineId('l2'),
        scene: s1,
        kind: 'dialogue',
        character: 'PIP',
        text: 'Oh no, the ice is moving!',
        pinnedFrame: null,
      },
      {
        id: lineId('l3'),
        scene: s2,
        kind: 'dialogue',
        character: 'FOX',
        text: "Don't be scared. I'm lost too.",
        pinnedFrame: frameId('f2'),
      },
      {
        id: lineId('l4'),
        scene: s3,
        kind: 'dialogue',
        character: 'PIP',
        text: 'Home! Thank you, Fox.',
        pinnedFrame: frameId('f3'),
      },
    ],
    frames: [
      {
        id: frameId('f1'),
        scene: s1,
        order: 0,
        caption: 'Pip at the edge of the ice',
        shot: 'wide',
        lengthSeconds: 3,
        sketches: [
          {
            id: 'k1',
            item: penguin,
            facing: 'front',
            pose: null,
            x: 0.4,
            y: 0.6,
            scale: 1,
            flipped: false,
            layer: 0,
          },
        ],
        links: [blockOf(1)],
      },
      {
        id: frameId('f2'),
        scene: s2,
        order: 0,
        caption: 'Fox meets Pip',
        shot: 'twoShot',
        lengthSeconds: 4,
        sketches: [
          {
            id: 'k2',
            item: penguin,
            facing: 'threeQuarter',
            pose: null,
            x: 0.3,
            y: 0.6,
            scale: 1,
            flipped: false,
            layer: 0,
          },
          {
            id: 'k3',
            item: fox,
            facing: 'side',
            pose: null,
            x: 0.7,
            y: 0.6,
            scale: 1.2,
            flipped: true,
            layer: 1,
          },
        ],
        links: [blockOf(2)],
      },
      {
        id: frameId('f3'),
        scene: s3,
        order: 0,
        caption: 'Home again',
        shot: 'medium',
        lengthSeconds: 3,
        sketches: [
          {
            id: 'k4',
            item: penguin,
            facing: 'front',
            pose: null,
            x: 0.5,
            y: 0.6,
            scale: 1,
            flipped: false,
            layer: 0,
          },
        ],
        links: [blockOf(3)],
      },
    ],
  };
}

/** A model reference as the demo plays it: the cast as stand-ins of their real size. */
const DEMO_CAST: Readonly<Record<string, StandIn>> = {
  [penguin]: { standIn: 'penguin', size: { x: 0.4, y: 0.7, z: 0.4 } },
  fox: { standIn: 'fox', size: { x: 0.35, y: 0.5, z: 0.9 } },
};
const demoRef = (ref: BackstageId | StandIn): BackstageId | StandIn =>
  typeof ref === 'string' ? (DEMO_CAST[ref] ?? ref) : (DEMO_CAST[ref.standIn] ?? ref);

/** Each scene's backdrop, as one of the stage's built-in templates (`packages/stage`). */
const DEMO_BACKDROPS: Readonly<Record<string, string>> = {
  s1: 'ice',
  s2: 'northwestForest',
  s3: 'ice',
};
const DEMO_GROUNDS: Readonly<Record<string, string>> = {
  ice: 'ice',
  northwestForest: 'forestFloor',
};

/** A turn about the vertical, in degrees. A model faces its own +Z; 180° faces the camera. */
const turned = (degrees: number): Quat => {
  const half = (degrees * Math.PI) / 360;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
};

/**
 * Where the demo's cast stand in each scene, made to match its frames, so the automatic check
 * (spec 08 section 9) finds nothing to flag. The camera stands at z = -5 looking along +Z, so the
 * world's +X is the picture's left (`packages/check`, `geometry.ts`), and 180° faces it.
 */
const DEMO_PLACES: Readonly<
  Record<string, Readonly<Record<string, { x: number; z: number; degrees: number }>>>
> = {
  // Pip alone on the ice, facing the camera, before the fox is in the story: it's off screen.
  s1: { penguin: { x: 0.3, z: 0, degrees: 180 }, fox: { x: -9, z: 0, degrees: 180 } },
  // Fox meets Pip: Pip on the left, turned three-quarters to the fox; the fox on the right, side
  // on, facing Pip.
  s2: { penguin: { x: 1, z: 0, degrees: -125 }, fox: { x: -1.5, z: 0.5, degrees: 70 } },
  // Home again: Pip facing the camera, the fox further back, as the scene's card has it.
  s3: { penguin: { x: 0, z: 0, degrees: 180 }, fox: { x: -3, z: 2, degrees: 180 } },
};

/**
 * The demo's frame 2.1 has Pip and the fox facing each other. Unflipped, a side or three-quarter
 * sketch faces the picture's left: Pip, on the left, is flipped; the fox, on the right, isn't.
 */
const DEMO_FLIPPED: Readonly<Record<string, boolean>> = { k2: true, k3: false };

/**
 * The example production, playable on a real stage: what `?example` shows in the browser (S2,
 * S5). The same three scenes, script, storyboard and transitions, but every backdrop is one of the
 * stage's built-in templates (`storystage/Ground/...`, `storystage/Sky/...`,
 * `storystage/Lighting/...`), and the cast are stand-ins of their real size (format 1.2.0), so it
 * needs no model files and finds everything it uses. Its cast stand where its frames show them
 * (`DEMO_PLACES`), so checking it against its storyboard flags nothing. `exampleProduction` keeps its made-up ids,
 * which tests of unknown models rely on.
 */
export function demoProduction(): Production {
  const p = exampleProduction();
  return {
    ...p,
    manifest: { ...p.manifest, title: 'The Lost Penguin (demo)' },
    scenes: p.scenes.map((s) => {
      const template = DEMO_BACKDROPS[s.id]!;
      return {
        ...s,
        setup: {
          ...s.setup,
          backdrop: {
            ground: backstageId(`storystage/Ground/${DEMO_GROUNDS[template]}`),
            sky: backstageId(`storystage/Sky/${template}`),
            lighting: backstageId(`storystage/Lighting/${template}`),
            fog: 0.15,
          },
          objects: s.setup.objects.map((o) => {
            const at = DEMO_PLACES[s.id]?.[o.id];
            return {
              ...o,
              model: demoRef(o.model),
              ...(at && {
                transform: {
                  ...o.transform,
                  position: { x: at.x, y: o.transform.position.y, z: at.z },
                  rotation: turned(at.degrees),
                },
              }),
            };
          }),
        },
      };
    }),
    storyboard: {
      ...p.storyboard,
      cards: p.storyboard.cards.map((c) => ({ ...c, cast: c.cast.map(demoRef) })),
    },
    frames: p.frames.map((f) => ({
      ...f,
      sketches: f.sketches.map((k) => ({
        ...k,
        item: demoRef(k.item),
        flipped: DEMO_FLIPPED[k.id] ?? k.flipped,
      })),
    })),
  };
}
