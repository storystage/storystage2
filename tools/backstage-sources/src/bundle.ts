/**
 * The shipped Backstage a release bundles (decision 0062; spec 17, section 4b).
 *
 * `backstage.lock.json`, at the repository's root, pins the commit of `storystage/backstage-assets`
 * a release ships, with the SHA-256 of its `backstage.json` and `prompter-catalogue.txt`.
 * `pnpm backstage:fetch` (`bundle-cli.ts`) fetches exactly those files into `.backstage/`, and
 * `checkBundle` checks a fetched folder before anything bundles it.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MANIFEST_VERSION,
  catalogueText,
  validateManifest,
  type BackstageManifest,
} from '@storystage/backstage';

export interface BackstageLock {
  /** `owner/name` on GitHub. */
  readonly repository: string;
  /** The full commit SHA. */
  readonly commit: string;
  readonly manifestVersion: string;
  readonly manifestSha256: string;
  readonly catalogueSha256: string;
}

/** What a release bundles from the assets repository: nothing else is needed at run time. */
export const BUNDLED = [
  'backstage.json',
  'prompter-catalogue.txt',
  'models',
  'thumbnails',
  'sketches',
] as const;

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export function validateLock(json: unknown): string[] {
  const errors: string[] = [];
  const l = json as Partial<BackstageLock> | null;
  if (typeof l !== 'object' || l === null) return ['The lock must be an object.'];
  if (typeof l.repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(l.repository))
    errors.push('repository must be owner/name.');
  if (typeof l.commit !== 'string' || !/^[0-9a-f]{40}$/.test(l.commit))
    errors.push('commit must be a full 40-character SHA.');
  if (typeof l.manifestVersion !== 'string') errors.push('manifestVersion is missing.');
  for (const k of ['manifestSha256', 'catalogueSha256'] as const)
    if (typeof l[k] !== 'string' || !/^[0-9a-f]{64}$/.test(l[k]))
      errors.push(`${k} must be a SHA-256.`);
  return errors;
}

/**
 * Whether the apps' `backstage` protocol serves this path (S8's `is_served`, in
 * `storystage-classes`'s `backstage_files.rs`; spec 05, section 7): `/` between parts, each
 * of letters, digits, `.`, `_` and `-`, never `.` or `..`, none starting with a dot, at
 * most 255 characters. A file named otherwise would work in the browser version, but be missing
 * in the apps, so a bundle with one is refused.
 */
export function servedPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 255 &&
    path.split('/').every((part) => /^[A-Za-z0-9._-]+$/.test(part) && !part.startsWith('.'))
  );
}

/**
 * Checks a fetched Backstage folder against the lock: the two pinned files match their hashes,
 * the manifest is valid and of this code's version, every file it names is there under a name the
 * apps can serve (`servedPath`), and the
 * Prompter catalogue is exactly what this code makes of the manifest. Returns the problems, or
 * none.
 */
export async function checkBundle(dir: string, lock: BackstageLock): Promise<string[]> {
  const problems = validateLock(lock).map((e) => `backstage.lock.json: ${e}`);
  if (lock.manifestVersion !== MANIFEST_VERSION)
    problems.push(
      `backstage.lock.json pins manifest ${lock.manifestVersion}, but this code reads ${MANIFEST_VERSION}. Rebuild the assets and update the lock.`,
    );
  const read = async (name: string) =>
    existsSync(join(dir, name)) ? new Uint8Array(await readFile(join(dir, name))) : null;
  const manifestBytes = await read('backstage.json');
  const catalogueBytes = await read('prompter-catalogue.txt');
  if (!manifestBytes) return [...problems, 'backstage.json is missing.'];
  if (!catalogueBytes) return [...problems, 'prompter-catalogue.txt is missing.'];
  if (sha256(manifestBytes) !== lock.manifestSha256)
    problems.push("backstage.json doesn't match the SHA-256 in backstage.lock.json.");
  if (sha256(catalogueBytes) !== lock.catalogueSha256)
    problems.push("prompter-catalogue.txt doesn't match the SHA-256 in backstage.lock.json.");

  let manifest: BackstageManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    return [...problems, 'backstage.json is not JSON.'];
  }
  const checked = validateManifest(manifest);
  if (!checked.ok) return [...problems, ...checked.errors.map((e) => `backstage.json: ${e}`)];

  for (const item of manifest.items) {
    const files = [item.files.model, item.files.thumbnail, ...item.sketches.map((s) => s.file)];
    for (const f of files)
      if (!servedPath(f))
        problems.push(
          `${item.id}: ${f} has a name the apps can't serve. Use letters, digits, ".", "_" and "-".`,
        );
      else if (!existsSync(join(dir, f))) problems.push(`${item.id}: ${f} is missing.`);
  }
  if (new TextDecoder().decode(catalogueBytes) !== catalogueText(manifest))
    problems.push(
      "prompter-catalogue.txt isn't what this code makes of backstage.json. Rebuild the assets with this code, then update the lock.",
    );
  return problems;
}
