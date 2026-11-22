/**
 * The studio's side of the Alice import's worker (spec 15, section 3; spec 19): `importAliceInWorker`
 * runs one import in a fresh worker and settles once, with the import's result, a refusal if the
 * worker fails, or a refusal after 60 seconds, through S4's `runInWorker`, so the time limit lives
 * in one place. It loads nothing heavy: only the message shapes and `runInWorker`. The importer
 * itself runs in the worker (`@storystage/a3p-import/worker`).
 */
import { runInWorker, type ImportWorker } from '@storystage/backstage-import/worker-client';
import type { AliceModel, ImportResult } from './import.ts';
import {
  ALICE_IMPORT_BROKE,
  ALICE_TOO_SLOW,
  type AliceImportAnswer,
  type AliceImportMessage,
} from './messages.ts';

export type { ImportWorker };

/**
 * Imports one Alice world in a fresh worker from `start`, and ends the worker when it answers,
 * fails or runs out of time. The file's bytes are copied in, so the caller keeps its own.
 * `models` is Backstage's models as data (`ImportOptions.models`), since the worker can't call
 * back to the page.
 */
export function importAliceInWorker(
  start: () => ImportWorker,
  bytes: Uint8Array,
  fileName: string,
  models: ReadonlyMap<string, AliceModel>,
  options: { readonly timeLimitMs?: number } = {},
): Promise<ImportResult> {
  const copy = bytes.slice();
  const message: AliceImportMessage = {
    type: 'importAlice',
    request: { bytes: copy, fileName, models },
  };
  return runInWorker<ImportResult>(start, message, [copy.buffer as ArrayBuffer], {
    answer: (data) => {
      const d = data as Partial<AliceImportAnswer> | null;
      return d?.type === 'aliceResult' && d.result ? d.result : undefined;
    },
    timedOut: () => ({ ok: false, problem: ALICE_TOO_SLOW }),
    failed: () => ({ ok: false, problem: ALICE_IMPORT_BROKE }),
    ...(options.timeLimitMs !== undefined ? { timeLimitMs: options.timeLimitMs } : {}),
  });
}
