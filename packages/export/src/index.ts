/**
 * @storystage/export: Frame-by-frame render to MP4, captions, title and credits; AR pack.
 *
 * Owner: S2 (S1: MP4 encoder module; S4: AR pack). Workplan: WP11, WP22.
 *
 * WP11a: the MP4 encoder module (`encoder/`, S1). WP11.4: the title card, captions and credits
 * (`film/`, S2).
 */
export * from './encoder/index.ts';
export * from './film/index.ts';
