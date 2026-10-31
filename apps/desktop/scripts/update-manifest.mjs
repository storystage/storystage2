// Builds and changes the update manifests (spec 05 sections 4.2 to 4.4). Used by release.yml and
// channel.yml. The functions are tested in update-manifest.test.mjs.
//
//   node update-manifest.mjs build <version> <folder with bundles and .sig files> <out.json>
//   node update-manifest.mjs rollout <manifest.json> <percent>
//   node update-manifest.mjs rollback <good manifest.json> <bad version> ...

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASES = 'https://github.com/storystage/storystage2/releases/download';

/** Which file serves which platform. The macOS build is universal, so it serves both. */
const BUNDLES = [
  { suffix: '-setup.exe', platforms: ['windows-x86_64'] },
  { suffix: '.app.tar.gz', platforms: ['darwin-aarch64', 'darwin-x86_64'] },
];

/** A release's manifest from the names of its bundles, and their signatures by name. */
export function buildManifest(version, names, signatures, date) {
  const platforms = {};
  for (const { suffix, platforms: keys } of BUNDLES) {
    const name = names.find((n) => n.endsWith(suffix));
    if (!name) throw new Error(`No bundle ending ${suffix}`);
    // GitHub changes spaces in the names of release files, so the URL would point at nothing.
    if (name.includes(' ')) throw new Error(`Rename ${name}: release files have no spaces`);
    const signature = signatures[name];
    if (!signature) throw new Error(`No signature for ${name}`);
    const url = `${RELEASES}/v${version}/${encodeURIComponent(name)}`;
    for (const key of keys) platforms[key] = { signature, url };
  }
  return { version, pub_date: date, platforms };
}

/** The same build, offered to `percent` of devices. */
export function withRollout(manifest, percent) {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new Error(`A rollout is a whole number from 0 to 100, not ${percent}`);
  }
  return { ...manifest, rollout: percent };
}

/** The last good build, with the bad versions withdrawn: the whole of a rollback (4.3). */
export function withRollback(goodManifest, badVersions) {
  if (badVersions.length === 0) throw new Error('Name the version to withdraw');
  if (badVersions.includes(goodManifest.version)) {
    throw new Error(`${goodManifest.version} is the build being restored`);
  }
  const { rollout: _rollout, ...manifest } = goodManifest;
  const withdrawn = [...new Set([...(goodManifest.withdrawn ?? []), ...badVersions])];
  return { ...manifest, withdrawn };
}

function main([command, ...args]) {
  const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
  const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  if (command === 'build') {
    const [version, folder, out] = args;
    const names = readdirSync(folder);
    const signatures = Object.fromEntries(
      names
        .filter((name) => name.endsWith('.sig'))
        .map((name) => [name.slice(0, -4), readFileSync(join(folder, name), 'utf8').trim()]),
    );
    write(out, buildManifest(version, names, signatures, new Date().toISOString()));
  } else if (command === 'rollout') {
    const [path, percent] = args;
    write(path, withRollout(read(path), Number(percent)));
  } else if (command === 'rollback') {
    const [path, ...badVersions] = args;
    write(path, withRollback(read(path), badVersions));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
