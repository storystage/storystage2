import { exampleProduction, withSound, type SoundClip } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import { filmSoundFiles, type DecodeSound } from './sound-files.ts';

// The film's sound files for the export (spec 08 section 4; decision 0076): each imported clip's
// bytes, decoded once, to one channel.

const clip = (id: string): SoundClip => ({
  id,
  file: `${id}.wav`,
  label: id,
  length: 2,
  bytes: 10,
  trim: { start: 0, end: 2 },
});
const p = withSound(withSound(exampleProduction(), clip('sn1')), clip('sn2'));
const bytesOf = new Map([
  ['sn1', new Uint8Array([1])],
  ['sn2', new Uint8Array([2])],
]);
const source = { bytes: (c: SoundClip) => bytesOf.get(c.id) ?? null };

/** Decodes a file as two channels at 44.1 kHz: left 0.2, right 0.6; or fails for byte 2. */
function decoder() {
  const decoded: number[] = [];
  const decode: DecodeSound = async (bytes) => {
    decoded.push(bytes[0]!);
    if (bytes[0] === 2) return null;
    return {
      channels: [new Float32Array(4).fill(0.2), new Float32Array(4).fill(0.6)],
      sampleRate: 44_100,
    };
  };
  return { decode, decoded };
}

describe('filmSoundFiles', () => {
  it('decodes each clip the film plays once, to one channel at its own rate', async () => {
    const { decode, decoded } = decoder();
    const files = filmSoundFiles(p, source, decode);
    await files.prepare(['sn1', 'sn1']);
    await files.prepare(['sn1']);
    expect(decoded).toEqual([1]);
    const sound = files.sound('sn1')!;
    expect(sound.sampleRate).toBe(44_100);
    expect([...sound.samples].map((v) => Math.round(v * 10) / 10)).toEqual([0.4, 0.4, 0.4, 0.4]);
  });

  it('has nothing for a file it couldn’t decode, one it hasn’t got, or a shelf sound', async () => {
    const { decode } = decoder();
    const files = filmSoundFiles(p, { bytes: () => null }, decode);
    await files.prepare(['sn1', 'kenney/Effect/door-creak', 'sn9']);
    expect(files.sound('sn1')).toBeUndefined();
    const failing = filmSoundFiles(p, source, decode);
    await failing.prepare(['sn2', 'kenney/Effect/door-creak']);
    expect(failing.sound('sn2')).toBeUndefined();
    expect(failing.sound('kenney/Effect/door-creak')).toBeUndefined();
  });

  it('treats a decoder that throws as one that couldn’t decode', async () => {
    const files = filmSoundFiles(p, source, () => Promise.reject(new Error('no codec')));
    await files.prepare(['sn1']);
    expect(files.sound('sn1')).toBeUndefined();
  });

  it('stops preparing when the export is stopped', async () => {
    const { decode, decoded } = decoder();
    const stop = new AbortController();
    stop.abort();
    await filmSoundFiles(p, source, decode).prepare(['sn1'], stop.signal);
    expect(decoded).toEqual([]);
  });
});
