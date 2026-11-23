import { describe, expect, it } from 'vitest';
import { peaksOf, readSound } from './readSound.ts';

describe('peaksOf', () => {
  it('gives each part of the sound its loudest sample, whichever way it swings', () => {
    const samples = new Float32Array([0, 0.5, -0.25, 0, -1, 0.125, 0.25, 0.375]);
    expect([...peaksOf(samples, 4)]).toEqual([0.5, 0.25, 1, 0.375]);
  });
  it('draws a sound shorter than the waveform with what it has', () => {
    expect([...peaksOf(new Float32Array([0.5, -0.5]), 4)]).toEqual([0.5, 0.5, 0, 0]);
    expect([...peaksOf(new Float32Array([]), 2)]).toEqual([0, 0]);
  });
});

describe('readSound', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  it('refuses a long sound from its length before decoding it', async () => {
    let decoded = false;
    const read = readSound({
      lengthOf: async () => 700,
      decode: async () => {
        decoded = true;
        return { duration: 700, samples: new Float32Array(1) };
      },
    });
    expect(await read.measure(bytes, 'mp3')).toBe(700);
    expect(decoded).toBe(false);
    expect(read.peaks(10)).toBeNull();
  });
  it('decodes one within the limit, for its length and its waveform', async () => {
    const read = readSound({
      lengthOf: async () => 3.9,
      decode: async () => ({ duration: 4, samples: new Float32Array([0.5, -1]) }),
    });
    expect(await read.measure(bytes, 'wav')).toBe(4);
    expect([...(read.peaks(2) ?? [])]).toEqual([0.5, 1]);
  });
  it("decodes when the device can't say the length first", async () => {
    const read = readSound({
      lengthOf: async () => Number.NaN,
      decode: async () => ({ duration: 2, samples: new Float32Array([0.2]) }),
    });
    expect(await read.measure(bytes, 'm4a')).toBe(2);
  });
  it("throws when the device can't decode it, as importSound expects", async () => {
    const read = readSound({
      lengthOf: async () => 3,
      decode: async () => {
        throw new Error('EncodingError');
      },
    });
    await expect(read.measure(bytes, 'mp3')).rejects.toThrow();
  });
});
