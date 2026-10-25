/**
 * Checks `people.json` against MakeHuman's CC0 system pack and rewrites the review table in
 * `people.md` (between `<!-- people -->` and `<!-- /people -->`).
 *
 *   node tools/makehuman-export/src/people-cli.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { peopleTable, validatePeople, type Person } from './people.ts';

const at = (f: string) => fileURLToPath(new URL(`../${f}`, import.meta.url));
const people = JSON.parse(readFileSync(at('people.json'), 'utf8')) as Person[];
const checked = validatePeople(people);
if (!checked.ok) {
  console.error(`people.json is not valid:\n${checked.errors.join('\n')}`);
  process.exit(1);
}
const page = readFileSync(at('people.md'), 'utf8');
const [start, end] = ['<!-- people -->', '<!-- /people -->'];
const a = page.indexOf(start);
const b = page.indexOf(end);
if (a < 0 || b < a) {
  console.error(`people.md has no ${start} … ${end} block.`);
  process.exit(1);
}
writeFileSync(
  at('people.md'),
  `${page.slice(0, a + start.length)}\n\n${peopleTable(people)}\n\n${page.slice(b)}`,
);
console.log(`people.md: ${people.length} people.`);
