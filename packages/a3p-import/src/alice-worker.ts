/**
 * The Alice import's worker entry (spec 15, section 3): the studio starts it with
 * `new Worker(new URL('@storystage/a3p-import/worker', import.meta.url), { type: 'module' })`
 * and talks to it through `importAliceInWorker` (`@storystage/a3p-import/worker-client`).
 */
import { serveAliceImports, type WorkerPort } from './worker.ts';

serveAliceImports(globalThis as unknown as WorkerPort);
