// Checks the Android app bundle against Play's limits (workplan 15.8; decision 0062, update of 23
// Nov 2026; spec 05 section 7). It reads the bundle's entries, and bundletool's download sizes from
// the APK set made from it, and checks:
//
// - the bundle has the base module and the Backstage pack, and nothing else;
// - the Backstage is in the pack, and none of it in the base module;
// - the base module, the pack, and the two together are each within Play's limits.
//
//   node apps/desktop/scripts/android-bundle-sizes.mjs <app.aab> <app.apks> <bundletool.jar>
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PACK } from './android-asset-pack.mjs';

/**
 * Play's limits on compressed download size (decision 0062): 500 MB for the base module, 1.5 GB
 * for each asset pack, and 4 GB for everything installed with the app. In bytes, taking a MB as a
 * million bytes, the smaller reading.
 */
export const PLAY_LIMITS = { base: 500e6, pack: 1.5e9, installTime: 4e9 };

/** The folders in a bundle that aren't modules. */
const NOT_MODULES = new Set(['BUNDLE-METADATA', 'META-INF']);

/** The problems with a bundle's entry names, or none. */
export function entryProblems(names) {
  const problems = [];
  const modules = new Set(
    names.filter((name) => name.includes('/')).map((name) => name.split('/')[0]),
  );
  for (const folder of NOT_MODULES) modules.delete(folder);
  const want = ['base', PACK];
  const got = [...modules].sort();
  if (got.join() !== [...want].sort().join())
    problems.push(`The bundle's modules are ${got.join(', ')}, not ${want.join(', ')}.`);
  if (!names.includes(`${PACK}/assets/${PACK}/backstage.json`))
    problems.push(`The ${PACK} pack has no ${PACK}/backstage.json.`);
  const inBase = names.filter((name) => name.startsWith(`base/assets/${PACK}/`));
  if (inBase.length > 0)
    problems.push(
      `The base module has ${inBase.length} of the Backstage's files too, such as ${inBase[0]}.`,
    );
  return problems;
}

/** bundletool's `get-size total` output (`MIN,MAX` then a row of bytes): the largest. */
export function largest(csv) {
  const [head, row] = csv.trim().split(/\r?\n/);
  const max = head?.split(',').indexOf('MAX') ?? -1;
  const bytes = Number(row?.split(',')[max]);
  if (max < 0 || !Number.isSafeInteger(bytes) || bytes <= 0)
    throw new Error(`Not a size from bundletool: ${csv}`);
  return bytes;
}

const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

/**
 * Each size against its limit: one line each, and whether all are within. `base` is the base
 * module's download, and `together` the base module's and the pack's. bundletool always counts
 * the base module in, even with `--modules=backstage` alone (#723's first runs gave 348.4 MB for
 * that, from a 361.6 MB bundle whose base is 117.4 MB), so the pack is the difference.
 */
export function sizeLines({ base, together }) {
  const rows = [
    ['The base module', base, PLAY_LIMITS.base],
    [`The ${PACK} pack`, together - base, PLAY_LIMITS.pack],
    ['Everything installed with the app', together, PLAY_LIMITS.installTime],
  ];
  const lines = rows.map(
    ([what, bytes, limit]) =>
      `${bytes <= limit ? 'PASS' : 'FAIL'}  ${what}: ${mb(bytes)} to download, of ${mb(limit)}`,
  );
  return { lines, ok: rows.every(([, bytes, limit]) => bytes <= limit) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [aab, apks, jar] = process.argv.slice(2);
  if (!aab || !apks || !jar) {
    console.error('usage: android-bundle-sizes.mjs <app.aab> <app.apks> <bundletool.jar>');
    process.exit(2);
  }
  const names = execFileSync('unzip', ['-Z1', aab], { encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n')
    .filter(Boolean);
  const problems = entryProblems(names);
  for (const problem of problems) console.log(`FAIL  ${problem}`);
  const size = (module) =>
    largest(
      execFileSync(
        'java',
        ['-jar', jar, 'get-size', 'total', `--apks=${apks}`, `--modules=${module}`],
        { encoding: 'utf8' },
      ),
    );
  const base = size('base');
  const together = size(`base,${PACK}`);
  // What bundletool gives for the pack named alone, to show it counts the base module in.
  console.log(`bundletool, --modules=${PACK} alone: ${mb(size(PACK))}`);
  const { lines, ok } = sizeLines({ base, together });
  for (const line of lines) console.log(line);
  process.exit(problems.length === 0 && ok ? 0 : 1);
}
