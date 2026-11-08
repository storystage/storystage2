/**
 * whisper.cpp in its worker (`docs/spec/06-speech.md` section 1.2): load a checked model, then
 * hear 16 kHz mono audio. whisper.cpp's WebAssembly example reports what it heard by printing
 * it, and works on its own thread, so a transcription ends when it prints its total time.
 *
 * The module is passed in, so this is tested without whisper.
 */
import { WHISPER_RATE, resample } from './resample.ts';

/** What whisper.cpp's `examples/whisper.wasm` exports, with the file system the build adds. */
export interface WhisperModule {
  readonly FS: {
    writeFile(path: string, data: Uint8Array): void;
    unlink(path: string): void;
  };
  init(path: string): number;
  free(instance: number): void;
  full_default(
    instance: number,
    audio: Float32Array,
    lang: string,
    threads: number,
    translate: boolean,
  ): number;
}

/** Thrown with the code the main thread passes on (`DictationErrorCode`). */
export class WhisperError extends Error {
  readonly code: 'model_failed' | 'internal';

  constructor(code: 'model_failed' | 'internal') {
    super(code);
    this.code = code;
  }
}

const MODEL_PATH = '/model.bin';
const TIMED_LINE = /^\s*\[\d{2}:\d{2}:\d{2}\.\d+ --> \d{2}:\d{2}:\d{2}\.\d+\]/;

export class WhisperCore {
  readonly #module: WhisperModule;
  readonly #threads: number;
  readonly #log: (line: string) => void;
  #instance = 0;
  #lines: string[] = [];
  #done: (() => void) | null = null;
  #busy = false;

  /** `log` hears what it is doing, for diagnosing a build. */
  constructor(module: WhisperModule, threads: number, log: (line: string) => void = () => {}) {
    this.#module = module;
    this.#threads = threads;
    this.#log = log;
  }

  /** whisper.cpp's printed output, from `Module.print` and `Module.printErr`. */
  print(line: string): void {
    this.#lines.push(line);
    if (/total time\s*=/.test(line)) this.#done?.();
  }

  /** Loads a model already checked against its pin by the native layer. The bytes are zeroed after. */
  load(model: Uint8Array): void {
    if (this.#instance) this.#module.free(this.#instance);
    this.#instance = 0;
    try {
      this.#module.FS.unlink(MODEL_PATH);
    } catch {
      // No earlier model.
    }
    try {
      this.#module.FS.writeFile(MODEL_PATH, model);
      this.#instance = this.#module.init(MODEL_PATH);
    } catch {
      this.#instance = 0;
    } finally {
      model.fill(0);
    }
    if (!this.#instance) throw new WhisperError('model_failed');
  }

  /** What whisper heard. The audio is zeroed once heard (rule 3). */
  async transcribe(audio: Float32Array, rate: number): Promise<string> {
    if (!this.#instance) throw new WhisperError('model_failed');
    if (this.#busy) throw new WhisperError('internal');
    this.#busy = true;
    const heard = resample(audio, rate, WHISPER_RATE);
    audio.fill(0);
    this.#lines = [];
    let waited = 0;
    const heartbeat = setInterval(
      () => this.#log(`still hearing after ${(waited += 10)} s`),
      10_000,
    );
    try {
      const done = new Promise<void>((resolve) => (this.#done = resolve));
      const rc = this.#module.full_default(this.#instance, heard, 'en', this.#threads, false);
      this.#log(`full_default returned ${rc}`);
      if (rc !== 0) throw new WhisperError('internal');
      await done;
      return this.#lines
        .filter((line) => TIMED_LINE.test(line))
        .map((line) => line.replace(TIMED_LINE, '').trim())
        .join(' ')
        .trim();
    } finally {
      clearInterval(heartbeat);
      heard.fill(0);
      this.#done = null;
      this.#busy = false;
    }
  }
}
