/**
 * Lists Alice's gallery from a StoryStage 1 checkout for the licence audit (WP3.1).
 *
 *   node tools/convert-alice-models/src/list-gallery-cli.ts <storystage1> [--write <audit.md>]
 *
 * Without `--write` it prints the table. With it, it replaces the text between
 * `<!-- alice-gallery -->` and `<!-- /alice-gallery -->` in the audit file.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { galleryList, parseGalleryNames, renderGalleryTable } from './gallery.ts';

const [ss1, flag, audit] = process.argv.slice(2);
if (!ss1 || (flag !== undefined && (flag !== '--write' || !audit))) {
  console.error('Usage: list-gallery-cli.ts <storystage1 checkout> [--write <audit.md>]');
  process.exit(2);
}

const namesFile = join(
  ss1,
  'core/i18n/src/main/resources/org/lgna/story/resources/GalleryNames.properties',
);
const resourceDir = join(ss1, 'core/models/src/main/java/org/lgna/story/resources');
const names = parseGalleryNames(readFileSync(namesFile, 'utf8'));
const resources = new Map<string, string>();
for (const n of names) {
  const file = join(resourceDir, n.pkg, `${n.name}Resource.java`);
  if (existsSync(file)) resources.set(`${n.pkg}/${n.name}`, readFileSync(file, 'utf8'));
}
const models = galleryList(names, resources);
const table = renderGalleryTable(models);
const inSource = models.filter((m) => m.variants !== null).length;
const summary = `${models.length} models; ${inSource} with source in StoryStage 1.`;

if (!audit) {
  console.log(table);
  console.error(summary);
} else {
  const start = '<!-- alice-gallery -->';
  const end = '<!-- /alice-gallery -->';
  const text = readFileSync(audit, 'utf8');
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < a) {
    console.error(`${audit} has no ${start} … ${end} block.`);
    process.exit(1);
  }
  writeFileSync(audit, `${text.slice(0, a + start.length)}\n\n${table}\n\n${text.slice(b)}`);
  console.log(`Wrote appendix A: ${summary}`);
}
