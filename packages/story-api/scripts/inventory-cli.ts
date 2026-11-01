/**
 * Regenerates `palette.json` from an Alice or StoryStage 1 checkout. Runs by hand, offline:
 *
 *   node packages/story-api/scripts/inventory-cli.ts <checkout>
 *
 * Nothing in CI or the app runs it, so neither needs Alice's source.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInventory } from '../src/alice/inventory.ts';

const checkout = process.argv[2];
if (!checkout) {
  console.error('Usage: node inventory-cli.ts <path to an Alice or StoryStage 1 checkout>');
  process.exit(1);
}

const story = join(checkout, 'core/story-api/src/main/java/org/lgna/story');
const files = new Map<string, string>();
for (const dir of [story, join(story, 'event')]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.java')) {
      files.set(join(dir, entry.name), readFileSync(join(dir, entry.name), 'utf8'));
    }
  }
}

const commit = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const inventory = buildInventory(files);
const out = join(dirname(fileURLToPath(import.meta.url)), '../src/alice/palette.json');
const source = {
  repository: 'https://github.com/storystage/storystage',
  commit,
  path: 'core/story-api/src/main/java/org/lgna/story',
  rule: 'Public, non-static methods with visibility PRIME_TIME or no @MethodTemplate',
};
writeFileSync(out, `${JSON.stringify({ source, ...inventory }, null, 2)}\n`);

const members = inventory.classes.flatMap((c) => c.members);
const count = (kind: string) => members.filter((m) => m.kind === kind).length;
console.log(
  `${inventory.classes.length} classes: ${count('procedure')} procedures, ` +
    `${count('function')} functions, ${count('event')} events ` +
    `(${members.filter((m) => !m.marked).length} unmarked)`,
);
