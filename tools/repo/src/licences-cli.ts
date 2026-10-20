/**
 * `pnpm licences` checks every JavaScript dependency against the licence policy and checks that
 * NOTICE matches the lockfile. `pnpm notice` rewrites NOTICE. Rust crates are checked by
 * cargo-deny in the desktop workflow (apps/desktop/src-tauri/deny.toml).
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  describeProblem,
  findProblems,
  fromPnpmLicences,
  renderNotice,
  type LicenceException,
} from './licences.ts';

const here = (file: string) => new URL(`../${file}`, import.meta.url);
const list = (flag: '--prod' | '--dev') =>
  fromPnpmLicences(
    JSON.parse(execSync(`pnpm licenses list --json -r ${flag}`, { encoding: 'utf8' })),
  );

const linked = list('--prod');
const linkedNames = new Set(linked.map((d) => `${d.name}@${d.versions.join()}`));
const tools = list('--dev').filter((d) => !linkedNames.has(`${d.name}@${d.versions.join()}`));
const exceptions = JSON.parse(
  readFileSync(here('licence-exceptions.json'), 'utf8'),
) as LicenceException[];
const notice = renderNotice(readFileSync(here('notice-header.txt'), 'utf8'), linked, tools);

if (process.argv.includes('--write')) {
  writeFileSync('NOTICE', notice);
  console.log(`NOTICE written: ${linked.length} linked, ${tools.length} tools.`);
  process.exit(0);
}

const errors = findProblems(linked, tools, exceptions).map(describeProblem);
let current = '';
try {
  current = readFileSync('NOTICE', 'utf8').replace(/\r\n/g, '\n');
} catch {
  // A missing NOTICE is reported below.
}
if (current !== notice)
  errors.push('NOTICE does not match the lockfile: run `pnpm notice` and commit it.');

if (errors.length) {
  console.error(`Licence check failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(`Licences: OK (${linked.length} linked, ${tools.length} tools).`);
