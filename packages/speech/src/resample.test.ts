import { describe, expect, it } from 'vitest';
import { WHISPER_RATE, level, resample, toMono } from './resample.ts';
import { cleanTranscript } from './transcript.ts';

const tone = (hz: number, rate: number, seconds: number, amplitude = 0.5) =>
  Float32Array.from(
    { length: Math.round(rate * seconds) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / rate),
  );
const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

describe('toMono (spec 06, section 1.6)', () => {
  it('averages the channels', () => {
    expect([...toMono([Float32Array.of(1, 0, -1), Float32Array.of(0, 0, 1)])]).toEqual([0.5, 0, 0]);
  });

  it('copies one channel, and gives nothing for none', () => {
    const one = Float32Array.of(0.1, 0.2);
    const out = toMono([one]);
    expect(out).toEqual(one);
    expect(out).not.toBe(one);
    expect(toMono([])).toHaveLength(0);
  });
});

describe('resample', () => {
  it('gives 16,000 samples a second, from the usual device rates', () => {
    for (const rate of [44_100, 48_000, 22_050, 8_000])
      expect(resample(tone(220, rate, 1), rate)).toHaveLength(WHISPER_RATE);
  });

  it('keeps speech frequencies at their loudness', () => {
    const out = resample(tone(440, 48_000, 1), 48_000);
    expect(rms(out)).toBeCloseTo(0.5 / Math.SQRT2, 1);
  });

  it('quietens sound above the new limit, instead of folding it back as noise', () => {
    const high = resample(tone(14_000, 48_000, 1), 48_000);
    expect(rms(high)).toBeLessThan(0.2);
  });

  it('passes audio already at 16 kHz through unchanged', () => {
    const input = tone(300, WHISPER_RATE, 0.1);
    expect(resample(input, WHISPER_RATE)).toEqual(input);
  });

  it('refuses a rate of zero', () => {
    expect(() => resample(Float32Array.of(1), 0)).toThrow(RangeError);
  });
});

describe('level', () => {
  it('runs from 0 for silence to 1 for loud sound', () => {
    expect(level(new Float32Array(100))).toBe(0);
    expect(level(tone(200, 16_000, 0.1, 1))).toBe(1);
    const talking = level(tone(200, 16_000, 0.1, 0.1));
    expect(talking).toBeGreaterThan(0.2);
    expect(talking).toBeLessThan(1);
    expect(level(new Float32Array(0))).toBe(0);
  });
});

describe('cleanTranscript (spec 06, section 1.7)', () => {
  it('keeps what was said, with its capitals and punctuation', () => {
    expect(cleanTranscript(' Make the cat walk to the tree, and then wave hello.')).toBe(
      'Make the cat walk to the tree, and then wave hello.',
    );
  });

  it('takes out timestamps and bracketed notes', () => {
    expect(
      cleanTranscript('[00:00:00.000 --> 00:00:04.000]  The owl flies. [BLANK_AUDIO] (music) ♪♪'),
    ).toBe('The owl flies.');
  });

  it('keeps one of a sentence whisper repeats', () => {
    expect(cleanTranscript('Thank you. Thank you. thank you. The end.')).toBe(
      'Thank you. The end.',
    );
  });

  it('gives nothing when nothing was said', () => {
    expect(cleanTranscript('[BLANK_AUDIO]')).toBe('');
    expect(cleanTranscript('  (silence)  ')).toBe('');
  });
});
