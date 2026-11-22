import { describe, expect, it } from 'vitest';
import { numbersAsWords, wav, wordErrorRate } from './audio.ts';
import { BRITISH, LINES, PRESETS } from './lines.ts';
import { changeVoice, pitchOf, resample, stretch } from './voice-fx.ts';

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

describe('resample', () => {
  it('raises the pitch and shortens the sound by the same factor', () => {
    const out = resample(tone(200, 1), 1.25);
    expect(out.length).toBe(Math.floor(RATE / 1.25));
    expect(pitchOf(middle(out), RATE)).toBeCloseTo(250, -1);
  });
});

describe('stretch', () => {
  it('changes the length and keeps the pitch', () => {
    const out = stretch(tone(200, 1), 1.5, RATE);
    expect(out.length).toBe(Math.round(RATE * 1.5));
    expect(pitchOf(middle(out), RATE)).toBeCloseTo(200, -1);
  });

  it('leaves the sound alone at 1', () => {
    const t = tone(200, 0.2);
    expect(stretch(t, 1, RATE)).toEqual(t);
  });
});

describe('changeVoice', () => {
  it('makes a child: higher, same length', () => {
    const out = changeVoice(tone(180, 1), RATE, { shift: 1.25, speed: 1 });
    expect(out.length).toBe(RATE);
    expect(pitchOf(middle(out), RATE)).toBeCloseTo(225, -1);
  });

  it('makes a big animal: lower and slower', () => {
    const out = changeVoice(tone(150, 1), RATE, { shift: 0.8, speed: 0.9 });
    expect(out.length).toBe(Math.round(RATE / 0.9));
    expect(pitchOf(middle(out), RATE)).toBeCloseTo(120, -1);
  });
});

describe('wav', () => {
  it('writes a 16-bit mono header and the samples', () => {
    const b = wav(Float32Array.from([0, 1, -1]), RATE);
    expect(new TextDecoder().decode(b.subarray(0, 4))).toBe('RIFF');
    expect(b.length).toBe(44 + 6);
    expect(new DataView(b.buffer).getUint32(24, true)).toBe(RATE);
    expect(new DataView(b.buffer).getInt16(46, true)).toBe(0x7fff);
  });
});

describe('wordErrorRate', () => {
  it('counts wrong, missing and extra words', () => {
    expect(wordErrorRate('Here is the key.', 'here is the key')).toBe(0);
    expect(wordErrorRate('Here is the key.', 'here is a key')).toBe(0.25);
    expect(wordErrorRate(numbersAsWords('one, two'), numbersAsWords('1, 2'))).toBe(0);
  });
});

describe('the test material', () => {
  it('has ten lines, a British word list in the dictionary format, and the six presets', () => {
    expect(LINES).toHaveLength(10);
    for (const b of BRITISH) expect(b).toMatch(/^[A-Z']+\t\S+$/);
    expect(PRESETS.map((p) => p.id)).toEqual([
      'woman',
      'man',
      'girl',
      'boy',
      'small-animal',
      'big-animal',
    ]);
  });
});
