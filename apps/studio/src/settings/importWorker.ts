/**
 * A fresh import worker for each import (spec 17, section 5). The worker's own code, with glTF
 * Transform and meshoptimizer, loads only inside it: the studio's bundle never holds it.
 */
import type { ImportWorker } from '@storystage/backstage-import/worker-client';

export const startImportWorker = (): ImportWorker =>
  new Worker(new URL('@storystage/backstage-import/worker', import.meta.url), {
    type: 'module',
  }) as unknown as ImportWorker;
