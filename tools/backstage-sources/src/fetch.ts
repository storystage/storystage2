/**
 * Fetches one source item's model, pinned (see `sources.ts`), and records the SHA-256 of every
 * file fetched for the provenance record. A .gltf and its files are packed into one binary glTF;
 * .glb and .vrm files are kept byte for byte. A generated model (MakeHuman) is read from the
 * uncommitted `generated/` folder, or, when that isn't there, from its committed `models/` file.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import type { SourceItem } from './sources.ts';

export type Fetcher = (url: string) => Promise<Uint8Array>;

/** A fetch that failed in a way worth trying again: the network, or the server's own error. */
class Passing extends Error {}

const once: Fetcher = async (url) => {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Passing(`Could not reach ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const message = `Could not fetch ${url}: ${res.status} ${res.statusText}`;
    throw res.status === 401 || res.status === 403 ? new Error(message) : new Passing(message);
  }
  return new Uint8Array(await res.arrayBuffer());
};

/**
 * Tries a fetch again after a dropped connection or a server error, waiting longer each time
 * (1, 2, then 4 seconds), up to `tries` in all. Only a refusal (401, 403) fails at once; every
 * other failing status is tried again, a missing file (404) included, since a gateway can give
 * one for a moment, so a file truly gone (404, 410, 451) takes about 7 seconds to fail. The CI
 * build lost three runs on 19 Nov 2026 to Arweave hosts dropping a connection, and one on 20 Nov
 * to a 404 for a file that answered seconds later. Every fetch is still checked against its pin.
 */
export function withRetries(
  fetcher: Fetcher,
  tries = 4,
  wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
): Fetcher {
  return async (url) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fetcher(url);
      } catch (e) {
        if (!(e instanceof Passing) || attempt >= tries) throw e;
        await wait(1000 * 2 ** (attempt - 1));
      }
    }
  };
}

export const httpFetch: Fetcher = withRetries(once);

/** For tests: a failure worth trying again. */
export const passingFailure = (message: string): Error => new Passing(message);

export interface Fetched {
  readonly bytes: Uint8Array;
  readonly ext: 'glb' | 'vrm';
  readonly fetched: readonly { readonly url: string; readonly sha256: string }[];
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** A backdrop's picture (spec 17 section 2), pinned as a model is. */
export async function fetchPicture(
  item: SourceItem,
  fetcher: Fetcher,
): Promise<{ readonly bytes: Uint8Array; readonly fetched: Fetched['fetched'] }> {
  const f = item.fetch;
  if ('generated' in f) throw new Error(`${item.id}: a backdrop's picture is fetched, not made.`);
  const url =
    'url' in f
      ? f.url
      : `https://raw.githubusercontent.com/${f.github}/${f.commit}/` +
        f.path.split('/').map(encodeURIComponent).join('/');
  const bytes = await fetcher(url);
  const got = sha256(bytes);
  if ('url' in f && f.sha256 !== undefined && got !== f.sha256)
    throw new Error(`${item.id}: ${f.url} has sha256 ${got}, not ${f.sha256} as listed.`);
  return { bytes, fetched: [{ url, sha256: got }] };
}

export async function fetchModel(
  item: SourceItem,
  fetcher: Fetcher,
  folder = '.',
): Promise<Fetched> {
  const f = item.fetch;
  if ('generated' in f) {
    const made = join(folder, 'generated', f.generated);
    if (existsSync(made)) {
      const bytes = new Uint8Array(await readFile(made));
      return {
        bytes,
        ext: 'glb',
        fetched: [{ url: `generated:${f.generated}`, sha256: sha256(bytes) }],
      };
    }
    // generated/ isn't committed, so a rebuild that hasn't just made the model uses the shipped
    // one. The build keeps the first build's provenance for it (`build.ts`).
    const kept = `models/${item.id}.glb`;
    if (!existsSync(join(folder, kept)))
      throw new Error(
        `${item.id}: neither generated/${f.generated} nor ${kept} is there. Run the workflow that makes it first.`,
      );
    const bytes = new Uint8Array(await readFile(join(folder, kept)));
    return { bytes, ext: 'glb', fetched: [{ url: `kept:${kept}`, sha256: sha256(bytes) }] };
  }
  if ('url' in f) {
    const bytes = await fetcher(f.url);
    const got = sha256(bytes);
    if (f.sha256 !== undefined && got !== f.sha256)
      throw new Error(`${item.id}: ${f.url} has sha256 ${got}, not ${f.sha256} as listed.`);
    if (f.ext !== 'glb' && f.ext !== 'vrm')
      throw new Error(`${item.id}: ${f.url} is a picture, not a model.`);
    return { bytes, ext: f.ext, fetched: [{ url: f.url, sha256: got }] };
  }
  const base = `https://raw.githubusercontent.com/${f.github}/${f.commit}/`;
  const url = base + f.path.split('/').map(encodeURIComponent).join('/');
  const bytes = await fetcher(url);
  const fetched = [{ url, sha256: sha256(bytes) }];
  if (!f.path.endsWith('.gltf'))
    return { bytes, ext: f.path.endsWith('.vrm') ? 'vrm' : 'glb', fetched };

  // A .gltf names its buffers and images by relative paths: fetch those too, then pack.
  const json = JSON.parse(new TextDecoder().decode(bytes)) as {
    buffers?: { uri?: string }[];
    images?: { uri?: string }[];
  };
  const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : '';
  const resources: Record<string, Uint8Array<ArrayBuffer>> = {};
  for (const { uri } of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (!uri || uri.startsWith('data:') || uri in resources) continue;
    if (/^[a-z]+:|^\/|\.\./i.test(decodeURIComponent(uri)))
      throw new Error(`${item.id}: refusing a file outside the model's folder: ${uri}`);
    const fileUrl =
      base + (dir + decodeURIComponent(uri)).split('/').map(encodeURIComponent).join('/');
    const file = await fetcher(fileUrl);
    resources[uri] = file.slice();
    fetched.push({ url: fileUrl, sha256: sha256(file) });
  }
  // Every standard extension, so a pack that uses one (WebP textures, say) keeps it when packed.
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readJSON({ json: json as never, resources });
  return { bytes: await io.writeBinary(doc), ext: 'glb', fetched };
}
