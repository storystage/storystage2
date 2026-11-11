import { nodeId } from '@storystage/ast';
import {
  frameId,
  lineId,
  sceneId,
  type Frame,
  type PlacedSketch,
  type ScriptLine,
} from '@storystage/production';
import {
  IDENTITY,
  micros,
  type BackstageId,
  type Quat,
  type Transform,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { compareFrame, type FrameRun, type Seen } from './compare.ts';

const S = sceneId('s2');
const LENS = 0.5 / (2 * Math.PI);
const OWL = 'class/Flyer/owl' as BackstageId;
const FOX = 'class/Quadruped/fox' as BackstageId;
const aboutY = (turns: number): Quat => ({
  x: 0,
  y: Math.sin(turns * Math.PI),
  z: 0,
  w: Math.cos(turns * Math.PI),
});
const FACING_CAMERA = aboutY(0.5);
const at = (x: number, z: number, rotation: Quat = FACING_CAMERA): Transform => ({
  ...IDENTITY,
  position: { x, y: 0, z },
  rotation,
});
/** The camera at eye height, looking along +Z: +X is the picture's left. */
const CAMERA: Transform = { ...IDENTITY, position: { x: 0, y: 1, z: 0 } };

const sketch = (
  id: string,
  item: BackstageId,
  x: number,
  facing: PlacedSketch['facing'] = 'front',
): PlacedSketch => ({
  id,
  item,
  facing,
  pose: null,
  x,
  y: 0.6,
  scale: 1,
  flipped: false,
  layer: 0,
});

const frame = (over: Partial<Frame> = {}): Frame => ({
  id: frameId('f21'),
  scene: S,
  order: 0,
  caption: 'Owl meets Fox',
  shot: 'twoShot',
  lengthSeconds: 3,
  // The owl on the left of the sketch, the fox on the right.
  sketches: [sketch('k1', OWL, 0.25), sketch('k2', FOX, 0.75)],
  links: [nodeId('blockA')],
  ...over,
});

const seen = (
  object: string,
  model: BackstageId,
  transform: Transform,
  over: Partial<Seen> = {},
): Seen => ({
  object,
  name: object === 'owl' ? 'Owl' : 'Fox',
  model,
  transform,
  height: 1,
  showing: true,
  seenDuring: true,
  ...over,
});

const line = (id: string, text: string, pinned: string | null = 'f21'): ScriptLine => ({
  id: lineId(id),
  scene: S,
  kind: 'dialogue',
  character: 'OWL',
  text,
  pinnedFrame: pinned === null ? null : frameId(pinned),
});

/** A frame that matches its storyboard: the owl on the left, the fox on the right, both facing us. */
function matching(over: Partial<FrameRun> = {}): FrameRun {
  return {
    frame: frame(),
    sceneNumber: 2,
    frameNumber: '2.1',
    span: { start: micros(10), end: micros(13) },
    camera: CAMERA,
    lens: LENS,
    // +X is the picture's left: the owl at x = 1, the fox at x = -1, 6 m ahead.
    characters: [seen('owl', OWL, at(1, 6)), seen('fox', FOX, at(-1, 6))],
    script: [line('l1', 'Here is the key.')],
    said: [{ text: 'Here is the key.', start: micros(11) }],
    spoken: [],
    lines: new Map(),
    otherFrames: [],
    error: null,
    missing: [],
    cast: [OWL, FOX],
    ...over,
  };
}

const flags = (run: FrameRun) => compareFrame(run).filter((i) => i.outcome === 'flag');

describe('compareFrame', () => {
  it('gives no flags on a frame that matches its storyboard', () => {
    expect(flags(matching())).toEqual([]);
    const words = compareFrame(matching()).map((i) => i.words);
    expect(words).toContain('Owl is on screen');
    expect(words).toContain('Owl is on the left, as in your sketch');
    expect(words).toContain('Line 2.1 is said');
    expect(words).toContain('This frame lasts about 3 seconds, as planned');
  });

  it('flags a missing character', () => {
    const run = matching({ characters: [seen('owl', OWL, at(1, 6))] });
    expect(flags(run).map((i) => i.words)).toEqual([
      "Fox isn't on screen at the end of this frame",
    ]);
  });

  it('flags a character that walks off camera during the frame', () => {
    const run = matching({
      characters: [seen('owl', OWL, at(1, 6)), seen('fox', FOX, at(-20, 6), { seenDuring: true })],
    });
    expect(flags(run)).toMatchObject([
      { kind: 'offCamera', words: 'Fox walks off camera during this frame', sketch: 'k2' },
    ]);
  });

  it("counts a character that isn't showing as not on screen", () => {
    const run = matching({
      characters: [
        seen('owl', OWL, at(1, 6)),
        seen('fox', FOX, at(-1, 6), { showing: false, seenDuring: false }),
      ],
    });
    expect(flags(run).map((i) => i.kind)).toEqual(['onScreen']);
  });

  it('flags a mirrored position, and the swapped order', () => {
    const run = matching({ characters: [seen('owl', OWL, at(-1, 6)), seen('fox', FOX, at(1, 6))] });
    expect(flags(run).map((i) => i.words)).toEqual([
      'Owl ends on the right; your sketch has it on the left',
      'Fox ends on the left; your sketch has it on the right',
      'Owl and Fox are the other way round from your sketch',
    ]);
  });

  it("doesn't flag a character near the middle, or two close together", () => {
    const run = matching({
      characters: [seen('owl', OWL, at(0.1, 6)), seen('fox', FOX, at(-0.1, 6))],
    });
    expect(flags(run)).toEqual([]);
  });

  it('flags facing away when the sketch faces the camera, but not a small turn', () => {
    const away = matching({
      characters: [seen('owl', OWL, at(1, 6, aboutY(0))), seen('fox', FOX, at(-1, 6))],
    });
    expect(flags(away).map((i) => i.words)).toEqual([
      'Owl faces away; your sketch has it facing the camera',
    ]);
    const slight = matching({
      characters: [seen('owl', OWL, at(1, 6, aboutY(0.5 + 0.1))), seen('fox', FOX, at(-1, 6))],
    });
    expect(flags(slight)).toEqual([]);
  });

  it('flags a close-up that does not fill the picture with its character', () => {
    const run = matching({
      frame: frame({ shot: 'closeUp', sketches: [sketch('k1', OWL, 0.5)] }),
      characters: [seen('owl', OWL, at(0, 6))],
    });
    expect(flags(run).map((i) => i.words)).toEqual([
      "The close-up doesn't fill the picture with Owl",
    ]);
    const close = matching({
      frame: frame({ shot: 'closeUp', sketches: [sketch('k1', OWL, 0.5)] }),
      // 2 m tall, so its middle is at the camera's height and it fills the picture.
      characters: [seen('owl', OWL, at(0, 1.2), { height: 2 })],
    });
    expect(flags(close)).toEqual([]);
  });

  it('flags an unsaid line, and notes one said in another frame', () => {
    expect(flags(matching({ said: [] })).map((i) => i.words)).toEqual(['Line 2.1 is never said']);
    const later = compareFrame(
      matching({
        said: [{ text: 'Here is the key!', start: micros(15) }],
        otherFrames: [{ frameNumber: '2.2', span: { start: micros(13), end: micros(18) } }],
      }),
    );
    expect(later.filter((i) => i.outcome !== 'passed').map((i) => [i.outcome, i.words])).toEqual([
      ['note', 'Line 2.1 is said in frame 2.2'],
    ]);
  });

  it('flags a frame twice its planned length, but not one a little over', () => {
    const twice = matching({ span: { start: micros(10), end: micros(16) } });
    expect(flags(twice).map((i) => i.words)).toEqual(['This frame lasts 6 seconds; you planned 3']);
    const over = matching({ span: { start: micros(10), end: micros(14) } });
    expect(flags(over)).toEqual([]);
  });

  it('flags an error in the frame with its own words, at its block', () => {
    const run = matching({
      error: {
        at: micros(12),
        node: nodeId('badbad'),
        words: "This block got something it can't use.",
      },
    });
    expect(flags(run)).toMatchObject([
      { kind: 'problem', words: "This block got something it can't use.", node: 'badbad' },
    ]);
  });

  it('notes a model this device could not find', () => {
    const run = matching({ missing: [{ kind: 'model', object: 'owl' as never, model: OWL }] });
    expect(
      compareFrame(run)
        .filter((i) => i.outcome === 'note')
        .map((i) => i.words),
    ).toEqual(["owl can't be found on this device, so it shows as an outline"]);
  });

  it('gives each item a stable id, unique in the frame', () => {
    const ids = compareFrame(matching()).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('onScreen:k1');
    expect(ids).toContain('line:l1');
  });
});
