/**
 * Fetches one source item's model, pinned (see `sources.ts`), and records the SHA-256 of every
 * file fetched for the provenance record. A .gltf and its files are packed into one binary glTF;
 * .glb and .vrm files are kept byte for byte.
 */
import { createHash } from 'node:crypto';
import { WebIO } from '@gltf-transform/core';
import type { SourceItem } from './sources.ts';

export type Fetcher = (url: string) => Promise<Uint8Array>;

export const httpFetch: Fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${url}: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
};

export interface Fetched {
  readonly bytes: Uint8Array;
  readonly ext: 'glb' | 'vrm';
  readonly fetched: readonly { readonly url: string; readonly sha256: string }[];
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export async function fetchModel(item: SourceItem, fetcher: Fetcher): Promise<Fetched> {
  const f = item.fetch;
  if ('url' in f) {
    const bytes = await fetcher(f.url);
    const got = sha256(bytes);
    if (f.sha256 !== undefined && got !== f.sha256)
      throw new Error(`${item.id}: ${f.url} has sha256 ${got}, not ${f.sha256} as listed.`);
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
  const io = new WebIO();
  const doc = await io.readJSON({ json: json as never, resources });
  return { bytes: await io.writeBinary(doc), ext: 'glb', fetched };
}
