/**
 * The film's three tracks, mixed into one (spec 08 section 4; decision 0076, workplan 11.7):
 *
 * - **Speech:** each speak line voiced at its caption's start (`soundtrack`).
 * - **Sound FX:** each sound a `playAudio` block played, from its trim, at its start, for the
 *   time it played (cut by its scene's end), fading over its last 10 ms so it doesn't click
 *   wherever it stops, as Rehearse's player does.
 * - **Music:** the scenes' cues as `musicPlays` places them, with their fades, loops and
 *   crossfades (S3's `@storystage/sound`), lowered under speech by `duckOf`, as Rehearse plays it.
 *
 * Each track plays at the film's volume (`mixOf`), and the sum is kept within ±1. The sounds'
 * files are the studio's to decode (`FilmSounds`), as the voices are. A sound it couldn't decode
 * is silent, and counted.
 */
import { mixOf, type Production, type SceneId } from '@storystage/production';
import { duckOf, levelsFrom, musicPlays, type ScenePlace } from '@storystage/sound';
import type { Micros } from '@storystage/story-api';
import type { SpokenLine } from './captions.ts';
import { FADE, TRACK_RATE, soundtrack, type FilmVoices } from './soundtrack.ts';

/** A sound's whole file, decoded to one channel, at its own rate. */
export interface DecodedSound {
  readonly samples: Float32Array;
  readonly sampleRate: number;
}

/** The studio's decoded sound files, by the name a block or a cue gives them. */
export interface FilmSounds {
  /** Decodes every sound named not decoded yet; resolves when done. */
  prepare(sounds: readonly string[], signal?: AbortSignal): Promise<void>;
  /** A sound's decoded file; `undefined` if it has none, or couldn't be decoded. */
  sound(sound: string): DecodedSound | undefined;
}

/** A sound the film plays, as the measuring run gives it (`MeasuredSound`). */
export interface PlayedSound {
  readonly scene: SceneId;
  readonly sound: string;
  readonly start: Micros;
  /** How long it plays: the part it uses, cut at its scene's end. */
  readonly duration: Micros;
}

/** A scene as the measuring run played it, on the film's clock. */
export interface PlayedScene {
  readonly scene: SceneId;
  readonly start: Micros;
  readonly length: Micros;
}

export interface FilmMix {
  /** One channel at `TRACK_RATE`, the whole export's length. */
  readonly samples: Float32Array;
  /** Speak lines with sound, and without (silent, with their captions). */
  readonly voiced: number;
  readonly silent: number;
  /** Sound FX and music cues whose file couldn't be decoded, so they're silent. */
  readonly unplayed: number;
  /** Whether anything at all is heard: a film with nothing to hear has no sound track. */
  readonly heard: boolean;
}

const seconds = (t: Micros) => t / 1_000_000;
const sampleAt = (s: number) => Math.round(s * TRACK_RATE);

/** The file's sample `at` seconds into it, straight between neighbours; silence outside it. */
function read(file: DecodedSound, at: number): number {
  const x = at * file.sampleRate;
  const j = Math.floor(x);
  if (j < 0 || j >= file.samples.length) return 0;
  const a = file.samples[j]!;
  const b = file.samples[j + 1] ?? a;
  return a + (b - a) * (x - j);
}

const clipOf = (p: Production, sound: string) => p.manifest.sounds?.find((s) => s.id === sound);

/** The scenes on the film's clock in seconds, from `offset` (the title card), for `musicPlays`. */
const placesOf = (scenes: readonly PlayedScene[], offset: Micros): ScenePlace[] =>
  scenes.map((s) => ({
    scene: s.scene,
    start: seconds(offset + s.start),
    length: seconds(s.length),
  }));

/** The music as played: every scene is given, so no scene before the first is ever asked about. */
const playsOf = (p: Production, scenes: readonly PlayedScene[], offset: Micros) =>
  musicPlays(p, placesOf(scenes, offset), () => 0);

/** Every sound the film plays, once: its Sound FX, then the played scenes' music. */
export function soundsToPrepare(
  p: Production,
  sounds: readonly PlayedSound[],
  scenes: readonly PlayedScene[],
): string[] {
  const names = new Set(sounds.map((s) => s.sound));
  for (const play of playsOf(p, scenes, 0)) names.add(play.sound);
  return [...names];
}

export interface MixInput {
  readonly production: Production;
  /** The measuring run's lines: the speak lines among them are voiced. */
  readonly lines: readonly SpokenLine[];
  readonly sounds: readonly PlayedSound[];
  readonly scenes: readonly PlayedScene[];
  /** The studio's voices; without them, speak lines are silent, with their captions. */
  readonly voices?: FilmVoices;
  /** The studio's decoded files; without them, Sound FX and music are silent. */
  readonly files?: FilmSounds;
  /** The title card's length: the film starts after it. */
  readonly offset: Micros;
  /** The whole export's length. */
  readonly total: Micros;
}

/** The film's one track: speech, Sound FX and music at the film's volumes. */
export function mixFilm(input: MixInput): FilmMix {
  const { production: p, offset, total } = input;
  const length = sampleAt(seconds(total));
  const volume = mixOf(p);
  const speech = input.voices ? soundtrack(input.lines, input.voices, { offset, total }) : null;
  const speakLines = input.lines.filter((l) => l.kind === 'caption').length;
  let unplayed = 0;
  let heard = (speech?.voiced ?? 0) > 0;

  // Sound FX: each from its trim, for the time it played, its last 10 ms faded (as Rehearse does).
  const effects = new Float32Array(length);
  for (const s of input.sounds) {
    const file = input.files?.sound(s.sound);
    if (!file) {
      unplayed++;
      continue;
    }
    heard = true;
    const clip = clipOf(p, s.sound);
    const skip = clip?.trim.start ?? 0;
    const from = sampleAt(seconds(offset + s.start));
    const count = Math.max(0, Math.min(sampleAt(seconds(s.duration)), length - from));
    const fade = Math.min(FADE, count);
    for (let k = 0; k < count; k++) {
      let v = read(file, skip + k / TRACK_RATE);
      const left = count - k;
      if (left <= fade) v *= (left - 1) / fade;
      effects[from + k]! += v;
    }
  }

  // Music: each cue as musicPlays places it, from its file, at its gain.
  const music = new Float32Array(length);
  for (const play of playsOf(p, input.scenes, offset)) {
    const file = input.files?.sound(play.sound);
    if (!file) {
      unplayed++;
      continue;
    }
    heard = true;
    const part = play.to - play.from;
    const first = sampleAt(play.start);
    const last = Number.isFinite(play.end) ? Math.min(sampleAt(play.end), length) : length;
    const gain = levelsFrom(play.gain);
    for (let i = Math.max(0, first); i < last; i++) {
      const t = i / TRACK_RATE;
      const into = play.offset - play.from + (t - play.start);
      if (!play.loop && into >= part) break;
      const at = play.from + (play.loop && part > 0 ? into % part : into);
      music[i]! += read(file, at) * gain(t);
    }
  }

  // Together: music lowered under speech, each track at its volume, within ±1.
  const lowered = levelsFrom(duckOf(speech?.spans ?? []));
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const v =
      (speech?.samples[i] ?? 0) * volume.speech +
      music[i]! * volume.music * lowered(i / TRACK_RATE) +
      effects[i]! * volume.effects;
    samples[i] = Math.max(-1, Math.min(1, v));
  }
  return {
    samples,
    voiced: speech?.voiced ?? 0,
    silent: speech ? speech.silent : speakLines,
    unplayed,
    heard,
  };
}
