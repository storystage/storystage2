/**
 * The studio's side of the whisper worker: a `Recogniser` for dictation (`docs/spec/06-speech.md`
 * sections 1.2 and 1.8). The model and the audio are transferred to the worker, so the studio
 * keeps no copy. Ending the recogniser ends the worker, which gives its memory back.
 */
import { DictationError, type Recogniser } from './dictation.ts';
import type { FromWhisper, ToWhisper } from './whisper-protocol.ts';

/** The parts of `Worker` this uses. */
export interface WorkerLike {
  postMessage(message: ToWhisper, transfer: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: FromWhisper }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

export interface WhisperWorkerOptions {
  /** whisper.cpp's built `main.js`, served by the app itself. */
  readonly script: string;
  /** Default: the worker beside this file. */
  readonly makeWorker?: () => WorkerLike;
  /** Default: the device's cores, at most 4 (section 1.2). */
  readonly threads?: number;
  /** Hears each stage and whisper's printed lines, for diagnosing a build. */
  readonly onLog?: (line: string) => void;
}

const defaultWorker = (): WorkerLike =>
  new Worker(new URL('./whisper-worker.ts', import.meta.url)) as unknown as WorkerLike;

const defaultThreads = () =>
  Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency as number | undefined) ?? 4));

/** Makes the `recogniser` that `createDictation` takes. */
export function whisperRecogniser(
  options: WhisperWorkerOptions,
): (model: ArrayBuffer) => Promise<Recogniser> {
  return (model) =>
    new Promise<Recogniser>((resolveLoad, rejectLoad) => {
      const worker = (options.makeWorker ?? defaultWorker)();
      const pending = new Map<
        number,
        { resolve: (text: string) => void; reject: (e: DictationError) => void }
      >();
      let next = 0;
      let loaded = false;
      let dead = false;

      const fail = (code: DictationError['code']) => {
        dead = true;
        const error = new DictationError(code);
        if (!loaded)
          rejectLoad(new DictationError(code === 'out_of_memory' ? code : 'model_failed'));
        for (const p of pending.values()) p.reject(error);
        pending.clear();
        worker.terminate();
      };

      worker.onerror = (event) =>
        fail(/memory|oom|alloc/i.test(event.message ?? '') ? 'out_of_memory' : 'internal');
      worker.onmessage = ({ data }) => {
        if (typeof data !== 'object' || data === null || !('type' in data)) {
          options.onLog?.(`unexpected message: ${JSON.stringify(data).slice(0, 200)}`);
        } else if (data.type === 'log') {
          options.onLog?.(data.line);
        } else if (data.type === 'ready') {
          loaded = true;
          resolveLoad(recogniser);
        } else if (data.type === 'text') {
          pending.get(data.id)?.resolve(data.text);
          pending.delete(data.id);
        } else if (data.id === null) {
          rejectLoad(new DictationError(data.code));
          dead = true;
          worker.terminate();
        } else if (data.code === 'out_of_memory') {
          fail('out_of_memory');
        } else {
          pending.get(data.id)?.reject(new DictationError(data.code));
          pending.delete(data.id);
        }
      };

      const recogniser: Recogniser = {
        transcribe(audio, rate) {
          if (dead) return Promise.reject(new DictationError('out_of_memory'));
          const id = ++next;
          return new Promise<string>((resolve, reject) => {
            pending.set(id, { resolve, reject });
            worker.postMessage({ type: 'transcribe', id, audio, rate }, [audio.buffer]);
          });
        },
        end() {
          dead = true;
          for (const p of pending.values()) p.reject(new DictationError('cancelled'));
          pending.clear();
          worker.terminate();
        },
      };

      worker.postMessage(
        {
          type: 'load',
          script: options.script,
          model,
          threads: options.threads ?? defaultThreads(),
          ...(options.onLog ? { verbose: true } : {}),
        },
        [model],
      );
    });
}
