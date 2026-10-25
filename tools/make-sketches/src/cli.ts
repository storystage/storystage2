/**
 * Draws the storyboard sketches for a Backstage folder (WP10.5).
 *
 *   node tools/make-sketches/src/cli.ts <backstage folder> [--dry-run]
 *
 * Writes `sketches/…/*.svg`, each item's `sketches` in `backstage.json`, and the touch-up list
 * `sketches/touch-up.md`. With `--dry-run` it draws everything and reports, but writes nothing.
 */
import { makeSketches } from './make-sketches.ts';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
if (!dir || args.some((a) => a.startsWith('--') && a !== '--dry-run')) {
  console.error('Usage: cli.ts <backstage folder> [--dry-run]');
  process.exit(2);
}
const report = await makeSketches(dir, { write: !args.includes('--dry-run') });
console.log(
  `${report.manifest.items.length} items, ${report.written} sketches; ` +
    `${report.overridden.length} replaced by hand; ${report.flagged.length} to touch up` +
    (report.unposed.length ? `; ${report.unposed.length} cast without poses` : '') +
    '. See sketches/touch-up.md.',
);
