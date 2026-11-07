/**
 * Lists Alice's gallery from a StoryStage 1 checkout for the licence audit (WP3.1).
 *
 *   node tools/convert-alice-models/src/list-gallery-cli.ts <storystage1>
 *        [--jars <converter --list report>] [--write <audit.md>] [--csv <folder>]
 *
 * `--jars` takes the report from `java/ConvertAliceModels.java --list`, which reads every
 * model's variants from Alice's own jars, including the models StoryStage 1 has no source for.
 * Without `--write` or `--csv` it prints the table. `--write` replaces the text between
 * `<!-- alice-gallery -->` and `<!-- /alice-gallery -->` in the audit file. `--csv` writes the
 * lists for CMU (`docs/legal/letters/`): `cmu-models.csv`, the Alice models we ask about, and
 * `cmu-sims2-models-left-out.csv`, the models drawn wholly from The Sims 2's art.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  galleryList,
  isSims2Model,
  parseConverterList,
  parseGalleryNames,
  renderGalleryCsv,
  renderGalleryTable,
} from './gallery.ts';

const args = process.argv.slice(2);
const ss1 = args[0];
const option = (name: string) => {
  const i = args.indexOf(name);
  return i > 0 ? args[i + 1] : undefined;
};
const jars = option('--jars');
const audit = option('--write');
const csv = option('--csv');
if (
  !ss1 ||
  ss1.startsWith('--') ||
  (args.includes('--write') && !audit) ||
  (args.includes('--jars') && !jars) ||
  (args.includes('--csv') && !csv)
) {
  console.error(
    'Usage: list-gallery-cli.ts <storystage1 checkout> [--jars <report.json>] [--write <audit.md>] [--csv <folder>]',
  );
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
const fromJars = jars ? parseConverterList(readFileSync(jars, 'utf8')) : new Map();
const models = galleryList(names, resources, fromJars);
const table = renderGalleryTable(models);
const sims = models.filter(isSims2Model).length;
const summary = `${models.length} models: ${models.length - sims} Alice models, ${sims} drawn wholly from The Sims 2's art.`;

if (!audit && !csv) {
  console.log(table);
  console.error(summary);
}
if (audit) {
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
if (csv) {
  writeFileSync(join(csv, 'cmu-models.csv'), renderGalleryCsv(models, 'alice'));
  writeFileSync(join(csv, 'cmu-sims2-models-left-out.csv'), renderGalleryCsv(models, 'sims2'));
  console.log(`Wrote the CMU lists in ${csv}: ${summary}`);
}
