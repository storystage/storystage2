/**
 * Speak line's sounds: made once per line as the code changes, kept, and played by Rehearse and
 * export alike (spec 06, sections 4.2, 4.5 and 4.6).
 *
 * The engine (Kokoro, in a worker) is behind `SpeechEngine`, so everything here is tested with a
 * fake one.
 */
import { lineDuration } from '@storystage/story-api';
import type { Accent, CastVoice } from './presets.ts';
import { changeVoice, fitToTime } from './voice-change.ts';

/** Turns words into sound in one of Kokoro's voices. */
export interface SpeechEngine {
  readonly sampleRate: number;
  speak(
    text: string,
    voice: { readonly base: string; readonly accent: Accent },
  ): Promise<Float32Array>;
}

/** One speak line: its words, its character's voice, and how long the block takes. */
export interface Line {
  readonly text: string;
  readonly voice: CastVoice;
  readonly seconds: number;
}

/** A speak block's time: its `duration` detail if it has one, otherwise from its words (4.2). */
export const lineSeconds = (text: string, duration?: number) => duration ?? lineDuration(text);

/** A line `LineCache.prepare` couldn't make, and why, in words the studio can show. */
export interface LineFailure {
  readonly line: Line;
  readonly message: string;
}

/** What makes two lines sound the same: the same words, voice and time share one sound. */
export function lineKey(l: Line): string {
  const v = l.voice;
  return JSON.stringify([l.text, v.accent, v.base, v.pitch, v.formant, v.speed, l.seconds]);
}

/** Makes one line's sound: the engine's voice, changed for its preset, fitted to its time. */
export async function makeLine(engine: SpeechEngine, line: Line): Promise<Float32Array> {
  const plain = await engine.speak(line.text, line.voice);
  const changed = changeVoice(plain, engine.sampleRate, line.voice);
  return fitToTime(changed, engine.sampleRate, line.seconds);
}

/**
 * The sounds of a production's lines. `prepare` is called with every speak line whenever the
 * code changes: it makes the ones not yet made, one at a time, and a newer call takes over from
 * an older one, so lines that were deleted aren't made. Sounds for lines no longer in the code
 * are let go.
 */
export class LineCache {
  readonly #engine: SpeechEngine;
  readonly #sounds = new Map<string, Float32Array>();
  /** The lines the latest `prepare` asked for. */
  #wanted: ReadonlySet<string> = new Set();
  #generation = 0;

  constructor(engine: SpeechEngine) {
    this.#engine = engine;
  }

  get sampleRate(): number {
    return this.#engine.sampleRate;
  }

  /**
   * Makes every line's sound that isn't made yet. Resolves when done, or when overtaken, with the
   * lines that couldn't be made: they stay silent, with their captions (rule 7), and are tried
   * again by the next `prepare`. One line failing doesn't stop the others.
   */
  async prepare(lines: readonly Line[]): Promise<LineFailure[]> {
    const failures: LineFailure[] = [];
    const generation = ++this.#generation;
    const wanted = new Map(lines.map((l) => [lineKey(l), l]));
    this.#wanted = new Set(wanted.keys());
    for (const key of this.#sounds.keys()) if (!wanted.has(key)) this.#sounds.delete(key);
    for (const [key, line] of wanted) {
      if (generation !== this.#generation) return failures; // newer code: that call takes over
      if (this.#sounds.has(key)) continue;
      let sound: Float32Array;
      try {
        sound = await makeLine(this.#engine, line);
      } catch (e) {
        failures.push({ line, message: e instanceof Error ? e.message : String(e) });
        continue;
      }
      // Kept only if the code still has the line once it's made.
      if (this.#wanted.has(key)) this.#sounds.set(key, sound);
    }
    return failures;
  }

  /** The line's sound, if it's ready. */
  get(line: Line): Float32Array | undefined {
    return this.#sounds.get(lineKey(line));
  }

  /** How many lines are ready. */
  get size(): number {
    return this.#sounds.size;
  }

  /** Forgets every sound: after the accent changes, for example (4.3). */
  clear(): void {
    this.#generation++;
    this.#wanted = new Set();
    this.#sounds.clear();
  }
}

/** Plays sound. The browser's is in `browser.ts`; tests use a fake. */
export interface AudioOut {
  play(samples: Float32Array, sampleRate: number): void;
  stop(): void;
}

/**
 * Plays speak lines during Rehearse (4.5): one at a time, a new line cutting the one before.
 * A line whose sound isn't ready is silent; its caption still shows (rule 7).
 */
export class LinePlayer {
  readonly #cache: LineCache;
  readonly #out: AudioOut;

  constructor(cache: LineCache, out: AudioOut) {
    this.#cache = cache;
    this.#out = out;
  }

  /** Starts a line as its block starts. Returns whether it has sound. */
  start(line: Line): boolean {
    this.#out.stop();
    const sound = this.#cache.get(line);
    if (!sound) return false;
    this.#out.play(sound, this.#cache.sampleRate);
    return true;
  }

  /** Stop, pause, or leaving the Production stage. */
  stop(): void {
    this.#out.stop();
  }
}
