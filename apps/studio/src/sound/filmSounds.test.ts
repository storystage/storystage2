import {
  exampleProduction,
  withSound,
  type Production,
  type SoundClip,
} from '@storystage/production';
import { describe, expect, it } from 'vitest';
import { FilmSounds, freeLabel, packingSounds } from './filmSounds.ts';

const clip = (id: string, label = 'Rain', type = 'mp3'): SoundClip => ({
  id,
  file: `${id}.${type}`,
  label,
  length: 4,
  bytes: 3,
  trim: { start: 0, end: 4 },
  licence: 'not-sure' as const,
  credit: 'A sound, source not checked',
});

describe('FilmSounds', () => {
  it("keeps an undone sound's id taken, so a new one never gets its file", () => {
    const p = exampleProduction();
    const sounds = new FilmSounds();
    sounds.reset(undefined, p);
    const first = clip('sn1');
    sounds.add(first, new Uint8Array([1, 1, 1]));
    // The import was undone: the production has no sn1, but its bytes are still kept for Redo.
    const next = sounds.fresh(clip('sn1', 'Wind', 'wav'), p);
    expect(next).toMatchObject({ id: 'sn2', file: 'sn2.wav', label: 'Wind' });
    sounds.add(next, new Uint8Array([2]));
    expect(sounds.bytes(first)).toEqual(new Uint8Array([1, 1, 1]));
    expect([...sounds.all().keys()]).toEqual(['sounds/sn1.mp3', 'sounds/sn2.wav']);
  });

  it('starts each film with only its own sounds', () => {
    const a = withSound(exampleProduction(), clip('sn1'));
    const sounds = new FilmSounds();
    sounds.reset(new Map([['sounds/sn1.mp3', new Uint8Array([9])]]), a);
    expect(sounds.bytes(clip('sn1'))).toEqual(new Uint8Array([9]));
    expect(sounds.fresh(clip('sn1'), a).id).toBe('sn2');
    sounds.reset(undefined, exampleProduction());
    expect(sounds.bytes(clip('sn1'))).toBeNull();
    expect(sounds.fresh(clip('sn1'), exampleProduction()).id).toBe('sn1');
  });

  it("gives a save the film's sounds with what it already carries", async () => {
    const sounds = new FilmSounds();
    sounds.reset(undefined, exampleProduction());
    sounds.add(clip('sn2'), new Uint8Array([2]));
    let given: ReadonlyMap<string, Uint8Array> | undefined;
    const pack = packingSounds(async (production: Production, files) => {
      given = files.sounds;
      return { production, files, missing: [] };
    }, sounds);
    await pack(exampleProduction(), {
      audio: new Map(),
      models: new Map(),
      sounds: new Map([['sounds/sn1.mp3', new Uint8Array([1])]]),
    });
    expect([...(given?.keys() ?? [])]).toEqual(['sounds/sn1.mp3', 'sounds/sn2.mp3']);
  });
});

describe('freeLabel', () => {
  const film = withSound(
    withSound(exampleProduction(), clip('sn1', 'Rain')),
    clip('sn2', 'Rain 2'),
  );
  it('numbers a name the film already has', () => {
    expect(freeLabel('Rain', film, 60)).toBe('Rain 3');
    expect(freeLabel('rain', film, 60)).toBe('rain 3');
    expect(freeLabel('  Wind ', film, 60)).toBe('Wind');
  });
  it('keeps a numbered name within the limit', () => {
    const long = 'x'.repeat(60);
    const p = withSound(exampleProduction(), clip('sn1', long));
    expect(freeLabel(long, p, 60)).toBe(`${'x'.repeat(58)} 2`);
  });
});
