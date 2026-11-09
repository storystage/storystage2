/**
 * The messages between the studio and the Alice import's worker (spec 15, section 3): plain data,
 * so they cross with a structured clone. The worker's side is `worker.ts`; the studio's side is
 * `worker-client.ts`, which never loads the importer itself.
 */
import type { AliceModel, ImportResult } from './import.ts';

/** The studio to the worker: an `.a3p` file's bytes, its name, and Backstage's models as data. */
export interface AliceImportMessage {
  readonly type: 'importAlice';
  readonly request: {
    readonly bytes: Uint8Array;
    readonly fileName: string;
    readonly models: ReadonlyMap<string, AliceModel>;
  };
}

/** The worker to the studio: `importAliceWorld`'s result. */
export interface AliceImportAnswer {
  readonly type: 'aliceResult';
  readonly result: ImportResult;
}

/** What the worker answers when the import itself broke: a bug here, never the file's fault. */
export const ALICE_IMPORT_BROKE = {
  code: 'broke',
  message: 'Something went wrong opening this Alice world, so it wasn’t opened. Please try again.',
} as const;
