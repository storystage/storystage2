import { describe, expect, it } from 'vitest';
import { changeVoice, fitToTime, pitchOf, rescale, stretch } from './voice-change.ts';

const RATE = 24_000;
/** A buzzy voice-like tone: a fundamental and two harmonics. */
const tone = (hz: number, seconds: number) =>
  Float32Array.from({ length: Math.round(RATE * seconds) }, (_, i) => {
    const t = i / RATE;
    return (
      0.5 * Math.sin(2 * Math.PI * hz * t) +
      0.25 * Math.sin(4 * Math.PI * hz * t) +
      0.1 * Math.sin(6 * Math.PI * hz * t)
    );
  });
const middle = (s: Float32Array) =>
  s.subarray(Math.floor(s.length * 0.4), Math.floor(s.length * 0.6));

describe('rescale and stretch', () => {
  it('rescaling raises the pitch and shortens the sound by the same factor', () => {
    const out = rescale(tone(200, 1), 1.25);
    expect(out.length).toBe(Math.floor(RATE / 1.25));
    expect(pitchOf(middle(out), RATE)).toBeCloseTo(250, -1);
  });

  it('stretching changes the length and keeps the pitch', () => {
    const out = stretch(tone(200, 1), 1.5, RATE);
    expect(out.length).toBe(Math.round(RATE * 1.5));
    expect(pitchOf(middle(out), RATE)).toBeCloseTo(200, -1);
  });
});

describe('changeVoice', () => {
  it('leaves an unchanged voice alone', () => {
    const t = tone(200, 0.2);
    expect(changeVoice(t, RATE, { pitch: 1, formant: 1, speed: 1 })).toBe(t);
  });

  it('makes a child: higher, the same length', () => {
    const out = changeVoice(tone(180, 1), RATE, { pitch: 1.25, formant: 1.25, speed: 1 });
    expect(out.length).toBe(RATE);
    expect(pitchOf(middle(out), RATE)).toBeCloseTo(225, -1);
  });

  it('makes a big animal: lower and slower', () => {
    const out = changeVoice(tone(150, 1), RATE, { pitch: 0.8, formant: 0.8, speed: 0.9 });
    expect(out.length).toBe(Math.round(RATE / 0.9));
    expect(pitchOf(middle(out), RATE)).toBeCloseTo(120, -1);
  });
});

describe('fitToTime', () => {
  it('leaves a line that fits as it is', () => {
    const t = tone(200, 1);
    expect(fitToTime(t, RATE, 1.5)).toBe(t);
  });

  it('speeds a slightly long line up to fit, keeping its pitch', () => {
    const out = fitToTime(tone(200, 1.2), RATE, 1);
    expect(out.length).toBe(RATE);
    expect(pitchOf(middle(out), RATE)).toBeCloseTo(200, -1);
  });

  it('speeds a much longer line up by 1.25 at most, then cuts it with a fade', () => {
    const out = fitToTime(tone(200, 2), RATE, 1);
    expect(out.length).toBe(RATE);
    expect(Math.abs(out[RATE - 1]!)).toBeLessThan(0.01); // faded to silence
    const before = out.subarray(RATE - 0.3 * RATE, RATE - 0.25 * RATE);
    expect(Math.max(...before.map(Math.abs))).toBeGreaterThan(0.3); // not faded earlier
  });
});
