/**
 * Builds a Backstage folder from its source lists (WP3.7): fetches each item, pinned, writes
 * the models, `backstage.json`, `provenance.json`, the sketches and `sources-report.md`.
 *
 *   node tools/backstage-sources/src/cli.ts <backstage folder> [--only <source>]
 *
 * `--only` builds one source list, leaving every other item as it is.
 */
import { buildSources } from './build.ts';

const args = process.argv.slice(2);
const dir = args[0];
const i = args.indexOf('--only');
const only = i > 0 ? args[i + 1] : undefined;
if (!dir || dir.startsWith('--') || (i > 0 && !only)) {
  console.error('Usage: cli.ts <backstage folder> [--only <source>]');
  process.exit(2);
}
const report = await buildSources(dir, only ? { only } : {});
console.log(
  `${report.items} items built; ${report.sketches.written} sketches, ${report.sketches.flagged.length} to touch up. ` +
    'See sources-report.md and sketches/touch-up.md.',
);
