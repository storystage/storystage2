import { nodeId, type NodeId } from '@storystage/ast';
import type { Timeline } from '@storystage/playback';
import {
  exampleProduction,
  frameId,
  sceneId,
  type Frame,
  type Production,
} from '@storystage/production';
import { micros } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import {
  clock,
  currentFrame,
  frameLabel,
  nudge,
  sceneAt,
  segments,
  sliderText,
  stillMoment,
  timeLabel,
} from './rough-cut.ts';

const S1 = sceneId('s1');
const S2 = sceneId('s2');
const S3 = sceneId('s3');
const A = nodeId('blockA');
const B = nodeId('blockB');
const C = nodeId('blockC');

const frame = (
  id: string,
  scene: typeof S1,
  order: number,
  seconds: number,
  links: NodeId[] = [],
): Frame => ({
  id: frameId(id),
  scene,
  order,
  caption: id,
  shot: 'wide',
  lengthSeconds: seconds,
  sketches: [],
  links,
});

/** The example production, with scene 2 storyboarded as three frames. */
function production(): Production {
  const p = exampleProduction();
  return {
    ...p,
    frames: [
      frame('f1', S1, 0, 3),
      frame('f2c', S2, 2, 2, [C]),
      frame('f2a', S2, 0, 2, [A]),
      frame('f2b', S2, 1, 3, [B]),
      frame('f3', S3, 0, 4),
    ],
  };
}

const timeline = (over: Partial<Timeline> = {}): Timeline => ({
  scenes: [
    { scene: S1, transition: null, start: 0, length: micros(4), waits: false },
    {
      scene: S2,
      transition: { kind: 'cut', duration: 0 },
      start: micros(4),
      length: micros(8),
      waits: false,
    },
    {
      scene: S3,
      transition: { kind: 'fadeToBlack', duration: micros(1) },
      start: micros(12),
      length: micros(60),
      waits: false,
    },
  ],
  blocks: [
    { scene: S2, node: A, at: micros(4) },
    { scene: S2, node: B, at: micros(6) },
    { scene: S2, node: A, at: micros(9) },
  ],
  lines: [],
  length: micros(72),
  end: { kind: 'ended' },
  ...over,
});

describe('segments', () => {
  it('gives one per scene, numbered in running order, with its heading', () => {
    expect(segments(production(), timeline())).toEqual([
      {
        scene: S1,
        number: 1,
        heading: 'Ice shelf, morning',
        start: 0,
        length: micros(4),
        waits: false,
      },
      {
        scene: S2,
        number: 2,
        heading: 'Forest, night',
        start: micros(4),
        length: micros(8),
        waits: false,
      },
      {
        scene: S3,
        number: 3,
        heading: 'Ice shelf, evening',
        start: micros(12),
        length: micros(60),
        waits: false,
      },
    ]);
  });

  it('numbers a scene by its place in the running order, even when one plays twice', () => {
    const t = timeline();
    const again = {
      ...t,
      scenes: [...t.scenes, { ...t.scenes[0]!, start: micros(72), length: micros(2) }],
    };
    expect(segments(production(), again).map((s) => s.number)).toEqual([1, 2, 3, 1]);
  });
});

describe('the time', () => {
  it('reads as minutes and seconds', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(micros(38.9))).toBe('0:38');
    expect(clock(micros(72))).toBe('1:12');
    expect(clock(micros(600))).toBe('10:00');
  });

  it('shows the time so far and the length, with a "+" when a scene waits', () => {
    expect(timeLabel(micros(38), timeline())).toBe('0:38 / 1:12');
    expect(sliderText(micros(38), timeline())).toBe('0:38 of 1:12');
    const t = timeline();
    const waits = { ...t, scenes: t.scenes.map((s, i) => (i === 1 ? { ...s, waits: true } : s)) };
    expect(timeLabel(micros(38), waits)).toBe('0:38 / 1:12+');
    expect(sliderText(micros(38), waits)).toBe('0:38 of 1:12 or more');
  });
});

describe('sceneAt', () => {
  const all = segments(production(), timeline());
  it('finds the scene playing at a moment, the later one at a boundary', () => {
    expect(sceneAt(all, 0)?.scene).toBe(S1);
    expect(sceneAt(all, micros(4))?.scene).toBe(S2);
    expect(sceneAt(all, micros(71.9))?.scene).toBe(S3);
  });
  it('gives the last scene at the end, and none for an empty film', () => {
    expect(sceneAt(all, micros(72))?.scene).toBe(S3);
    expect(sceneAt([], 0)).toBeNull();
  });
});

describe('currentFrame', () => {
  it('is the frame linked to the block that ran most recently', () => {
    expect(currentFrame(production(), timeline(), micros(5))?.id).toBe('f2a');
    expect(currentFrame(production(), timeline(), micros(7))?.id).toBe('f2b');
    // A ran again at 9.
    expect(currentFrame(production(), timeline(), micros(10))?.id).toBe('f2a');
  });

  it("otherwise is the frame whose planned length covers the moment, from the scene's start", () => {
    const none = timeline({ blocks: [] });
    expect(currentFrame(production(), none, micros(4))?.id).toBe('f2a');
    expect(currentFrame(production(), none, micros(6.5))?.id).toBe('f2b');
    expect(currentFrame(production(), none, micros(9))?.id).toBe('f2c');
    // Past the frames' planned lengths: the last frame.
    expect(currentFrame(production(), none, micros(11.5))?.id).toBe('f2c');
  });

  it('is none for a scene with no frames', () => {
    const p = { ...production(), frames: [] };
    expect(currentFrame(p, timeline(), micros(5))).toBeNull();
  });
});

describe('frameLabel', () => {
  it('names the scene and the frame by number', () => {
    const p = production();
    const seg = segments(p, timeline())[1]!;
    const f = p.frames.find((f) => f.id === 'f2c')!;
    expect(frameLabel(seg, f)).toEqual({ scene: 2, frame: '2.3' });
    expect(frameLabel(seg, null)).toEqual({ scene: 2, frame: null });
  });
});

describe('stillMoment', () => {
  const p = production();
  const f = (id: string) => p.frames.find((x) => x.id === id)!;

  it('is when its linked blocks first ran', () => {
    expect(stillMoment(p, timeline(), f('f2a'))).toBe(micros(4));
    expect(stillMoment(p, timeline(), f('f2b'))).toBe(micros(6));
  });

  it('otherwise is the end of its planned span, inside the scene', () => {
    // C never ran: frames 2.1 and 2.2 plan 5 seconds, 2.3 two more, from 4 s.
    expect(stillMoment(p, timeline(), f('f2c'))).toBe(micros(11));
    expect(stillMoment(p, timeline(), f('f1'))).toBe(micros(3));
    // Scene 1 is 4 s long: a longer plan stops at its last moment.
    const long = { ...p, frames: [frame('f1', S1, 0, 9)] };
    expect(stillMoment(long, timeline(), long.frames[0]!)).toBe(micros(4) - 1);
  });

  it('is none for a scene that never played', () => {
    const t = timeline({ scenes: timeline().scenes.slice(0, 1) });
    expect(stillMoment(p, t, f('f3'))).toBeNull();
  });
});

describe('nudge', () => {
  it('moves by 5 seconds with the arrows, and to the ends with Home and End', () => {
    const t = timeline();
    expect(nudge(micros(10), 'ArrowRight', t)).toBe(micros(15));
    expect(nudge(micros(10), 'ArrowLeft', t)).toBe(micros(5));
    expect(nudge(micros(2), 'ArrowLeft', t)).toBe(0);
    expect(nudge(micros(70), 'ArrowRight', t)).toBe(micros(72));
    expect(nudge(micros(10), 'Home', t)).toBe(0);
    expect(nudge(micros(10), 'End', t)).toBe(micros(72));
    expect(nudge(micros(10), 'a', t)).toBeNull();
  });
});
