/**
 * The film's sound files, decoded for the export's mix (spec 08 section 4; decision 0076): each
 * imported clip's bytes, as the studio keeps them, decoded once and made one channel. The export
 * asks for the sounds it plays (`FilmSounds.prepare`), then reads each (`sound`).
 *
 * Shelf sounds aren't here yet: their files come with Backstage's sound shelf (spec 17 section
 * 2b). Until then one plays silent, and the export counts it as a sound it couldn't play.
 */
import type { DecodedSound, FilmSounds } from '@storystage/export';
import type { Production, SoundClip } from '@storystage/production';

/** Where a clip's file is: the studio's `FilmSounds`, for the film that's open. */
export interface SoundSource {
  /** The clip's file, or `null` when the film hasn't got it. */
  bytes(clip: SoundClip): Uint8Array | null;
}

/** Decodes a file to its channels at its own rate; `null` when this device can't. */
export type DecodeSound = (
  bytes: Uint8Array,
) => Promise<{ readonly channels: readonly Float32Array[]; readonly sampleRate: number } | null>;

/** The channels' average, one channel. */
function mono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const length = Math.max(0, ...channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (const c of channels) for (let i = 0; i < c.length; i++) out[i]! += c[i]! / channels.length;
  return out;
}

/** The export's decoded files for `production`, from `source`, by `decode`. */
export function filmSoundFiles(
  production: Production,
  source: SoundSource,
  decode: DecodeSound,
): FilmSounds {
  const decoded = new Map<string, DecodedSound | null>();
  return {
    async prepare(names, signal) {
      for (const name of names) {
        if (signal?.aborted) return;
        if (decoded.has(name)) continue;
        const clip = production.manifest.sounds?.find((c) => c.id === name);
        const bytes = clip ? source.bytes(clip) : null;
        const out = bytes ? await decode(bytes).catch(() => null) : null;
        decoded.set(name, out ? { samples: mono(out.channels), sampleRate: out.sampleRate } : null);
      }
    },
    sound: (name) => decoded.get(name) ?? undefined,
  };
}
