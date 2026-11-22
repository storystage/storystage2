import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  KokoroDownloadError,
  downloadKokoro,
  fileUrl,
  kokoroFiles,
  kokoroToDownload,
  type CacheLike,
  type CachesLike,
  type KokoroFile,
} from './kokoro-files.ts';

const places = {
  assets: 'https://studio.test/speech/kokoro/',
  wasm: 'https://studio.test/speech/ort/',
};
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** A fake site serving Kokoro's files in pieces, logging what was asked. */
function site(contents: Record<string, Uint8Array>, list?: KokoroFile[]) {
  const asked: string[] = [];
  const files =
    list ??
    Object.entries(contents).map(([path, b]) => ({ path, bytes: b.length, sha256: sha(b) }));
  const served: Record<string, Uint8Array> = {};
  for (const [path, b] of Object.entries(contents)) served[fileUrl(places, path)] = b;
  const fetch = async (url: string) => {
    asked.push(url.replace('https://studio.test/speech/', ''));
    if (url === `${places.assets}files.json`) return Response.json(files);
    const b = served[url];
    if (!b) return new Response(null, { status: 404 });
    // Two pieces, so progress shows mid-file.
    const half = Math.ceil(b.length / 2);
    return new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(b.slice(0, half));
          if (b.length > half) c.enqueue(b.slice(half));
          c.close();
        },
      }),
    );
  };
  return { fetch, asked, files };
}

function fakeCaches() {
  const store = new Map<string, Response>();
  const cache: CacheLike = {
    match: async (k) => store.get(k)?.clone(),
    put: async (k, r) => void store.set(k, r),
    keys: async () => [...store.keys()].map((url) => ({ url })),
    delete: async (k) => store.delete(k),
  };
  const caches: CachesLike = { open: async () => cache };
  return { caches, store };
}

const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill);
const contents = {
  'kokoro/model_quantized.onnx': bytes(10, 1),
  'kokoro/voices/bf_emma.bin': bytes(4, 2),
  'ort/ort-wasm-simd-threaded.wasm': bytes(6, 3),
};

describe('fileUrl', () => {
  it('finds kokoro/ files under the assets and ort/ files under the wasm place', () => {
    expect(fileUrl(places, 'kokoro/voices/bf_emma.bin')).toBe(`${places.assets}voices/bf_emma.bin`);
    expect(fileUrl(places, 'ort/ort-wasm-simd-threaded.wasm')).toBe(
      `${places.wasm}ort-wasm-simd-threaded.wasm`,
    );
    expect(() => fileUrl(places, 'elsewhere/x')).toThrow(KokoroDownloadError);
  });
});

describe('downloadKokoro', () => {
  it('downloads each file once, checked, with progress, then has nothing left to do', async () => {
    const s = site(contents);
    const { caches } = fakeCaches();
    expect(await kokoroToDownload(places, { fetch: s.fetch, caches })).toBe(20);
    const progress: string[] = [];
    await downloadKokoro(places, {
      fetch: s.fetch,
      caches,
      onProgress: (done, total) => progress.push(`${done}/${total}`),
    });
    expect(progress).toEqual(['0/20', '5/20', '10/20', '12/20', '14/20', '17/20', '20/20']);
    expect(await kokoroToDownload(places, { fetch: s.fetch, caches })).toBe(0);

    s.asked.length = 0;
    await downloadKokoro(places, { fetch: s.fetch, caches });
    expect(s.asked).toEqual(['kokoro/files.json']);
  });

  it('refuses a file that doesn’t match its SHA-256, keeping the ones before it', async () => {
    const good = site(contents);
    const list = good.files.map((f) =>
      f.path === 'kokoro/voices/bf_emma.bin' ? { ...f, sha256: '0'.repeat(64) } : f,
    );
    const s = site(contents, list);
    const { caches } = fakeCaches();
    await expect(downloadKokoro(places, { fetch: s.fetch, caches })).rejects.toThrow(
      'kokoro/voices/bf_emma.bin didn’t arrive whole',
    );
    expect(await kokoroToDownload(places, { fetch: s.fetch, caches })).toBe(10);
  });

  it('lets go of an older model’s copy once the new one is kept', async () => {
    const { caches, store } = fakeCaches();
    await downloadKokoro(places, { ...site(contents), caches });
    const newer = { ...contents, 'kokoro/model_quantized.onnx': bytes(10, 9) };
    await downloadKokoro(places, { ...site(newer), caches });
    expect(store.size).toBe(3);
    expect([...store.keys()].filter((k) => k.includes('model_quantized'))).toEqual([
      `${places.assets}model_quantized.onnx?sha256=${sha(bytes(10, 9))}`,
    ]);
  });

  it('can’t download where nothing can be kept', async () => {
    await expect(downloadKokoro(places, { ...site(contents), caches: null })).rejects.toThrow(
      KokoroDownloadError,
    );
  });
});

describe('kokoroFiles', () => {
  it('reads the kept copy when there is one, and the network otherwise', async () => {
    const s = site(contents);
    const { caches } = fakeCaches();
    const before = await kokoroFiles(places, { fetch: s.fetch, caches });
    expect(new Uint8Array(await (await before('kokoro/voices/bf_emma.bin')).arrayBuffer())).toEqual(
      bytes(4, 2),
    );
    await downloadKokoro(places, { fetch: s.fetch, caches });
    const after = await kokoroFiles(places, { fetch: s.fetch, caches });
    s.asked.length = 0;
    expect(new Uint8Array(await (await after('kokoro/voices/bf_emma.bin')).arrayBuffer())).toEqual(
      bytes(4, 2),
    );
    expect(s.asked).toEqual([]);
  });

  it('works without files.json or Cache Storage, as the apps may', async () => {
    const s = site(contents);
    const fetch = (url: string) =>
      url.endsWith('files.json')
        ? Promise.resolve(new Response(null, { status: 404 }))
        : s.fetch(url);
    const file = await kokoroFiles(places, { fetch, caches: null });
    expect((await (await file('ort/ort-wasm-simd-threaded.wasm')).arrayBuffer()).byteLength).toBe(
      6,
    );
    await expect(file('kokoro/missing.bin')).rejects.toThrow('kokoro/missing.bin: 404');
  });
});
