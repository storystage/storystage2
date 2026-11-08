/**
 * The whisper worker's entry (`docs/spec/06-speech.md` section 1.2). A classic worker, because
 * whisper.cpp's Emscripten build expects a global `Module` and is loaded with `importScripts`.
 * Its own threads are told where the script is (`mainScriptUrlOrBlob`), since `self.location`
 * is this worker, not whisper.
 */
import { WhisperCore, WhisperError, type WhisperModule } from './whisper-core.ts';
import type { FromWhisper, ToWhisper } from './whisper-protocol.ts';

interface WorkerScope {
  Module?: Record<string, unknown>;
  importScripts(...urls: string[]): void;
  postMessage(message: FromWhisper): void;
  addEventListener(type: 'message', listener: (event: { data: ToWhisper }) => void): void;
}

const scope = globalThis as unknown as WorkerScope;
let core: WhisperCore | null = null;
let current: number | null = null;
let verbose = false;
const log = (line: string) => {
  if (verbose) scope.postMessage({ type: 'log', line });
};

const outOfMemory = (what: unknown) => /memory|oom|alloc/i.test(String(what));

/** In verbose mode: log each thread worker whisper starts, and any error it raises. */
function watchThreads(): void {
  const g = globalThis as unknown as {
    Worker: new (url: string | URL, options?: WorkerOptions) => Worker;
  };
  const Original = g.Worker;
  g.Worker = class extends Original {
    constructor(url: string | URL, options?: WorkerOptions) {
      log(`thread worker ${String(url)} ${options?.name ?? ''}`);
      super(url, options);
      this.addEventListener('error', (e) => log(`thread worker error: ${e.message}`));
    }
  };
}

function loadModule(script: string): Promise<WhisperModule> {
  return new Promise((resolve, reject) => {
    const Module: Record<string, unknown> = {
      print: (line: string) => {
        log(line);
        core?.print(line);
      },
      printErr: (line: string) => {
        log(line);
        core?.print(line);
      },
      mainScriptUrlOrBlob: script,
      locateFile: (path: string) => new URL(path, script).href,
      onRuntimeInitialized: () => {
        log('whisper runtime ready');
        resolve(Module as unknown as WhisperModule);
      },
      onAbort: (what: unknown) => {
        log(`whisper aborted: ${String(what)}`);
        scope.postMessage({
          type: 'error',
          id: current,
          code: outOfMemory(what) ? 'out_of_memory' : 'internal',
        });
        reject(new WhisperError('internal'));
      },
    };
    scope.Module = Module;
    if (verbose) watchThreads();
    try {
      log(`loading ${script}`);
      scope.importScripts(script);
      log('script loaded');
    } catch (error) {
      log(`script failed: ${String(error)}`);
      reject(new WhisperError('model_failed'));
    }
  });
}

// A listener, not `onmessage`: whisper's script may set `self.onmessage` for itself.
scope.addEventListener('message', ({ data }) => {
  // Only this protocol's messages; anything else isn't for this listener.
  if (typeof data !== 'object' || data === null || !('type' in data)) return;
  void (async () => {
    if (data.type === 'load') {
      verbose = data.verbose === true;
      try {
        const module = await loadModule(data.script);
        core = new WhisperCore(module, data.threads, log);
        core.load(new Uint8Array(data.model));
        log('model loaded');
        scope.postMessage({ type: 'ready' });
      } catch (error) {
        log(`load failed: ${String(error)}`);
        scope.postMessage({ type: 'error', id: null, code: 'model_failed' });
      }
      return;
    }
    current = data.id;
    log(`transcribing ${data.audio.length} samples at ${data.rate} Hz`);
    try {
      if (!core) throw new WhisperError('model_failed');
      const text = await core.transcribe(data.audio, data.rate);
      scope.postMessage({ type: 'text', id: data.id, text });
    } catch (error) {
      const code =
        error instanceof WhisperError
          ? error.code
          : outOfMemory(error)
            ? 'out_of_memory'
            : 'internal';
      scope.postMessage({ type: 'error', id: data.id, code });
    } finally {
      current = null;
    }
  })();
});
