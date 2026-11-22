import { sceneId } from '@storystage/production';
import { lineDuration, micros } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { SpokenLine } from './captions.ts';
import { FADE, TRACK_RATE, soundtrack, voicedLines, type FilmVoices } from './soundtrack.ts';

const S1 = sceneId('s1');
const line = (start: number, seconds: number, over: Partial<SpokenLine> = {}): SpokenLine => ({
  scene: S1,
  object: 'owl',
  text: `Line at ${start}`,
  kind: 'caption',
  start: micros(start),
  duration: micros(seconds),
  ...over,
});

/** Voices at the track's own rate, each line a steady 0.5 for `seconds` (or as asked). */
function voices(lengths: Record<string, number | undefined> = {}, rate = TRACK_RATE) {
  const asked: unknown[] = [];
  const v: FilmVoices = {
    sampleRate: rate,
    prepare: async () => undefined,
    sound: (l) => {
      asked.push(l);
      const seconds = l.text in lengths ? lengths[l.text] : l.seconds;
      return seconds === undefined
        ? undefined
        : new Float32Array(Math.round(seconds * rate)).fill(0.5);
    },
  };
  return { voices: v, asked };
}

const at = (seconds: number) => Math.round(seconds * TRACK_RATE);

describe('soundtrack', () => {
  it('puts each speak line at its caption’s start, after the title card, and is the film’s length', () => {
    const { voices: v } = voices();
    const track = soundtrack([line(1, 2)], v, { offset: micros(4), total: micros(10) });
    expect(track.samples.length).toBe(at(10));
    expect(track.samples[at(5) - 1]).toBe(0);
    expect(track.samples[at(5) + 10]).toBeCloseTo(0.5);
    expect(track.samples[at(7) + 10]).toBe(0);
    expect(track).toMatchObject({ voiced: 1, silent: 0 });
  });

  it('cuts a line where the next starts, fading out so it doesn’t click', () => {
    const { voices: v } = voices({ 'Line at 0': 3 });
    const track = soundtrack([line(0, 3), line(1, 1)], v, { offset: 0, total: micros(5) });
    // The first line's last samples before the second fade towards nothing.
    expect(track.samples[at(1) - FADE - 10]).toBeCloseTo(0.5);
    expect(Math.abs(track.samples[at(1) - 1]!)).toBeLessThan(0.01);
    // Then the second line plays, and stops at its own end.
    expect(track.samples[at(1) + 10]).toBeCloseTo(0.5);
    expect(track.samples[at(2) + 10]).toBe(0);
  });

  it('cuts a line where its scene ends, as the measuring run gives it', () => {
    const { voices: v } = voices({ 'Line at 0': 3 });
    // The block takes 3 seconds, but the scene ends after 1.
    const track = soundtrack([line(0, 1, { length: micros(3) })], v, {
      offset: 0,
      total: micros(4),
    });
    expect(Math.abs(track.samples[at(1) - 1]!)).toBeLessThan(0.01);
    expect(track.samples[at(1) + 10]).toBe(0);
  });

  it('asks for each line by its scene, speaker, words, script line and the block’s own time', () => {
    const { voices: v, asked } = voices();
    soundtrack([line(0, 1, { length: micros(2.5), line: 'l1' })], v, {
      offset: 0,
      total: micros(4),
    });
    expect(asked).toEqual([
      { scene: S1, object: 'owl', text: 'Line at 0', line: 'l1', seconds: 2.5 },
    ]);
  });

  it('voices only speak lines, and counts those with no sound as silent', () => {
    const { voices: v } = voices({ 'Line at 2': undefined });
    const track = soundtrack(
      [line(0, 1), line(1, 1, { kind: 'say' }), line(2, 1), line(3, 1, { kind: 'think' })],
      v,
      { offset: 0, total: micros(5) },
    );
    expect(track).toMatchObject({ voiced: 1, silent: 1 });
    expect(track.samples[at(1) + 10]).toBe(0);
  });

  it('resamples the cache’s 24 kHz to the track’s 48 kHz', () => {
    const { voices: v } = voices({}, 24_000);
    const track = soundtrack([line(0, 1)], v, { offset: 0, total: micros(2) });
    expect(TRACK_RATE).toBe(48_000);
    expect(track.samples[at(0.5)]).toBeCloseTo(0.5);
    expect(track.samples[at(1) + 10]).toBe(0);
  });

  it('asks with the same seconds the line cache is keyed by, so it finds the sound (S5)', () => {
    // The cache keys a line by `lineSeconds(text, duration)`: `lineDuration(text)` without a
    // duration detail. The stage command carries `micros` of it, which comes back exactly.
    const text = (words: number) => Array.from({ length: words }, () => 'word').join(' ');
    for (let words = 0; words <= 200; words++) {
      const seconds = lineDuration(text(words));
      const [asked] = voicedLines([line(0, 0, { duration: micros(seconds) })]);
      expect(asked!.seconds).toBe(seconds);
    }
    for (const detail of [0.5, 1, 1.25, 2.7, 3.333, 10.1])
      expect(voicedLines([line(0, 0, { duration: micros(detail) })])[0]!.seconds).toBe(detail);
  });

  it('keeps the track within ±1', () => {
    const v: FilmVoices = {
      sampleRate: TRACK_RATE,
      prepare: async () => undefined,
      sound: () => new Float32Array(TRACK_RATE).fill(1.5),
    };
    const track = soundtrack([line(0, 1)], v, { offset: 0, total: micros(2) });
    expect(Math.max(...track.samples.subarray(0, at(1)))).toBe(1);
  });

  it('lists the lines the film speaks, for the studio to prepare', () => {
    expect(
      voicedLines([line(0, 1, { length: micros(2) }), line(1, 1, { kind: 'say' }), line(2, 1)]),
    ).toEqual([
      { scene: S1, object: 'owl', text: 'Line at 0', seconds: 2 },
      { scene: S1, object: 'owl', text: 'Line at 2', seconds: 1 },
    ]);
  });
});
