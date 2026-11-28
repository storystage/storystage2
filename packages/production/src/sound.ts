/**
 * Sound the learner imports into a film (format 1.9.0, spec 03 section 1.7; decision 0076, the
 * owner's choices of 21 Nov 2026): MP3, WAV or M4A, up to 10 minutes and 25 MB a file and 150 MB
 * a film, kept as picked with the part the film uses. Every host decodes those three, and the
 * export decodes and mixes, so nothing is ever encoded again.
 *
 * Importing never trusts the file: its size is checked before it's read, its type from its first
 * bytes whatever its name says, and its length as the device decodes it.
 */
import { captureLicence, type LicenceAnswers, type LicenceProblem } from '@storystage/backstage';
import type { MusicCue, Production, SoundClip, SoundMix } from './types.ts';

/** The types a sound may be, by file extension, with the media type it's served as. */
export const SOUND_TYPES = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' } as const;
export type SoundType = keyof typeof SOUND_TYPES;

/** The limits (the owner's choice of 21 Nov 2026), and the format's guards. */
export const SOUND_LIMITS = {
  /** One file's size. */
  fileBytes: 25 * 1024 * 1024,
  /** One file's length, in seconds. */
  seconds: 600,
  /** All of a film's imported sounds together. */
  totalBytes: 150 * 1024 * 1024,
  /** Imported sounds in one film. */
  clips: 200,
  /** A sound's name. */
  label: 60,
  /** Music cues on one scene's timeline. */
  cues: 20,
} as const;

/**
 * The file input's `accept` (spec 05 section 6.5, S8): the extensions, and the media types
 * Android's chooser needs to offer the files at all. A filter only: the import checks the bytes.
 */
export const SOUND_ACCEPT = '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a';

/** The tracks' volumes for a film with no `mix` of its own. */
export const SOUND_MIX_DEFAULT: SoundMix = { speech: 1, music: 0.7, effects: 0.9 };

/** How long one music cue takes to give way to the next, in seconds. Fixed in this version. */
export const MUSIC_CROSSFADE_SECONDS = 1;

/** A film's mix, or the default. */
export const mixOf = (p: Production): SoundMix => p.manifest.mix ?? SOUND_MIX_DEFAULT;

const MP4_AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'mp41', 'mp42', 'isom', 'iso2']);

/** A file's type from its first bytes, never its name; null for anything else. */
export function soundTypeOf(bytes: Uint8Array): SoundType | null {
  const ascii = (at: number, length: number) =>
    String.fromCharCode(...bytes.subarray(at, at + length));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'wav';
  if (bytes.length >= 12 && ascii(4, 4) === 'ftyp')
    return MP4_AUDIO_BRANDS.has(ascii(8, 4)) ? 'm4a' : null;
  if (bytes.length >= 3 && ascii(0, 3) === 'ID3') return 'mp3';
  // An MPEG audio frame: 11 sync bits, then MPEG Layer III (not AAC's ADTS, whose layer is 0).
  const second = bytes[1] ?? 0;
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    (second & 0xe0) === 0xe0 &&
    ((second >> 1) & 3) === 1
  )
    return 'mp3';
  return null;
}

/** The first 32 hex digits of the bytes' SHA-256, in lower case, as a kept sound's name has them. */
export async function soundHash(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
  );
  return [...digest.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A clip's name in a pupil's folder (spec 03, section 1.4.1, point 1): `sound-<hash>.<type>`, its
 * type the clip file's own (`<id>.<type>`). Two clips with the same bytes have the same name.
 */
export async function keptSoundName(clipFile: string, bytes: Uint8Array): Promise<string> {
  const type = clipFile.slice(clipFile.lastIndexOf('.') + 1);
  if (!Object.hasOwn(SOUND_TYPES, type)) throw new Error(`${clipFile} isn't a sound's file.`);
  return `sound-${await soundHash(bytes)}.${type}`;
}

/** What `importSound` says, in plain words for the learner. */
export const SOUND_REFUSALS = {
  tooBig: 'That sound file is over 25 MB. Choose a smaller one.',
  notSound: "That file isn't an MP3, WAV or M4A sound.",
  wontPlay: "That sound file won't play on this device.",
  tooLong: 'That sound is over 10 minutes long. Choose a shorter one.',
  filmFull: "This film has all the imported sound it can hold. Remove a sound you don't use first.",
} as const;

/** In plain words, for the sound import's licence step (spec 03, section 1.7; 07-ux, S5). */
export const SOUND_LICENCE_PROBLEMS: Readonly<Record<LicenceProblem, string>> = {
  needsSource: "Paste the address of the sound's own page, where you found it.",
  badSource: "That doesn't look like a web page's address. It should start with https://.",
  needsMaker:
    'This licence asks you to name who made the sound. Their name is usually on its page.',
  needsName: 'Give the sound a name first.',
};

export type SoundImport =
  | { readonly ok: true; readonly clip: SoundClip; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly message: string };

/**
 * A picked file, ready for the trim dialog: a clip with the next free id and the whole file as its
 * trim, "not sure" where it came from until `licensedSound` says, or a refusal. The size is checked before `read`, then the type from the bytes, then
 * `measure` decodes it on this device and gives its length in seconds, throwing if it can't.
 * `withSound` then adds it, with the trim the learner chose.
 */
export async function importSound(
  p: Production,
  file: {
    readonly name: string;
    readonly size: number;
    readonly read: () => Promise<Uint8Array>;
  },
  measure: (bytes: Uint8Array, type: SoundType) => Promise<number>,
): Promise<SoundImport> {
  const refuse = (message: string): SoundImport => ({ ok: false, message });
  const sounds = p.manifest.sounds ?? [];
  if (file.size > SOUND_LIMITS.fileBytes) return refuse(SOUND_REFUSALS.tooBig);
  const used = sounds.reduce((sum, c) => sum + c.bytes, 0);
  if (sounds.length >= SOUND_LIMITS.clips || used + file.size > SOUND_LIMITS.totalBytes)
    return refuse(SOUND_REFUSALS.filmFull);
  const bytes = await file.read();
  // The size as read, not as the picker said.
  if (bytes.length > SOUND_LIMITS.fileBytes) return refuse(SOUND_REFUSALS.tooBig);
  if (used + bytes.length > SOUND_LIMITS.totalBytes) return refuse(SOUND_REFUSALS.filmFull);
  const type = soundTypeOf(bytes);
  if (!type) return refuse(SOUND_REFUSALS.notSound);
  let length: number;
  try {
    length = await measure(bytes, type);
  } catch {
    return refuse(SOUND_REFUSALS.wontPlay);
  }
  if (!Number.isFinite(length) || length <= 0) return refuse(SOUND_REFUSALS.wontPlay);
  if (length > SOUND_LIMITS.seconds) return refuse(SOUND_REFUSALS.tooLong);
  const taken = new Set(sounds.map((c) => c.id));
  let n = 1;
  while (taken.has(`sn${n}`)) n++;
  const id = `sn${n}`;
  const label =
    file.name
      .replace(/\.[^.]*$/, '')
      .trim()
      .slice(0, SOUND_LIMITS.label) || id;
  return {
    ok: true,
    clip: {
      id,
      file: `${id}.${type}`,
      label,
      length,
      bytes: bytes.length,
      trim: { start: 0, end: length },
      licence: 'not-sure',
      credit: `${label}, source not checked`,
    },
    bytes,
  };
}

/**
 * `clip` with where it came from, from the learner's answers on the licence step, with its credit
 * made from them and its label (spec 03, section 1.7; spec 17, section 6). A clip trimmed shorter
 * than its file is changed, so a CC BY credit says so. The trim dialog gives it last, once the
 * label and trim are set (S5).
 */
export function licensedSound(
  clip: SoundClip,
  answers: LicenceAnswers,
):
  | { readonly ok: true; readonly clip: SoundClip }
  | { readonly ok: false; readonly problems: readonly LicenceProblem[] } {
  const trimmed = clip.trim.start > 0 || clip.trim.end < clip.length;
  const made = captureLicence(clip.label, answers, trimmed);
  if (!made.ok) return made;
  const { licence, credit, source } = made.record;
  const next: { -readonly [K in keyof SoundClip]: SoundClip[K] } = { ...clip, licence, credit };
  // The page goes with the licence it was given for.
  if (source) next.source = { url: source.url };
  else delete next.source;
  return { ok: true, clip: next };
}

/**
 * The production with clip `id`'s licence changed (`withSoundLicence`, "Change where Birdsong
 * came from", one undo step), or the problems with the answers. A pure change. The production is
 * returned as it was if it has no clip `id`.
 */
export function withSoundLicence(
  p: Production,
  id: string,
  answers: LicenceAnswers,
):
  | { readonly ok: true; readonly production: Production }
  | { readonly ok: false; readonly problems: readonly LicenceProblem[] } {
  const clip = (p.manifest.sounds ?? []).find((c) => c.id === id);
  if (!clip) return { ok: true, production: p };
  const made = licensedSound(clip, answers);
  if (!made.ok) return made;
  const sounds = (p.manifest.sounds ?? []).map((c) => (c.id === id ? made.clip : c));
  return { ok: true, production: { ...p, manifest: { ...p.manifest, sounds } } };
}

/** The production with `clip` added, or replaced if its id is there. A pure change. */
export function withSound(p: Production, clip: SoundClip): Production {
  const sounds = (p.manifest.sounds ?? []).filter((c) => c.id !== clip.id);
  return { ...p, manifest: { ...p.manifest, sounds: [...sounds, clip] } };
}

/**
 * The production without the clip `id`, and without the music cues that play it. A pure change;
 * a speak line or playAudio block that names it plays silence until it's changed.
 */
export function withoutSound(p: Production, id: string): Production {
  const sounds = (p.manifest.sounds ?? []).filter((c) => c.id !== id);
  const manifest: { -readonly [K in keyof Production['manifest']]: Production['manifest'][K] } = {
    ...p.manifest,
    sounds,
  };
  if (sounds.length === 0) delete manifest.sounds;
  return {
    ...p,
    manifest,
    scenes: p.scenes.map((s) =>
      s.music?.some((cue) => cue.sound === id)
        ? sceneWithMusic(
            s,
            s.music.filter((cue) => cue.sound !== id),
          )
        : s,
    ),
  };
}

/** A scene with `music`, or with none when it's empty. */
function sceneWithMusic(
  s: Production['scenes'][number],
  music: readonly MusicCue[],
): Production['scenes'][number] {
  const scene: { -readonly [K in keyof typeof s]: (typeof s)[K] } = { ...s, music };
  if (music.length === 0) delete scene.music;
  return scene;
}

/** The production with the tracks' volumes `mix`. A pure change. */
export function withMix(p: Production, mix: SoundMix): Production {
  return { ...p, manifest: { ...p.manifest, mix } };
}

/**
 * The production with scene `scene`'s music `cues`, in start order; an empty list leaves the
 * scene with none. A pure change, as the Sound view writes it (S5).
 */
export function withSceneMusic(
  p: Production,
  scene: Production['scenes'][number]['id'],
  cues: readonly MusicCue[],
): Production {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  return {
    ...p,
    scenes: p.scenes.map((s) => (s.id === scene ? sceneWithMusic(s, sorted) : s)),
  };
}
