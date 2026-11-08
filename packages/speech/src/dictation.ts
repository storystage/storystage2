/**
 * Dictation: talking instead of typing, into any field (`docs/spec/06-speech.md` section 1,
 * decision 0060). One `Dictation` serves the whole studio, one take at a time. It hands back
 * the words; the studio puts them in the field.
 *
 * The microphone and the recogniser (whisper in its worker) are passed in, so this is tested
 * without either. Audio stays in memory, and is zeroed once it has been heard (rule 3).
 */
import type { SpeechModelName, SpeechModels } from '@storystage/host';
import { level as levelOf, toMono } from './resample.ts';
import { cleanTranscript } from './transcript.ts';

/** A take stops listening by itself at this length (section 1.5). Whisper hears 30 seconds at once. */
export const MAX_TAKE_MS = 30_000;
/** Shorter than this isn't transcribed. */
export const MIN_TAKE_MS = 500;
/** The worker is ended when no take has started for this long (section 1.8). */
export const IDLE_MS = 30_000;

export const DICTATION_ERROR_CODES = [
  'no_microphone',
  'permission_denied',
  'too_short',
  'nothing_heard',
  'out_of_memory',
  'model_failed',
  'busy',
  'cancelled',
  'internal',
] as const;
export type DictationErrorCode = (typeof DICTATION_ERROR_CODES)[number];

/** Section 1.10's words. `null`: the studio says nothing. */
export const DICTATION_MESSAGES: Readonly<Record<DictationErrorCode, string | null>> = {
  no_microphone: 'No microphone found.',
  permission_denied:
    "StoryStage can't use the microphone. You can let it in your device's settings.",
  too_short: 'Tap the mic, talk, then tap it again.',
  nothing_heard: "I didn't catch that. Try again, a little closer.",
  out_of_memory: "There isn't enough memory to listen right now. Close other apps and try again.",
  model_failed: "Talk to type isn't working right now. You can still type.",
  busy: null,
  cancelled: null,
  internal: 'Talk to type stopped working. You can still type.',
};

export class DictationError extends Error {
  readonly code: DictationErrorCode;

  constructor(code: DictationErrorCode) {
    super(DICTATION_MESSAGES[code] ?? code);
    this.name = 'DictationError';
    this.code = code;
  }
}

/** A value to read and to watch. */
export interface Watchable<T> {
  get(): T;
  /** Calls `listener` on every change; returns the way to stop. */
  subscribe(listener: (value: T) => void): () => void;
}

export interface DictationState {
  readonly phase: 'idle' | 'listening' | 'working';
  /** How loud the microphone is, 0 to 1, while listening. */
  readonly level: number;
}

/** The device's microphone. The browser's one comes with the worker (next pull request). */
export interface Microphone {
  /**
   * Opens it and calls `onSamples` with each chunk, one array per channel. Rejects with a
   * `DictationError`: `no_microphone` or `permission_denied`.
   */
  open(onSamples: (channels: readonly Float32Array[], sampleRate: number) => void): Promise<void>;
  /** Lets it go, so the system's microphone light goes off. */
  close(): void;
}

/** Whisper, in its worker. */
export interface Recogniser {
  /** Hears mono audio at `sampleRate`, which it resamples itself. Rejects with a `DictationError`. */
  transcribe(audio: Float32Array, sampleRate: number): Promise<string>;
  /** Ends the worker, giving its memory back. */
  end(): void;
}

export interface Clock {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Tells dictation when the window loses focus or the page is hidden. */
export type AwayWatcher = (onAway: () => void) => () => void;

export interface DictationOptions {
  readonly microphone: Microphone;
  /** Starts a recogniser with a checked model's bytes. */
  readonly recogniser: (model: ArrayBuffer) => Promise<Recogniser>;
  /** The learner's choice (section 1.3). The bundled model is used if it isn't downloaded. */
  readonly model?: () => SpeechModelName;
  readonly clock?: Clock;
  readonly away?: AwayWatcher;
}

export interface Dictation {
  readonly state: Watchable<DictationState>;
  /** Opens the microphone. Rejects with a `DictationError`; `busy` while another take is going. */
  start(): Promise<void>;
  /**
   * Stops listening, and gives back the words. Also collects the words of a take that stopped by
   * itself, at 30 seconds or when the window lost focus. Rejects with a `DictationError`.
   */
  stop(): Promise<{ readonly text: string }>;
  /** Stops and throws the audio away. */
  cancel(): void;
}

const BUNDLED: SpeechModelName = 'tiny.en-q5_1';

const asDictationError = (e: unknown) =>
  e instanceof DictationError ? e : new DictationError('internal');

class DictationTake implements Dictation {
  readonly #options: DictationOptions;
  readonly #speech: SpeechModels;
  readonly #clock: Clock;
  readonly #listeners = new Set<(value: DictationState) => void>();
  #state: DictationState = { phase: 'idle', level: 0 };
  #chunks: Float32Array[] = [];
  #rate = 0;
  #limit: unknown = null;
  #idle: unknown = null;
  #result: Promise<{ readonly text: string }> | null = null;
  #recogniser: Promise<Recogniser> | null = null;
  /** The recogniser this take started or found, so one take never loads the model twice. */
  #takeRecogniser: Promise<Recogniser> | null = null;
  /** Changes on cancel and on each new take, so a late result from an old take is dropped. */
  #take = 0;

  readonly state: Watchable<DictationState> = {
    get: () => this.#state,
    subscribe: (listener) => {
      this.#listeners.add(listener);
      return () => this.#listeners.delete(listener);
    },
  };

  constructor(speech: SpeechModels, options: DictationOptions) {
    this.#speech = speech;
    this.#options = options;
    this.#clock = options.clock ?? {
      setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
      clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
    options.away?.(() => this.#away());
  }

  #set(state: DictationState): void {
    this.#state = state;
    for (const listener of [...this.#listeners]) listener(state);
  }

  async start(): Promise<void> {
    if (this.#state.phase !== 'idle') throw new DictationError('busy');
    // A take that stopped by itself and was never collected is dropped by a new one.
    this.#result = null;
    const take = ++this.#take;
    this.#clock.clearTimeout(this.#idle);
    this.#chunks = [];
    this.#rate = 0;
    // The model loads while the learner talks (section 1.8).
    this.#recogniser ??= this.#startRecogniser();
    this.#takeRecogniser = this.#recogniser;
    this.#takeRecogniser.catch(() => {});
    this.#set({ phase: 'listening', level: 0 });
    try {
      await this.#options.microphone.open((channels, rate) => {
        if (take !== this.#take || this.#state.phase !== 'listening') return;
        const mono = toMono(channels);
        this.#chunks.push(mono);
        this.#rate = rate;
        this.#set({ phase: 'listening', level: levelOf(mono) });
      });
    } catch (e) {
      if (take === this.#take) this.#set({ phase: 'idle', level: 0 });
      throw asDictationError(e);
    }
    if (take !== this.#take) return;
    this.#limit = this.#clock.setTimeout(() => this.#endListening(), MAX_TAKE_MS);
  }

  stop(): Promise<{ readonly text: string }> {
    if (this.#state.phase === 'listening') this.#endListening();
    const result = this.#result;
    this.#result = null;
    return result ?? Promise.reject(new DictationError('cancelled'));
  }

  cancel(): void {
    this.#take++;
    this.#closeMicrophone();
    this.#zero();
    this.#result = null;
    this.#set({ phase: 'idle', level: 0 });
    this.#scheduleEnd();
  }

  #closeMicrophone(): void {
    this.#clock.clearTimeout(this.#limit);
    this.#limit = null;
    this.#options.microphone.close();
  }

  #zero(): void {
    for (const chunk of this.#chunks) chunk.fill(0);
    this.#chunks = [];
  }

  /** Stops listening, as a tap does, and starts working out the words. */
  #endListening(): void {
    if (this.#state.phase !== 'listening') return;
    const take = this.#take;
    this.#closeMicrophone();
    this.#set({ phase: 'working', level: 0 });
    const result = this.#hear(take);
    result.catch(() => {});
    this.#result = result;
  }

  async #hear(take: number): Promise<{ readonly text: string }> {
    const chunks = this.#chunks;
    const rate = this.#rate;
    this.#chunks = [];
    const length = chunks.reduce((n, c) => n + c.length, 0);
    const audio = new Float32Array(length);
    let at = 0;
    for (const chunk of chunks) {
      audio.set(chunk, at);
      at += chunk.length;
      chunk.fill(0);
    }
    try {
      if (rate === 0 || (length / rate) * 1000 < MIN_TAKE_MS) throw new DictationError('too_short');
      const recogniser = await (this.#takeRecogniser ??
        (this.#recogniser = this.#startRecogniser()));
      let raw: string;
      try {
        raw = await recogniser.transcribe(audio, rate);
      } catch (e) {
        const error = asDictationError(e);
        // A worker the system ended can't be used again.
        if (error.code === 'out_of_memory') this.#dropRecogniser();
        throw error;
      }
      if (take !== this.#take) throw new DictationError('cancelled');
      const text = cleanTranscript(raw);
      if (text === '') throw new DictationError('nothing_heard');
      return { text };
    } finally {
      // A worker recogniser takes the audio (it is transferred), and wipes it there.
      if (audio.byteLength > 0) audio.fill(0);
      if (take === this.#take) {
        this.#set({ phase: 'idle', level: 0 });
        this.#scheduleEnd();
      }
    }
  }

  async #startRecogniser(): Promise<Recogniser> {
    let bytes: ArrayBuffer;
    try {
      bytes = await this.#load(this.#options.model?.() ?? BUNDLED);
    } catch {
      this.#recogniser = null;
      throw new DictationError('model_failed');
    }
    try {
      return await this.#options.recogniser(bytes);
    } catch (e) {
      this.#recogniser = null;
      throw asDictationError(e);
    }
  }

  /** The chosen model, or the bundled one if the chosen one isn't on the device. */
  async #load(name: SpeechModelName): Promise<ArrayBuffer> {
    try {
      return await this.#speech.load(name);
    } catch (e) {
      if (name !== BUNDLED && (e as { code?: string }).code === 'not_downloaded')
        return this.#speech.load(BUNDLED);
      throw e;
    }
  }

  #dropRecogniser(): void {
    const recogniser = this.#recogniser;
    this.#recogniser = null;
    recogniser?.then((r) => r.end()).catch(() => {});
  }

  #scheduleEnd(): void {
    this.#clock.clearTimeout(this.#idle);
    this.#idle = this.#clock.setTimeout(() => this.#dropRecogniser(), IDLE_MS);
  }

  /** The window lost focus or the page was hidden: let the microphone go, keeping the words. */
  #away(): void {
    if (this.#state.phase === 'listening') this.#endListening();
    if (this.#state.phase === 'idle') {
      this.#clock.clearTimeout(this.#idle);
      this.#dropRecogniser();
    }
  }
}

/** The studio's one `Dictation`, or `null` where speech isn't allowed, so a field shows no mic. */
export function createDictation(
  speech: SpeechModels | null,
  options: DictationOptions,
): Dictation | null {
  return speech ? new DictationTake(speech, options) : null;
}

/** Whether a field shows its mic button (section 1.1). */
export function micShown(conditions: {
  /** `HostInterface.speech`: non-null where `speech.dictation` allows it. */
  readonly speech: SpeechModels | null;
  readonly crossOriginIsolated: boolean;
  /** The learner's Talk to type setting. */
  readonly talkToType: boolean;
  /** For the Prompter's input only. */
  readonly prompterVoiceInput?: boolean;
}): boolean {
  return (
    conditions.speech !== null &&
    conditions.crossOriginIsolated &&
    conditions.talkToType &&
    conditions.prompterVoiceInput !== false
  );
}
