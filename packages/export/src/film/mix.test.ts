import {
  exampleProduction,
  withMix,
  withSceneMusic,
  withSound,
  type MusicCue,
  type SceneId,
  type SoundClip,
} from '@storystage/production';
import { micros } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { SpokenLine } from './captions.ts';
import { mixFilm, soundsToPrepare, type FilmSounds } from './mix.ts';
import { FADE, TRACK_RATE, type FilmVoices } from './soundtrack.ts';

// The film's three tracks (spec 08 section 4; decision 0076): speak lines, Sound FX and music, at
// the film's volumes, with music lowered under speech (the owner's numbers, 27 Nov 2026).

/** Knock: 10 seconds, of which 2 to 5.5 play. */
const KNOCK: SoundClip = {
  id: 'sn1',
  file: 'sn1.wav',
  label: 'Knock',
  length: 10,
  bytes: 1000,
  trim: { start: 2, end: 5.5 },
};
const p0 = withSound(exampleProduction(), KNOCK);
const [s1, s2] = p0.manifest.runningOrder.map((r) => r.scene) as [SceneId, SceneId];
/** Every volume 1, so a test sees the sound itself. */
const full = withMix(p0, { speech: 1, music: 1, effects: 1 });

/**
 * A decoded file whose samples say where in the file they are: a hundredth of their time, so 0.03
 * at 3 seconds in. `rate` lets a test check the resampling.
 */
const timed = (seconds: number, rate: number) =>
  Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => i / rate / 100);
function files(rate = TRACK_RATE, have: readonly string[] = ['sn1']) {
  const prepared: string[][] = [];
  const f: FilmSounds = {
    prepare: async (sounds) => {
      prepared.push([...sounds]);
    },
    sound: (sound) =>
      have.includes(sound) ? { samples: timed(10, rate), sampleRate: rate } : undefined,
  };
  return { files: f, prepared };
}
/** Voices that say every line as a steady 0.5. */
const voices: FilmVoices = {
  sampleRate: TRACK_RATE,
  prepare: async () => undefined,
  sound: (l) => new Float32Array(Math.round(l.seconds * TRACK_RATE)).fill(0.5),
};
const line = (start: number, seconds: number): SpokenLine => ({
  scene: s1,
  object: 'owl',
  text: `Line at ${start}`,
  kind: 'caption',
  start: micros(start),
  duration: micros(seconds),
});
const knock = (start: number, seconds: number, scene = s1) => ({
  scene,
  sound: 'sn1',
  start: micros(start),
  duration: micros(seconds),
});
const scenes = [
  { scene: s1, start: 0, length: micros(10) },
  { scene: s2, start: micros(10), length: micros(10) },
];
const cue = (more: Partial<MusicCue> = {}): MusicCue => ({
  sound: 'sn1',
  start: 0,
  from: 0,
  to: 3.5,
  fadeIn: 0,
  fadeOut: 0,
  loop: true,
  volume: 1,
  carriesOn: false,
  ...more,
});
const at = (seconds: number) => Math.round(seconds * TRACK_RATE);
const base = { lines: [], sounds: [], scenes, offset: 0, total: micros(20) };

describe('mixFilm', () => {
  it('plays a Sound FX clip from its trim at its start, after the title card, at any rate', () => {
    const mix = mixFilm({
      ...base,
      production: full,
      sounds: [knock(1, 3.5)],
      files: files(24_000).files,
      offset: micros(4),
    });
    expect(mix.samples.length).toBe(at(20));
    expect(mix.samples[at(5) - 10]).toBe(0);
    // A second in, it's at 3 seconds into its file: the trim starts at 2.
    expect(mix.samples[at(6)]).toBeCloseTo(0.03, 3);
    expect(mix.samples[at(8.4)]).toBeCloseTo(0.054, 3);
    expect(mix.samples[at(8.5) + 10]).toBe(0);
    expect(mix).toMatchObject({ heard: true, unplayed: 0 });
  });

  it('fades a sound its scene cut short, so it doesn’t click', () => {
    const mix = mixFilm({ ...base, production: full, sounds: [knock(9, 1)], files: files().files });
    expect(mix.samples[at(10) - FADE - 10]).toBeCloseTo(0.03, 3);
    expect(Math.abs(mix.samples[at(10) - 1]!)).toBeLessThan(0.001);
    expect(mix.samples[at(10) + 10]).toBe(0);
  });

  it('plays the music as musicPlays places it, looping its part to the scene’s end', () => {
    const p = withSceneMusic(full, s1, [cue()]);
    const mix = mixFilm({ ...base, production: p, files: files().files });
    // At 4 s it has looped once: 0.5 s into its part, so 2.5 s into the file.
    expect(mix.samples[at(4)]).toBeCloseTo(0.025, 3);
    // It stops at its scene's end, ramping down over 10 ms.
    expect(Math.abs(mix.samples[at(10) - 1]!)).toBeLessThan(0.001);
    expect(mix.samples[at(10) + 10]).toBe(0);
  });

  it('lowers the music to 0.4 under a voiced line, and brings it back after', () => {
    // A file of a steady 0.25, so the level shows plainly.
    const steady: FilmSounds = {
      prepare: async () => undefined,
      sound: () => ({
        samples: new Float32Array(10 * TRACK_RATE).fill(0.25),
        sampleRate: TRACK_RATE,
      }),
    };
    const p = withSceneMusic(full, s1, [cue()]);
    const mix = mixFilm({ ...base, production: p, files: steady, voices, lines: [line(4, 2)] });
    expect(mix.samples[at(2)]).toBeCloseTo(0.25, 3);
    // Under the line, speech 0.5 and music 0.25 × 0.4.
    expect(mix.samples[at(5)]).toBeCloseTo(0.5 + 0.1, 3);
    // Half way down the 0.3 s ramp before it, and half way up the 0.6 s ramp after.
    expect(mix.samples[at(3.85)]).toBeCloseTo(0.25 * 0.7, 2);
    expect(mix.samples[at(6.3)]).toBeCloseTo(0.25 * 0.7, 2);
    expect(mix.samples[at(7)]).toBeCloseTo(0.25, 3);
    expect(mix).toMatchObject({ voiced: 1, silent: 0 });
  });

  it('plays each track at the film’s volume', () => {
    const steady: FilmSounds = {
      prepare: async () => undefined,
      sound: () => ({
        samples: new Float32Array(10 * TRACK_RATE).fill(0.25),
        sampleRate: TRACK_RATE,
      }),
    };
    const p = withMix(withSceneMusic(p0, s2, [cue()]), { speech: 0.5, music: 0.6, effects: 0.8 });
    const mix = mixFilm({
      ...base,
      production: p,
      files: steady,
      voices,
      lines: [line(1, 1)],
      sounds: [knock(3, 1)],
    });
    expect(mix.samples[at(1.5)]).toBeCloseTo(0.25, 3);
    expect(mix.samples[at(3.5)]).toBeCloseTo(0.2, 3);
    expect(mix.samples[at(15)]).toBeCloseTo(0.15, 3);
  });

  it('keeps it within ±1 where tracks pile up', () => {
    const loud: FilmSounds = {
      prepare: async () => undefined,
      sound: () => ({
        samples: new Float32Array(10 * TRACK_RATE).fill(0.9),
        sampleRate: TRACK_RATE,
      }),
    };
    const mix = mixFilm({
      ...base,
      production: full,
      files: loud,
      sounds: [knock(1, 2), knock(1, 2)],
      voices,
      lines: [line(1, 2)],
    });
    expect(mix.samples[at(2)]).toBe(1);
  });

  it('counts a sound it couldn’t decode, and plays it as silence', () => {
    const mix = mixFilm({
      ...base,
      production: withSceneMusic(full, s1, [cue({ sound: 'kenney/music/theme' })]),
      sounds: [knock(1, 1)],
      files: files(TRACK_RATE, []).files,
    });
    expect(mix).toMatchObject({ heard: false, unplayed: 2 });
    expect(mix.samples.every((v) => v === 0)).toBe(true);
  });

  it('is silent, with nothing heard, without the studio’s files and voices', () => {
    const mix = mixFilm({
      ...base,
      production: withSceneMusic(full, s1, [cue()]),
      sounds: [knock(1, 1)],
      lines: [line(1, 1)],
    });
    expect(mix).toMatchObject({ heard: false, voiced: 0, silent: 1 });
  });
});

describe('soundsToPrepare', () => {
  it('names each sound the film plays once: its Sound FX and the played scenes’ music', () => {
    const p = withSceneMusic(withSceneMusic(full, s1, [cue()]), s2, [
      cue({ sound: 'kenney/music/theme' }),
    ]);
    expect(soundsToPrepare(p, [knock(1, 1), knock(2, 1)], scenes)).toEqual([
      'sn1',
      'kenney/music/theme',
    ]);
    expect(soundsToPrepare(p, [], [scenes[0]!])).toEqual(['sn1']);
  });
});
