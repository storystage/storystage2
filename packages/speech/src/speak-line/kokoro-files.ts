/**
 * Kokoro's files on this device (spec 06, 4.6). The apps bundle them; the browser version
 * downloads them once, with the learner's consent and a progress bar, and keeps them in Cache
 * Storage. Each file is checked against its SHA-256 from `files.json`, which
 * `scripts/fetch-kokoro-assets.mjs` writes beside them.
 *
 * Kept under the file's address plus its SHA-256, so a new model never meets an old copy; the
 * worker (`kokoroFiles`) uses the kept copy when there is one and the network otherwise.
 */
import type { KokoroPlaces } from './kokoro-protocol.ts';

/** The Cache Storage cache that holds Kokoro's files. */
export const KOKORO_CACHE = 'storystage-kokoro';

/** One of Kokoro's files, as `files.json` lists it: `kokoro/…` or `ort/…`. */
export interface KokoroFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** The parts of Cache Storage used, so tests can give a fake. */
export interface CacheLike {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  keys(): Promise<readonly { readonly url: string }[]>;
  delete(key: string): Promise<boolean>;
}
export interface CachesLike {
  open(name: string): Promise<CacheLike>;
}

export interface KokoroFilesOptions {
  /** Defaults to the global `fetch`. */
  readonly fetch?: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  /** Defaults to the global `caches`; without it (an insecure page) nothing is kept. */
  readonly caches?: CachesLike | null;
}

export interface DownloadOptions extends KokoroFilesOptions {
  /** Bytes done and in all, as each piece arrives. */
  readonly onProgress?: (done: number, total: number) => void;
  readonly signal?: AbortSignal;
}

/** A file that didn't arrive whole, in words the studio can show. */
export class KokoroDownloadError extends Error {
  override readonly name = 'KokoroDownloadError';
}

const fetcher = (o: KokoroFilesOptions) => o.fetch ?? ((url, init) => fetch(url, init));
const cachesOf = (o: KokoroFilesOptions): CachesLike | null =>
  o.caches !== undefined
    ? o.caches
    : typeof caches === 'undefined'
      ? null
      : (caches as unknown as CachesLike);

/** A file's address: `kokoro/…` is under `places.assets`, `ort/…` under `places.wasm`. */
export function fileUrl(places: KokoroPlaces, path: string): string {
  const [dir, ...rest] = path.split('/');
  const name = rest.join('/');
  if (dir === 'kokoro') return `${places.assets}${name}`;
  if (dir === 'ort') return `${places.wasm}${name}`;
  throw new KokoroDownloadError(`Not one of Kokoro's files: ${path}`);
}

/** Where a file is kept: its address and its SHA-256, so each version is kept apart. */
const keyOf = (places: KokoroPlaces, f: KokoroFile) =>
  `${fileUrl(places, f.path)}?sha256=${f.sha256}`;

/** Kokoro's files, from `files.json`. */
export async function kokoroFileList(
  places: KokoroPlaces,
  options: KokoroFilesOptions = {},
): Promise<KokoroFile[]> {
  const res = await fetcher(options)(`${places.assets}files.json`);
  if (!res.ok) throw new KokoroDownloadError(`files.json: ${res.status}`);
  return (await res.json()) as KokoroFile[];
}

/**
 * How many bytes are still to download: 0 when every file is kept on this device, so the studio
 * needn't ask. Without Cache Storage nothing can be kept, so it's every file's size.
 */
export async function kokoroToDownload(
  places: KokoroPlaces,
  options: KokoroFilesOptions = {},
): Promise<number> {
  const list = await kokoroFileList(places, options);
  const store = cachesOf(options);
  const cache = store && (await store.open(KOKORO_CACHE));
  let bytes = 0;
  for (const f of list) if (!(await cache?.match(keyOf(places, f)))) bytes += f.bytes;
  return bytes;
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Downloads every file not yet kept, checks each against its SHA-256 and keeps it, reporting
 * progress; then lets go of copies the list no longer names (an older model). Call it once the
 * learner has agreed (spec 06, 4.6). Resolves when every file is kept; rejects, keeping the files
 * that arrived whole, if one fails or `signal` aborts.
 */
export async function downloadKokoro(
  places: KokoroPlaces,
  options: DownloadOptions = {},
): Promise<void> {
  const store = cachesOf(options);
  if (!store) throw new KokoroDownloadError('This page can’t keep files, so it can’t download.');
  const list = await kokoroFileList(places, options);
  const cache = await store.open(KOKORO_CACHE);
  const total = list.reduce((n, f) => n + f.bytes, 0);
  let done = 0;
  options.onProgress?.(done, total);
  for (const f of list) {
    const key = keyOf(places, f);
    if (await cache.match(key)) {
      done += f.bytes;
      options.onProgress?.(done, total);
      continue;
    }
    const res = await fetcher(options)(
      fileUrl(places, f.path),
      options.signal ? { signal: options.signal } : undefined,
    );
    if (!res.ok || !res.body) throw new KokoroDownloadError(`${f.path}: ${res.status}`);
    const pieces: Uint8Array[] = [];
    const reader = res.body.getReader();
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      pieces.push(value);
      done += value.byteLength;
      options.onProgress?.(Math.min(done, total), total);
    }
    const blob = new Blob(pieces as BlobPart[]);
    if (blob.size !== f.bytes || (await sha256(blob)) !== f.sha256)
      throw new KokoroDownloadError(`${f.path} didn’t arrive whole. Try again.`);
    await cache.put(key, new Response(blob));
  }
  const wanted = new Set(list.map((f) => new URL(keyOf(places, f), 'http://x/').href));
  for (const { url } of await cache.keys())
    if (!wanted.has(new URL(url, 'http://x/').href)) await cache.delete(url);
}

/**
 * The worker's view of the files: each from the copy kept on this device if there is one, else
 * from its address (the apps, or a browser that hasn't downloaded them).
 */
export async function kokoroFiles(
  places: KokoroPlaces,
  options: KokoroFilesOptions = {},
): Promise<(path: string) => Promise<Response>> {
  const list = await kokoroFileList(places, options).catch(() => [] as KokoroFile[]);
  const byPath = new Map(list.map((f) => [f.path, f]));
  const store = cachesOf(options);
  const cache = store ? await store.open(KOKORO_CACHE).catch(() => null) : null;
  return async (path) => {
    const f = byPath.get(path);
    const kept = f && cache ? await cache.match(keyOf(places, f)) : undefined;
    if (kept) return kept;
    const res = await fetcher(options)(fileUrl(places, path));
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res;
  };
}
