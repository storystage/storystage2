import { describe, expect, it } from 'vitest';
import { musicPlays, type MusicPlay } from './plays.ts';
import { cue, p0, s1, s2, s3, withCues } from './testing.ts';

// The film's music as it plays (spec 03 2.3), by the rules agreed with S2 and S5 on 27 Nov.

const levelAt = (play: MusicPlay, t: number): number => {
  const g = play.gain;
  if (t <= g[0]![0]) return g[0]![1];
  for (let i = 1; i < g.length; i++) {
    const [t1, v1] = g[i]!;
    const [t0, v0] = g[i - 1]!;
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return g[g.length - 1]![1];
};
const none = () => {
  throw new Error('No earlier scene should be asked for.');
};

describe('musicPlays', () => {
  it('starts a later cue where it was put, and fades the one before out under it', () => {
    const p = withCues(s1, [cue(1), cue(3)]);
    const [a, b] = musicPlays(p, [{ scene: s1, start: 10, length: 12 }], none);
    // Rain's trim starts 2 seconds into its file.
    expect(a).toMatchObject({ scene: s1, index: 0, sound: 'sn1', start: 11, end: 14 });
    expect(a).toMatchObject({ offset: 2, from: 2, to: 5.5, loop: false });
    expect(b).toMatchObject({ index: 1, start: 13, end: 16.5, offset: 2 });
    expect(a!.gain.slice(0, 2)).toEqual([
      [11, 1],
      [13, 1],
    ]);
    expect(a!.gain.at(-1)).toEqual([14, 0]);
    expect(b!.gain[0]).toEqual([13, 0]);
    // Equal power: the two together never dip.
    for (const t of [13.25, 13.5, 13.75])
      expect(levelAt(a!, t) ** 2 + levelAt(b!, t) ** 2).toBeCloseTo(1, 2);
    expect(a!.gain.filter(([t]) => t >= 13 && t <= 14)).toHaveLength(9);
  });

  it('ramps a cue stopped at full loudness down over 10 ms, and a fade in a straight line', () => {
    const p = withCues(s1, [cue(0, { fadeIn: 1, fadeOut: 0.5, volume: 0.5 }), cue(6)]);
    const [faded, cut] = musicPlays(p, [{ scene: s1, start: 0, length: 8 }], none);
    expect(faded!.gain).toEqual([
      [0, 0],
      [1, 0.5],
      [3, 0.5],
      [3.5, 0],
    ]);
    // Its own end at 9.5 is past the scene's.
    expect(cut!.end).toBe(8);
    expect(cut!.gain).toEqual([
      [6, 1],
      [7.99, 1],
      [8, 0],
    ]);
  });

  it('loops its part until the scene ends, and plays no cue that starts after it', () => {
    const p = withCues(s1, [cue(1, { loop: true, from: 1, to: 2 }), cue(20)]);
    const plays = musicPlays(p, [{ scene: s1, start: 0, length: 12 }], none);
    expect(plays).toHaveLength(1);
    expect(plays[0]).toMatchObject({ start: 1, end: 12, offset: 3, from: 3, to: 4, loop: true });
  });

  it('carries a cue on over the cuts until another starts, and crossfades there', () => {
    const p = withCues(s3, [cue(4)], withCues(s1, [cue(2, { loop: true, carriesOn: true })]));
    const film = [
      { scene: s1, start: 0, length: 12 },
      { scene: s2, start: 12, length: 8 },
      { scene: s3, start: 20, length: 10 },
    ];
    const [rain, next] = musicPlays(p, film, none);
    expect(rain).toMatchObject({ scene: s1, index: 0, start: 2, end: 25 });
    expect(next).toMatchObject({ scene: s3, index: 0, start: 24, end: 27.5 });
    expect(levelAt(rain!, 24.5) ** 2 + levelAt(next!, 24.5) ** 2).toBeCloseTo(1, 2);
  });

  it('stops a cue that carries on at the film’s end, without a click', () => {
    const p = withCues(s1, [cue(2, { loop: true, carriesOn: true })]);
    const [rain] = musicPlays(
      p,
      [
        { scene: s1, start: 0, length: 12 },
        { scene: s2, start: 12, length: 8 },
      ],
      none,
    );
    expect(rain!.end).toBe(20);
    expect(rain!.gain.slice(-2)).toEqual([
      [19.99, 1],
      [20, 0],
    ]);
  });

  it('carries a cue into one scene’s Rehearse from where the earlier scenes leave it', () => {
    const p = withCues(s3, [cue(4)], withCues(s1, [cue(2, { loop: true, carriesOn: true })]));
    const lengths = { [s1]: 12, [s2]: 8 } as Record<string, number>;
    const [rain, next] = musicPlays(
      p,
      [{ scene: s3, start: 30, length: Infinity }],
      (s) => lengths[s]!,
    );
    // Rain started 18 seconds before scene 3, so its 3.5-second loop is half a second in.
    expect(rain).toMatchObject({ scene: s1, index: 0, start: 30, end: 35, offset: 2.5 });
    expect(rain!.gain[0]).toEqual([30, 1]);
    // While the scene plays, its own cues stop only by themselves.
    expect(next).toMatchObject({ start: 34, end: 37.5 });
  });

  it('carries in nothing that ended by itself, or never started, before the scene', () => {
    const ended = withCues(s1, [cue(10, { carriesOn: true })]);
    const lengths = { [s1]: 12, [s2]: 8 } as Record<string, number>;
    expect(musicPlays(ended, [{ scene: s3, start: 0, length: 10 }], (s) => lengths[s]!)).toEqual(
      [],
    );
    const unheard = withCues(s1, [cue(2, { loop: true, carriesOn: true })]);
    expect(musicPlays(unheard, [{ scene: s2, start: 0, length: 5 }], () => 1)).toEqual([]);
  });

  it('leaves a scene still playing with no end, and places a sound the film hasn’t got', () => {
    const p = withCues(s1, [cue(0, { sound: 'kenney/gone', loop: true, from: 0.5, to: 1 })]);
    const [gone] = musicPlays(p, [{ scene: s1, start: 0, length: Infinity }], none);
    expect(gone).toMatchObject({ sound: 'kenney/gone', end: Infinity, from: 0.5, to: 1 });
    expect(gone!.gain).toEqual([[0, 1]]);
    expect(musicPlays(p0, [], none)).toEqual([]);
  });
});
