/**
 * @storystage/export: Frame-by-frame render to MP4, captions, title and credits; AR pack.
 *
 * Owner: S2 (S1: MP4 encoder module; S4: AR pack). Workplan: WP11, WP22.
 *
 * WP11a: the MP4 encoder module (`encoder/`, S1). Captions, titles and credits arrive with WP11b.
 */
export * from './encoder/index.ts';
