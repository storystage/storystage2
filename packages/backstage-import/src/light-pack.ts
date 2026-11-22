/**
 * `@storystage/backstage-import/pack`: what the studio uses on the page, light enough for every
 * save: packing a film's class models (`pack.ts`) and writing a model pack
 * (`model-pack-file.ts`). Neither loads the import pipeline; `pack-light.test.ts` checks it.
 */
export * from './pack.ts';
export * from './model-pack-file.ts';
