/**
 * Fetches Alice's 34 starter projects, WP9's test worlds, into a folder:
 *
 *   node packages/a3p-import/scripts/fetch-starters.ts <folder>
 *
 * They come from StoryStage 1 (storystage/storystage, a fork of Alice 3), at the commit
 * `starters.json` pins, and each is checked against its SHA-256 there. They're Carnegie Mellon's
 * files, so they're fetched for the tests rather than kept in this repository while the licence
 * audit (WP17.1) is open. A file already in the folder with the right SHA-256 is kept, not
 * fetched again, so CI's cache needs no network. `--write <folder> <commit>` writes
 * `starters.json` from files already there.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface Manifest {
  readonly repository: string;
  readonly commit: string;
  readonly folder: string;
  readonly files: readonly {
    readonly name: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
}

const here = new URL('..', import.meta.url);
const manifestPath = new URL('starters.json', here);
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function fetchAll(folder: string) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  await mkdir(folder, { recursive: true });
  let fetched = 0;
  for (const file of manifest.files) {
    const path = join(folder, file.name);
    if (existsSync(path) && sha256(new Uint8Array(await readFile(path))) === file.sha256) continue;
    const url = `https://raw.githubusercontent.com/${manifest.repository}/${manifest.commit}/${manifest.folder}/${file.name}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${file.name}: ${response.status} from ${url}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.bytes)
      throw new Error(`${file.name} isn't the file starters.json names.`);
    await writeFile(path, bytes);
    fetched++;
  }
  const kept = manifest.files.length - fetched;
  console.log(
    `Starter projects in ${folder}: ${fetched} fetched, ${kept} already there and checked.`,
  );
}

async function writeManifest(folder: string, commit: string) {
  const names = (await readdir(folder)).filter((n) => n.toLowerCase().endsWith('.a3p')).sort();
  const files = [];
  for (const name of names) {
    const bytes = new Uint8Array(await readFile(join(folder, name)));
    files.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const manifest: Manifest = {
    repository: 'storystage/storystage',
    commit,
    folder: 'core/resources/src/application/resources/starter-projects',
    files,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Wrote starters.json: ${files.length} files at ${commit}.`);
}

const [first, second, third] = process.argv.slice(2);
if (first === '--write' && second && third) await writeManifest(second, third);
else if (first) await fetchAll(first);
else {
  console.error('Usage: fetch-starters.ts <folder>, or --write <folder> <commit>');
  process.exitCode = 2;
}
