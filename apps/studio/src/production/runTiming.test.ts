import { nodeId } from '@storystage/ast';
import type { PlaybackEvent } from '@storystage/playback';
import { exampleProduction, type SceneId } from '@storystage/production';
import { micros, type StageCommand } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { NO_TIMINGS, TimingRecorder, timingOf, withTiming, type RunTiming } from './runTiming.ts';

const s1 = 's1' as SceneId;
const speak = nodeId('speak1');
const knock = nodeId('play1');
const bell = nodeId('play2');
const walk = nodeId('walk1');

let seq = 0;
const cmd = (start: number, duration: number, rest: object): StageCommand =>
  ({
    seq: seq++,
    start: micros(start),
    duration: micros(duration),
    style: 'beginAndEndGently',
    ...rest,
  }) as StageCommand;

const ran = (...blocks: [ReturnType<typeof nodeId>, number][]): PlaybackEvent => ({
  kind: 'ran',
  scene: s1,
  blocks: blocks.map(([node, at]) => ({ node, at: micros(at) })),
});
const commands = (...list: StageCommand[]): PlaybackEvent => ({
  kind: 'commands',
  scene: s1,
  commands: list,
});

const recorder = () =>
  new TimingRecorder(s1, [{ node: speak, scene: s1, object: 'cat', text: 'Hello there' }]);

describe('withTiming and timingOf', () => {
  const p = exampleProduction();
  const scene = p.manifest.runningOrder[0]!.scene;
  const whole: RunTiming = { whole: true, length: 4, sounds: [] };

  it('keeps a whole run only, and says when the code or set-up has changed since', () => {
    expect(withTiming(NO_TIMINGS, p, scene, { ...whole, whole: false })).toBe(NO_TIMINGS);
    expect(withTiming(NO_TIMINGS, p, scene, null)).toBe(NO_TIMINGS);
    const kept = withTiming(NO_TIMINGS, p, scene, whole);
    expect(withTiming(kept, p, scene, whole)).toBe(kept);
    expect(timingOf(kept, p, scene)).toEqual({ timing: whole, changed: false });
    expect(timingOf(kept, p, p.manifest.runningOrder[1]!.scene)).toBeNull();
    const coded = { ...p, program: { ...p.program } };
    expect(timingOf(kept, coded, scene)?.changed).toBe(true);
    const moved = {
      ...p,
      scenes: p.scenes.map((s) => (s.id === scene ? { ...s, setup: { ...s.setup } } : s)),
    };
    expect(timingOf(kept, moved, scene)?.changed).toBe(true);
    // Music placed in the scene isn't a change to its timing.
    const scored = {
      ...p,
      scenes: p.scenes.map((s) => (s.id === scene ? { ...s, music: [] } : s)),
    };
    expect(timingOf(kept, scored, scene)?.changed).toBe(false);
  });
});

describe('TimingRecorder', () => {
  it('times each speak line and sound by its block, and the scene to its last command', () => {
    const r = recorder();
    r.hear({ kind: 'scene', scene: s1, transition: null, at: micros(0) });
    r.hear(ran([walk, 0], [speak, 0.5]));
    r.hear(
      commands(
        cmd(0, 3, { object: 'cat', kind: 'move', to: { x: 1, y: 0, z: 0 } }),
        cmd(0.5, 1.2, { object: 'cat', kind: 'say', text: 'Hello there', bubble: 'caption' }),
      ),
    );
    // Two sounds at once, in a do together: each names its own block.
    r.hear(ran([knock, 2], [bell, 2]));
    r.hear(
      commands(
        cmd(2, 0.75, { object: 'dog', kind: 'sound', sound: 'kenney/knock', node: knock }),
        cmd(2, 0, { object: 'cat', kind: 'sound', sound: 'sn9', missing: true, node: bell }),
      ),
    );
    expect(r.timing).toEqual({
      whole: false,
      length: 3,
      sounds: [
        { node: speak, kind: 'speech', start: 0.5, length: 1.2, text: 'Hello there' },
        { node: knock, kind: 'sound', start: 2, length: 0.75, ref: 'kenney/knock' },
        { node: bell, kind: 'sound', start: 2, length: 0, ref: 'sn9', missing: true },
      ],
    });
  });

  it('is whole when the scene ends or goes on to the next, not when stopped or at an error', () => {
    const ended = recorder();
    expect(ended.hear({ kind: 'finished', scene: s1, at: micros(4) })).toBe(true);
    expect(ended.timing.length).toBe(4);
    ended.hear({ kind: 'ended', stopped: false });
    expect(ended.timing.whole).toBe(true);

    const next = recorder();
    next.hear({ kind: 'next', heading: 'Scene 2' } as PlaybackEvent);
    expect(next.timing.whole).toBe(true);

    const stopped = recorder();
    expect(stopped.hear({ kind: 'ended', stopped: true })).toBe(false);
    expect(stopped.timing.whole).toBe(false);

    const failed = recorder();
    failed.hear({ kind: 'fault', message: 'Too many scenes' } as PlaybackEvent);
    failed.hear({ kind: 'ended', stopped: false });
    expect(failed.timing.whole).toBe(false);
  });

  it('leaves out a caption with no speak line, and another scene’s events', () => {
    const r = recorder();
    r.hear(commands(cmd(1, 1, { object: 'cat', kind: 'say', text: 'Hi', bubble: 'caption' })));
    r.hear({
      kind: 'commands',
      scene: 's2' as SceneId,
      commands: [cmd(0, 9, { object: 'cat', kind: 'sound', sound: 'sn1', node: knock })],
    });
    expect(r.timing.sounds).toEqual([]);
    expect(r.timing.length).toBe(2);
  });
});
