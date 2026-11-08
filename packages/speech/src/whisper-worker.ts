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
  onmessage: ((event: { data: ToWhisper }) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;
let core: WhisperCore | null = null;
let current: number | null = null;

const outOfMemory = (what: unknown) => /memory|oom|alloc/i.test(String(what));

function loadModule(script: string): Promise<WhisperModule> {
  return new Promise((resolve, reject) => {
    const Module: Record<string, unknown> = {
      print: (line: string) => core?.print(line),
      printErr: (line: string) => core?.print(line),
      mainScriptUrlOrBlob: script,
      locateFile: (path: string) => new URL(path, script).href,
      onRuntimeInitialized: () => resolve(Module as unknown as WhisperModule),
      onAbort: (what: unknown) => {
        scope.postMessage({
          type: 'error',
          id: current,
          code: outOfMemory(what) ? 'out_of_memory' : 'internal',
        });
        reject(new WhisperError('internal'));
      },
    };
    scope.Module = Module;
    try {
      scope.importScripts(script);
    } catch {
      reject(new WhisperError('model_failed'));
    }
  });
}

scope.onmessage = ({ data }) => {
  void (async () => {
    if (data.type === 'load') {
      try {
        const module = await loadModule(data.script);
        core = new WhisperCore(module, data.threads);
        core.load(new Uint8Array(data.model));
        scope.postMessage({ type: 'ready' });
      } catch {
        scope.postMessage({ type: 'error', id: null, code: 'model_failed' });
      }
      return;
    }
    current = data.id;
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
};
