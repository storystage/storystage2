/**
 * Writes what the assets repository's MakeHuman build needs from `people.json`.
 *
 *   node tools/makehuman-export/src/export-cli.ts <backstage folder> [--only p01,p26]
 *
 * - `<folder>/generated/makehuman/people.json`: each person as MPFB2's dict, for the Blender
 *   script;
 * - `<folder>/sources/makehuman.json`: everyone as a Backstage source list, even with `--only`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportPeople } from './export.ts';
import { validatePeople, type Person } from './people.ts';

const args = process.argv.slice(2);
const dir = args[0];
const i = args.indexOf('--only');
const only = i > 0 ? args[i + 1]?.split(',') : undefined;
if (!dir || dir.startsWith('--') || (i > 0 && !only)) {
  console.error('Usage: export-cli.ts <backstage folder> [--only p01,p26]');
  process.exit(2);
}
const file = fileURLToPath(new URL('../people.json', import.meta.url));
const everyone = JSON.parse(readFileSync(file, 'utf8')) as Person[];
const checked = validatePeople(everyone);
if (!checked.ok) {
  console.error(`people.json is not valid:\n${checked.errors.join('\n')}`);
  process.exit(1);
}
const { toMake, sources } = exportPeople(everyone, only);
if (toMake.length === 0) {
  console.error(`No one in people.json is called ${only?.join(', ')}.`);
  process.exit(1);
}
mkdirSync(join(dir, 'generated/makehuman'), { recursive: true });
mkdirSync(join(dir, 'sources'), { recursive: true });
writeFileSync(join(dir, 'generated/makehuman/people.json'), `${JSON.stringify(toMake, null, 2)}\n`);
writeFileSync(join(dir, 'sources/makehuman.json'), `${JSON.stringify(sources, null, 2)}\n`);
console.log(
  `${toMake.length} people ready for Blender; ${sources.items.length} in the source list.`,
);
