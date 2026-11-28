import type { Production } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import { FakeAudioContext, type FakeGain, type FakeSource } from './fake-audio.ts';
import { LiveSounds, levelAt, soundsNamed, type LiveSoundsOptions } from './live.ts';
import { createSoundOut } from './out.ts';
import { cue, p0, s1, s2, withCues } from './testing.ts';

// Rehearse's player (decision 0076, workplan 11.7): music by `musicPlays`, on the film's clock.

const MIX = { speech: 1, music: 0.5, effects: 0.8 };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A player over a fake context, with Rain's bytes (and none for any other sound). */
async function rig(p: Production, more: Partial<LiveSoundsOptions> = {}) {
  const ctx = new FakeAudioContext();
  const out = createSoundOut(MIX, ctx);
  const sounds = new LiveSounds({
    out,
    production: p,
    lengthOf: () => 10,
    bytes: (s) => (s === 'sn1' ? new Uint8Array(40) : null),
    ...more,
  });
  await sounds.prepare([s1, s2]);
  /** The level a source is heard at, at context time `t`. */
  const level = (source: FakeSource, t: number) =>
    ctx.gains.find((g) => g === source.destination)!.gain.at(t);
  const track = (source: FakeSource) => (source.destination as FakeGain).destination;
  return { ctx, out, sounds, level, track };
}

describe('LiveSounds', () => {
  it('plays a scene’s music on the music track, from its clip’s trim, as `musicPlays` says', async () => {
    const { ctx, out, sounds, level, track } = await rig(withCues(s1, [cue(1)]));
    sounds.scene(s1, 0);
    sounds.play(0, 1);
    const [rain] = ctx.sources;
    expect(track(rain!)).toBe(out.track('music'));
    // Rain's trim starts 2 seconds into its file, and it plays 3.5 seconds.
    expect(rain!.started).toEqual({ when: 1, offset: 2 });
    expect(rain!.stopsAt).toBe(4.5);
    expect(level(rain!, 2)).toBe(1);
    expect(level(rain!, 4.5)).toBe(0);
  });

  it('stops a cue at its scene’s end once that’s known, without a click', async () => {
    const { ctx, sounds, level } = await rig(withCues(s1, [cue(0, { loop: true })]));
    sounds.scene(s1, 0);
    sounds.play(0, 1);
    const [rain] = ctx.sources;
    expect(rain!.stopsAt).toBe(Infinity);
    expect(rain!.loop).toBe(true);
    expect([rain!.loopStart, rain!.loopEnd]).toEqual([2, 5.5]);
    ctx.currentTime = 1;
    sounds.scene(s2, 3);
    expect(ctx.sources).toHaveLength(1);
    expect(rain!.stopsAt).toBe(3);
    expect(level(rain!, 2.98)).toBeCloseTo(1, 5);
    expect(level(rain!, 3)).toBe(0);
  });

  it('keeps a cue that carries on playing over the cut, until the next cue takes over', async () => {
    const p = withCues(s2, [cue(2)], withCues(s1, [cue(0, { loop: true, carriesOn: true })]));
    const { ctx, sounds, level } = await rig(p);
    sounds.scene(s1, 0);
    sounds.play(0, 1);
    ctx.currentTime = 4;
    sounds.scene(s2, 5);
    const [rain, next] = ctx.sources;
    expect(ctx.sources).toHaveLength(2);
    expect(rain!.started!.when).toBe(0);
    expect(next!.started).toEqual({ when: 7, offset: 2 });
    // They crossfade over the second after the next cue's start, on equal-power curves.
    expect(rain!.stopsAt).toBe(8);
    expect(level(rain!, 7.5) ** 2 + level(next!, 7.5) ** 2).toBeCloseTo(1, 1);
  });

  it('keeps pace with the picture at another speed, so a cue plays faster or slower', async () => {
    const { ctx, sounds } = await rig(withCues(s1, [cue(2)]));
    sounds.scene(s1, 0);
    sounds.play(0, 2);
    const [rain] = ctx.sources;
    expect(rain!.playbackRate.value).toBe(2);
    expect(rain!.started!.when).toBe(1);
    expect(rain!.stopsAt).toBe(2.75);
    // Back to normal speed at film time 3, a second into the cue: the same voice, slower.
    ctx.currentTime = 1.5;
    sounds.play(3, 1);
    expect(ctx.sources).toHaveLength(1);
    expect(rain!.playbackRate.at(1.6)).toBe(1);
    expect(rain!.stopsAt).toBe(4);
  });

  it('goes quiet on pause, and plays the music on from there, but not a sound', async () => {
    const { ctx, sounds, level } = await rig(withCues(s1, [cue(0, { loop: true })]));
    sounds.scene(s1, 0);
    sounds.play(0, 1);
    sounds.commands(s1, [
      { kind: 'sound', seq: 4, start: 1_000_000, duration: 5_000_000, sound: 'sn1' },
    ]);
    ctx.currentTime = 2;
    sounds.pause();
    const [rain, fx] = ctx.sources;
    expect(level(rain!, 2.01)).toBe(0);
    expect([rain!.stopsAt, fx!.stopsAt]).toEqual([2.01, 2.01]);
    ctx.currentTime = 10;
    sounds.play(2, 1);
    expect(ctx.sources).toHaveLength(3);
    // Two seconds into the loop, from the trim's start.
    expect(ctx.sources[2]!.started).toEqual({ when: 10, offset: 4 });
  });

  it('plays a `sound` command on the Sound FX track, from its block’s start for its part', async () => {
    const { ctx, out, sounds, level, track } = await rig(p0);
    sounds.scene(s1, 0);
    sounds.play(0, 1);
    sounds.commands(s1, [
      { kind: 'say', start: 0, duration: 1_000_000 },
      { kind: 'sound', seq: 2, start: 1_500_000, duration: 2_000_000, sound: 'sn1' },
      { kind: 'sound', seq: 3, start: 0, duration: 0, sound: 'kenney/gone', missing: true },
    ]);
    // Rain isn't in this film's music or named in words, so it's read as it's asked for.
    await flush();
    const [fx] = ctx.sources;
    expect(ctx.sources).toHaveLength(1);
    expect(track(fx!)).toBe(out.track('effects'));
    expect(fx!.started).toEqual({ when: 1.5, offset: 2 });
    expect(fx!.stopsAt).toBe(3.5);
    expect(level(fx!, 3.5)).toBe(0);
  });

  it('plays no sound heard while paused, as Rehearse to here runs ahead', async () => {
    const { ctx, sounds } = await rig(withCues(s1, [cue(20)]));
    sounds.scene(s1, 0);
    sounds.commands(s1, [{ kind: 'sound', seq: 1, start: 0, duration: 3_000_000, sound: 'sn1' }]);
    sounds.play(1, 1);
    expect(ctx.sources.map((s) => s.started!.when)).toEqual([19]);
  });

  it('plays a sound it hasn’t got, or can’t read, as silence', async () => {
    const p = withCues(s1, [cue(0, { sound: 'kenney/gone' }), cue(4)]);
    const { ctx, sounds } = await rig(p, {
      bytes: (s) => (s === 'sn1' ? new Uint8Array(0) : null),
    });
    sounds.scene(s1, 0);
    sounds.play(0, 1);
    await flush();
    expect(ctx.sources).toEqual([]);
  });

  it('starts a sound read late part-way in, in time with the picture', async () => {
    let give: (bytes: Uint8Array) => void = () => undefined;
    const { ctx, sounds } = await rig(p0, {
      bytes: (s) => (s === 'sn1' ? new Promise<Uint8Array>((resolve) => (give = resolve)) : null),
    });
    sounds.scene(s1, 0);
    sounds.play(0, 1);
    sounds.commands(s1, [{ kind: 'sound', seq: 1, start: 0, duration: 3_000_000, sound: 'sn1' }]);
    ctx.currentTime = 0.5;
    give(new Uint8Array(40));
    await flush();
    expect(ctx.sources[0]!.started).toEqual({ when: 0.5, offset: 2.5 });
  });

  it('fades live music out by the scene’s last whole run, as the timeline does', async () => {
    const p = withCues(s1, [cue(0, { loop: true, fadeOut: 2 })]);
    const { ctx, sounds, level } = await rig(p, { runLength: () => 8 });
    sounds.scene(s1, 0);
    sounds.play(0, 1);
    expect(level(ctx.sources[0]!, 7)).toBeCloseTo(0.5, 5);
  });

  it('forgets the run’s scenes at its end', async () => {
    const { ctx, sounds } = await rig(withCues(s1, [cue(0, { loop: true })]));
    sounds.scene(s1, 0);
    sounds.play(0, 1);
    sounds.end();
    sounds.play(0, 1);
    expect(ctx.sources).toHaveLength(1);
  });
});

describe('levelAt', () => {
  it('ramps in straight lines, holds at the ends, takes the later of two at one time, and is full with none', () => {
    const points = [
      [1, 0],
      [3, 1],
      [3, 0.5],
    ] as const;
    expect([0, 1, 2, 3, 9].map((t) => levelAt(points, t))).toEqual([0, 0, 0.5, 0.5, 0.5]);
    expect(levelAt([], 4)).toBe(1);
  });
});

describe('soundsNamed', () => {
  it('finds each sound a `playAudio` block names in words', () => {
    const call = (value: unknown) => ({
      kind: 'call',
      callee: { kind: 'story', name: 'playAudio' },
      args: { audioSource: value },
    });
    const program = {
      types: [
        { methods: [{ body: [call({ kind: 'text', value: 'sn1' }), call({ kind: 'var' })] }] },
      ],
    };
    expect(soundsNamed({ ...p0, program } as unknown as Production)).toEqual(['sn1']);
  });
});

describe('createSoundOut', () => {
  it('gives each track its volume, changed over 10 ms, and the speak lines their own', async () => {
    const ctx = new FakeAudioContext();
    const out = createSoundOut(MIX, ctx);
    const speech = out.track('speech') as unknown as FakeGain;
    expect(speech.destination).toBe(ctx.destination);
    expect((out.track('music') as unknown as FakeGain).gain.value).toBe(0.5);
    ctx.currentTime = 3;
    out.setMix({ ...MIX, music: 0.25 });
    expect((out.track('music') as unknown as FakeGain).gain.at(3.01)).toBe(0.25);
    expect(out.speechContext().destination).toBe(speech);
    expect(await out.decode(new Uint8Array(0))).toBeNull();
    ctx.state = 'suspended';
    out.wake();
    expect(ctx.state).toBe('running');
  });
});
