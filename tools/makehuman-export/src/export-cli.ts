/**
 * Writes what the assets repository's MakeHuman build needs from `people.json`.
 *
 *   node tools/makehuman-export/src/export-cli.ts <backstage folder> [--only p01,p26]
 *
 * - `<folder>/generated/makehuman/people.json`: each person as MPFB2's dict, for the Blender
 *   script;
 * - `<folder>/sources/makehuman.json`: the people as a Backstage source list.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { humanInfo, sourceList } from './human-info.ts';
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
const people = only ? everyone.filter((p) => only.includes(p.id)) : everyone;
if (people.length === 0) {
  console.error(`No one in people.json is called ${only?.join(', ')}.`);
  process.exit(1);
}
mkdirSync(join(dir, 'generated/makehuman'), { recursive: true });
mkdirSync(join(dir, 'sources'), { recursive: true });
writeFileSync(
  join(dir, 'generated/makehuman/people.json'),
  `${JSON.stringify(people.map(humanInfo), null, 2)}\n`,
);
writeFileSync(
  join(dir, 'sources/makehuman.json'),
  `${JSON.stringify(sourceList(people), null, 2)}\n`,
);
console.log(`${people.length} people ready for Blender.`);
