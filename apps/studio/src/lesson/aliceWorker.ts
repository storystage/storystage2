/**
 * Opening an Alice world (spec 19; spec 15, section 3): a fresh worker for each import, which S6's
 * client ends after 60 seconds. The importer loads only inside it.
 */
import type { AliceModel } from '@storystage/a3p-import';
import type { ImportWorker } from '@storystage/a3p-import/worker-client';

export const startAliceWorker = (): ImportWorker =>
  new Worker(new URL('@storystage/a3p-import/worker', import.meta.url), {
    type: 'module',
  }) as unknown as ImportWorker;

/**
 * Backstage's models by Alice gallery key, for the import to find (`ImportOptions.models`). Empty
 * until the studio has the shipped Backstage (S8's `HostInterface.backstageFolder`): until then
 * every Alice model comes in as a labelled stand-in, sized as Alice had it, and the report says so.
 */
export const NO_ALICE_MODELS: ReadonlyMap<string, AliceModel> = new Map();
