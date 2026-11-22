/**
 * Opening an Alice world (spec 19; spec 15, section 3): a fresh worker for each import, which S6's
 * client ends after 60 seconds. The importer loads only inside it.
 */
import type { AliceModel } from '@storystage/a3p-import';
import { aliceModelsFrom } from '@storystage/a3p-import/models';
import type { ImportWorker } from '@storystage/a3p-import/worker-client';
import { openBackstage } from '@storystage/backstage';
import type { HostInterface } from '@storystage/host';

export const startAliceWorker = (): ImportWorker =>
  new Worker(new URL('@storystage/a3p-import/worker', import.meta.url), {
    type: 'module',
  }) as unknown as ImportWorker;

/** No models to find: every Alice model comes in as a labelled stand-in, sized as Alice had it. */
export const NO_ALICE_MODELS: ReadonlyMap<string, AliceModel> = new Map();

/**
 * Backstage's models by Alice gallery key, for the import to find (S6's `aliceModelsFrom`): the
 * shipped Backstage's Alice models (S8's `backstageFolder`). Where it can't be read, none, so each
 * model is a stand-in and the report says so. It's read once and kept.
 */
export function aliceModelSource(
  host: HostInterface,
  options: { readonly fetch?: typeof globalThis.fetch } = {},
): () => Promise<ReadonlyMap<string, AliceModel>> {
  let reading: Promise<ReadonlyMap<string, AliceModel>> | null = null;
  return () =>
    (reading ??=
      host.backstageFolder === ''
        ? Promise.resolve(NO_ALICE_MODELS)
        : openBackstage(host.backstageFolder, options).then(
            aliceModelsFrom,
            () => NO_ALICE_MODELS,
          ));
}
