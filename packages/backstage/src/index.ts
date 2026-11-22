/**
 * @storystage/backstage: Backstage: model manifest (ids, sections, classes, joints, licences), loader, thumbnails.
 *
 * Owner: S4. Workplan: WP3.
 *
 * WP0.8: the manifest contract (`manifest.ts`). WP3.3: the joint map (`joints.ts`) and the
 * skeleton mapper (`skeleton-map.ts`). WP3.9: device budgets (`budget.ts`). Reducing a model to
 * its budget is `@storystage/backstage/optimize`, kept apart so that reading the manifest doesn't
 * load glTF Transform. WP3c: the Prompter's catalogue (`catalogue.ts`) and credits (`credits.ts`), and opening a Backstage folder (`loader.ts`).
 */
export * from './manifest.ts';
export * from './joints.ts';
export * from './skeleton-map.ts';
export * from './budget.ts';
export * from './catalogue.ts';
export * from './credits.ts';
export * from './loader.ts';
export * from './alice-grounds.ts';
export * from './blob-backstage.ts';
