/**
 * WP3.11: the import runs in a Web Worker of its own (`00-architecture.md`, section 3; spec 15,
 * section 3.4), so a hostile or huge model can't freeze the studio, and it's stopped after 60
 * seconds (spec 17, section 5).
 *
 * This is the worker's side: `serveImports(port, tools)` answers each `import` message with
 * `importModel`'s result. `import-worker.ts` runs it in a real worker with the browser's tools.
 * The studio's side, `importInWorker`, is in `worker-client.ts`, apart, so the studio never loads
 * `importModel`.
 *
 * The worker has no network of its own to use: the import reads only the bytes it's sent, and
 * the app's content security policy blocks requests from workers as well (F9).
 */
import { importModel, type ImportResult, type ImportTools } from './import.ts';
import { IMPORT_BROKE, type ImportAnswer, type ImportMessage } from './worker-client.ts';

/** What the worker's side needs from its port: `self` in a worker, or one end of a channel. */
export interface WorkerPort {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

const isImport = (data: unknown): data is ImportMessage =>
  typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'import';

/** Each result's bytes, handed over rather than copied. */
function transferable(result: ImportResult): Transferable[] {
  return result.ok ? result.files.map((f) => f.bytes.buffer as ArrayBuffer) : [];
}

/** The worker's side: answers each `import` message. Never throws: a failure is a refusal. */
export function serveImports(port: WorkerPort, tools: ImportTools): void {
  port.addEventListener('message', (event) => {
    if (!isImport(event.data)) return;
    const { files, choices, taken } = event.data.request;
    void importModel(new Map(files), choices, tools, new Set(taken))
      .catch((): ImportResult => ({ ok: false, problems: [IMPORT_BROKE] }))
      .then((result) => {
        const answer: ImportAnswer = { type: 'result', result };
        port.postMessage(answer, transferable(result));
      });
  });
}
