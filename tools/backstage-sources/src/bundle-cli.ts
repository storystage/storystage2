/**
 * Fetches the shipped Backstage that `backstage.lock.json` pins, and checks it (decision 0062).
 *
 *   pnpm backstage:fetch [folder] [--check-only]
 *
 * The folder defaults to `.backstage/` at the repository's root (ignored by git). The release
 * workflows run this before bundling the folder in the Tauri apps and the browser version.
 * `--check-only` checks a folder already fetched.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLED, checkBundle, validateLock, type BackstageLock } from './bundle.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const dest = resolve(args.find((a) => !a.startsWith('--')) ?? resolve(root, '.backstage'));

const lock = JSON.parse(
  readFileSync(resolve(root, 'backstage.lock.json'), 'utf8'),
) as BackstageLock;
const lockErrors = validateLock(lock);
if (lockErrors.length) {
  console.error(`backstage.lock.json is not valid:\n${lockErrors.join('\n')}`);
  process.exit(1);
}

if (!checkOnly) {
  const git = (...a: string[]) => execFileSync('git', a, { stdio: 'inherit' });
  const tmp = `${dest}.fetching`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const name of BUNDLED) rmSync(resolve(dest, name), { recursive: true, force: true });
  console.log(`Fetching ${lock.repository} at ${lock.commit.slice(0, 12)} into ${dest}…`);
  git('init', '--quiet', tmp);
  git(
    '-C',
    tmp,
    'fetch',
    '--quiet',
    '--depth',
    '1',
    `https://github.com/${lock.repository}.git`,
    lock.commit,
  );
  // Byte for byte: the pinned hashes are of the files as committed.
  git(
    '-c',
    'core.autocrlf=false',
    `--git-dir=${resolve(tmp, '.git')}`,
    `--work-tree=${dest}`,
    'checkout',
    '--quiet',
    'FETCH_HEAD',
    '--',
    ...BUNDLED,
  );
  rmSync(tmp, { recursive: true, force: true });
}

if (!existsSync(dest)) {
  console.error(`${dest} doesn't exist. Run without --check-only to fetch it.`);
  process.exit(1);
}
const problems = await checkBundle(dest, lock);
if (problems.length) {
  console.error(`The Backstage in ${dest} can't be bundled:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`Backstage ${lock.commit.slice(0, 12)} is ready to bundle, in ${dest}.`);
