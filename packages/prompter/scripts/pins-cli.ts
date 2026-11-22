/**
 * Writes the gate's pins (`docs/spec/04-prompter.md` section 1.9).
 *
 *   pnpm prompter:pins [--fetch | --catalogue <file>]
 *
 * `--fetch` first fetches `prompter-catalogue.json` for the commit `backstage.lock.json` pins, and
 * `--catalogue` takes one already fetched. Either way its SHA-256 must be the lock's
 * `catalogueJsonSha256`, and it is written, compact, to `src/shipped-catalogue.ts` (section 2.7).
 * Then `apps/desktop/src-tauri/gate/pins.json` is written from the system prompt, the tools and
 * the mode settings as they now stand, with `gate/fixtures/release-request.json`, a request made
 * with them.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const CATALOGUE_FILE = fileURLToPath(new URL('../src/shipped-catalogue.ts', import.meta.url));
const PINS_FILE = `${root}apps/desktop/src-tauri/gate/pins.json`;
const REQUEST_FILE = `${root}apps/desktop/src-tauri/gate/fixtures/release-request.json`;
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const args = process.argv.slice(2);
const lock = JSON.parse(readFileSync(`${root}backstage.lock.json`, 'utf8')) as {
  repository: string;
  commit: string;
  catalogueJsonSha256?: string;
};

async function catalogue(): Promise<string | null> {
  const at = args.indexOf('--catalogue');
  if (at >= 0) return readFileSync(args[at + 1]!, 'utf8');
  if (!args.includes('--fetch')) return null;
  const url = `https://raw.githubusercontent.com/${lock.repository}/${lock.commit}/prompter-catalogue.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't fetch ${url}: ${response.status}`);
  return await response.text();
}

const text = await catalogue();
if (text !== null) {
  if (lock.catalogueJsonSha256 === undefined || sha256(text) !== lock.catalogueJsonSha256) {
    console.error(`That catalogue isn't the one backstage.lock.json pins (${lock.commit}).`);
    process.exit(1);
  }
  // Compact, a third smaller in the studio's bundle; the test prints it back to the pinned bytes.
  const compact = JSON.stringify(JSON.parse(text));
  const literal = compact.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  const source = `/**
 * The shipped Backstage catalogue: \`prompter-catalogue.json\` from ${lock.repository}
 * at the commit \`backstage.lock.json\` pins, compact. Made by \`pnpm prompter:pins --fetch\`; don't
 * edit it by hand.
 */
import type { Catalogue } from '@storystage/backstage';

export const SHIPPED_CATALOGUE_COMMIT = '${lock.commit}';

export const SHIPPED_CATALOGUE: Catalogue = JSON.parse(\`${literal}\`) as Catalogue;
`;
  const options = (await prettier.resolveConfig(CATALOGUE_FILE)) ?? {};
  writeFileSync(
    CATALOGUE_FILE,
    await prettier.format(source, { ...options, filepath: CATALOGUE_FILE }),
  );
  console.log(`Wrote ${CATALOGUE_FILE}`);
}

// Imported after the catalogue is written, so the pins use it.
const { makePins, releaseRequest } = await import('../src/pins.ts');
for (const [file, value] of [
  [PINS_FILE, makePins(sha256)],
  [REQUEST_FILE, releaseRequest()],
] as const) {
  const options = (await prettier.resolveConfig(file)) ?? {};
  writeFileSync(file, await prettier.format(JSON.stringify(value), { ...options, filepath: file }));
  console.log(`Wrote ${file}`);
}
