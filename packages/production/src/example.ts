/**
 * A small, complete three-scene production for tests in every lane: the save and open round
 * trip (WP8), export (WP11), the self-test (WP18.1) and the Prompter's storyboard tools (WP13).
 * It uses stand-ins and made-up Backstage ids, so it needs no model files.
 */
import { nodeId } from '@storystage/ast';
import { IDENTITY, backstageId, micros, objectId, type SceneSetup } from '@storystage/story-api';
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

export function exampleProduction(): Production {
  return {
    manifest: {
      format: 'storystage',
      formatVersion: FORMAT_VERSION,
      createdWith: { app: 'StoryStage', version: '0.0.0' },
      title: 'The Lost Penguin',
      runningOrder: [
        { scene: s1, transition: { kind: 'cut', duration: 0 } },
        { scene: s2, transition: { kind: 'fadeToBlack', duration: micros(1) } },
        { scene: s3, transition: { kind: 'crossfade', duration: micros(0.5) } },
      ],
      audio: [],
    },
    program: { schemaVersion: '1.0.0' },
    scenes: [
      { id: s1, setup: setup('ice', 'morning'), method: nodeId('m-s1') },
      { id: s2, setup: setup('forest', 'night'), method: nodeId('m-s2') },
      { id: s3, setup: setup('ice', 'evening'), method: nodeId('m-s3') },
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
        links: [nodeId('m-s1')],
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
        links: [],
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
        links: [],
      },
    ],
  };
}
