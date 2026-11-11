/**
 * The film's sound (spec 08 section 4): each speak line voiced at its caption's start, as
 * Rehearse plays it (spec 06 sections 4.5 to 4.7). One line at a time: a line is cut where the
 * next starts, and where its scene ends, with a short fade so the cut doesn't click.
 *
 * Which voice a character has is the studio's: the export asks it for each line's sound
 * (`FilmVoices`), which the studio makes with S1's `LineCache`.
 */
import type { SceneId } from '@storystage/production';
import type { Micros } from '@storystage/story-api';
import type { SpokenLine } from './captions.ts';

/** The track's rate. AAC encoders in browsers take 44.1 or 48 kHz, not the cache's 24 kHz. */
export const TRACK_RATE = 48_000;

/** A cut line fades out over this many samples (10 ms). */
export const FADE = Math.round(TRACK_RATE / 100);

/** A speak line the film speaks, as the export asks the studio for its sound. */
export interface VoicedLine {
  readonly scene: SceneId;
  /** The speaker: its object id in the scene. */
  readonly object: string;
  readonly text: string;
  /** The script line it came from, if any. */
  readonly line?: string;
  /** The block's own time, before any cut at the scene's end: the time its sound was fitted to. */
  readonly seconds: number;
}

/** The studio's voices for the film's speak lines. */
export interface FilmVoices {
  /** The rate of the sounds `sound` gives. */
  readonly sampleRate: number;
  /** Makes every line's sound not made yet (`LineCache.prepare`); resolves when done. */
  prepare(lines: readonly VoicedLine[], signal?: AbortSignal): Promise<void>;
  /** A line's samples, already fitted to its time; `undefined` if it has none. */
  sound(line: VoicedLine): Float32Array | undefined;
}

const voiced = (l: SpokenLine): VoicedLine => ({
  scene: l.scene,
  object: l.object,
  text: l.text,
  ...(l.line === undefined ? {} : { line: l.line }),
  seconds: (l.length ?? l.duration) / 1_000_000,
});

/** The speak lines the film speaks, in order, for the studio to prepare. */
export function voicedLines(lines: readonly SpokenLine[]): VoicedLine[] {
  return lines.filter((l) => l.kind === 'caption').map(voiced);
}

/** `samples` at `from` Hz, at the track's rate: linear between neighbours. */
function resample(samples: Float32Array, from: number): Float32Array {
  if (from === TRACK_RATE) return samples;
  const out = new Float32Array(Math.round((samples.length * TRACK_RATE) / from));
  const step = from / TRACK_RATE;
  for (let i = 0; i < out.length; i++) {
    const x = i * step;
    const j = Math.floor(x);
    const a = samples[j] ?? 0;
    const b = samples[j + 1] ?? a;
    out[i] = a + (b - a) * (x - j);
  }
  return out;
}

const sampleAt = (t: Micros) => Math.round((t * TRACK_RATE) / 1_000_000);

export interface Soundtrack {
  /** One channel at `TRACK_RATE`, the whole export's length. */
  readonly samples: Float32Array;
  /** Speak lines with sound, and without (silent, with their captions). */
  readonly voiced: number;
  readonly silent: number;
}

/**
 * The export's track: `offset` is the title card's length, `total` the whole export's. Lines are
 * on the film's clock, as the measuring run gives them.
 */
export function soundtrack(
  lines: readonly SpokenLine[],
  voices: FilmVoices,
  options: { readonly offset: Micros; readonly total: Micros },
): Soundtrack {
  const samples = new Float32Array(sampleAt(options.total));
  const spoken = lines.filter((l) => l.kind === 'caption').sort((a, b) => a.start - b.start);
  let voicedCount = 0;
  let silent = 0;
  spoken.forEach((l, i) => {
    const sound = voices.sound(voiced(l));
    if (!sound) {
      silent++;
      return;
    }
    voicedCount++;
    const next = spoken[i + 1];
    // Ends where its scene cut it (`duration`), or where the next line starts.
    const end = Math.min(l.start + l.duration, next ? next.start : Infinity);
    const from = sampleAt(options.offset + l.start);
    const until = Math.min(sampleAt(options.offset + end), samples.length);
    const track = resample(sound, voices.sampleRate);
    const n = Math.max(0, Math.min(track.length, until - from));
    samples.set(track.subarray(0, n), from);
    if (n < track.length) {
      // Cut: fade out the last stretch, so it doesn't click.
      const fade = Math.min(FADE, n);
      for (let k = 0; k < fade; k++) samples[from + n - fade + k]! *= 1 - (k + 1) / fade;
    }
  });
  return { samples, voiced: voicedCount, silent };
}
