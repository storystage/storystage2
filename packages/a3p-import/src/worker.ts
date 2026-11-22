/**
 * The Alice import's worker side (spec 15, section 3; spec 19): `serveAliceImports(port)` answers
 * each `importAlice` message with `importAliceWorld`'s result. `alice-worker.ts` runs it in a
 * real worker. An `.a3p` is untrusted, so it's read off the main thread, where a hostile or huge
 * file can't freeze the studio, and the studio's client stops it after 60 seconds (S4's
 * `runInWorker`). The import reads only the bytes it's sent and fetches nothing.
 */
import { importAliceWorld, type ImportResult } from './import.ts';
import { ALICE_IMPORT_BROKE, type AliceImportAnswer, type AliceImportMessage } from './messages.ts';

/** What the worker's side needs from its port: `self` in a worker, or one end of a channel. */
export interface WorkerPort {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

const isAliceImport = (data: unknown): data is AliceImportMessage =>
  typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'importAlice';

/** The worker's side: answers each `importAlice` message. Never throws: a failure is a refusal. */
export function serveAliceImports(port: WorkerPort): void {
  port.addEventListener('message', (event) => {
    if (!isAliceImport(event.data)) return;
    const { bytes, fileName, models } = event.data.request;
    let result: ImportResult;
    try {
      result = importAliceWorld(bytes, { fileName, models });
    } catch {
      result = { ok: false, problem: ALICE_IMPORT_BROKE };
    }
    const answer: AliceImportAnswer = { type: 'aliceResult', result };
    port.postMessage(answer);
  });
}
