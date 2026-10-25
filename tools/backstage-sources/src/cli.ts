/**
 * Builds a Backstage folder from its source lists (WP3.7): fetches each item, pinned, writes
 * the models, `backstage.json`, `provenance.json`, the sketches and `sources-report.md`.
 *
 *   node tools/backstage-sources/src/cli.ts <backstage folder>
 */
import { buildSources } from './build.ts';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: cli.ts <backstage folder>');
  process.exit(2);
}
const report = await buildSources(dir);
console.log(
  `${report.items} items built; ${report.sketches.written} sketches, ${report.sketches.flagged.length} to touch up. ` +
    'See sources-report.md and sketches/touch-up.md.',
);
