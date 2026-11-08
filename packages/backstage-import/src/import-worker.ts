/**
 * The import worker's entry (spec 17, section 5): `new Worker(new URL(...), { type: 'module' })`
 * from the studio, through `importInWorker`. It answers imports with the browser's own picture
 * tools.
 */
import { browserImageTools } from './browser.ts';
import { serveImports, type WorkerPort } from './worker.ts';

serveImports(globalThis as unknown as WorkerPort, browserImageTools());
