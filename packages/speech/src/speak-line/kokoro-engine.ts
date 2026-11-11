/**
 * The speak line engine on the main thread (spec 06, 4.6): a `SpeechEngine` backed by Kokoro in
 * a worker. Loaded on first use and let go with `dispose` when speak line isn't in use, so it
 * never sits in memory beside whisper on a 4 GB Chromebook.
 */
import type { SpeechEngine } from './lines.ts';
import { KOKORO_SAMPLE_RATE } from './kokoro-core.ts';
import type { FromKokoro, KokoroOptions, KokoroPlaces, ToKokoro } from './kokoro-protocol.ts';
import type { Accent } from './presets.ts';

/** The parts of `Worker` used, so tests can give a fake. */
export interface KokoroWorker {
  postMessage(message: ToKokoro): void;
  onmessage: ((event: { data: FromKokoro }) => void) | null;
  /** A worker that fails to start (a bad script, say) says so here, not with a message. */
  onerror: ((event: { message?: string }) => void) | null;
  terminate(): void;
}

export interface KokoroEngineOptions extends KokoroOptions {
  /** Kokoro's progress while loading, for diagnosis. */
  readonly onLog?: (line: string) => void;
  /** Starts the worker; tests give a fake. */
  readonly start?: () => KokoroWorker;
}

const startWorker = (): KokoroWorker =>
  new Worker(new URL('./kokoro-worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as KokoroWorker;

export class KokoroEngine implements SpeechEngine {
  readonly sampleRate = KOKORO_SAMPLE_RATE;
  readonly #places: KokoroPlaces;
  readonly #options: KokoroEngineOptions;
  readonly #start: () => KokoroWorker;
  #worker: KokoroWorker | null = null;
  #ready: Promise<number> | null = null;
  #next = 1;
  readonly #waiting = new Map<
    number,
    { resolve: (s: Float32Array) => void; reject: (e: Error) => void }
  >();

  constructor(places: KokoroPlaces, options: KokoroEngineOptions = {}) {
    this.#places = places;
    this.#options = options;
    this.#start = options.start ?? startWorker;
  }

  /** Loads Kokoro if it isn't loaded; resolves with how long loading took, in milliseconds. */
  load(): Promise<number> {
    if (this.#ready) return this.#ready;
    const worker = this.#start();
    this.#worker = worker;
    this.#ready = new Promise<number>((resolve, reject) => {
      const fail = (message: string) => {
        reject(new Error(message));
        this.dispose();
      };
      worker.onerror = (e) => fail(e.message || 'The speak line worker failed to start.');
      worker.onmessage = ({ data: m }) => {
        if (m.type === 'log') this.#options.onLog?.(m.line);
        else if (m.type === 'ready') resolve(m.loadMs);
        else if (m.type === 'spoken') this.#settle(m.id)?.resolve(m.samples);
        else if (m.id === undefined) fail(m.message);
        else this.#settle(m.id)?.reject(new Error(m.message));
      };
    });
    const threads = this.#options.threads;
    worker.postMessage({
      type: 'load',
      places: this.#places,
      ...(threads === undefined ? {} : { options: { threads } }),
    });
    return this.#ready;
  }

  #settle(id: number) {
    const w = this.#waiting.get(id);
    this.#waiting.delete(id);
    return w;
  }

  async speak(
    text: string,
    voice: { readonly base: string; readonly accent: Accent },
  ): Promise<Float32Array> {
    await this.load();
    const worker = this.#worker;
    // Closed while loading finished.
    if (!worker) throw new Error('Speak line was closed.');
    const id = this.#next++;
    return new Promise<Float32Array>((resolve, reject) => {
      this.#waiting.set(id, { resolve, reject });
      worker.postMessage({ type: 'speak', id, text, base: voice.base, accent: voice.accent });
    });
  }

  /** Lets Kokoro go: the worker ends, and lines still waiting fail. */
  dispose(): void {
    this.#worker?.terminate();
    this.#worker = null;
    this.#ready = null;
    for (const w of this.#waiting.values()) w.reject(new Error('Speak line was closed.'));
    this.#waiting.clear();
  }
}
