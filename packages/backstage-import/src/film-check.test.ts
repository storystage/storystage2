import { describe, expect, it } from 'vitest';
import { box, glbFromMesh } from '@storystage/sketches/testing';
import { checkFilmModels, isSafeSketch, type FilmModelInput } from './film-check.ts';
import { importModel, type ImportTools } from './import.ts';
import { checkFilmInWorker, type ImportWorker } from './worker-client.ts';
import { serveImports, type WorkerPort } from './worker.ts';

/** A PNG header of the given size. */
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

const tools: ImportTools = {
  encodeTexture: async (image) => image,
  encodeThumbnail: async () => ({ bytes: png(64, 64), mimeType: 'image/png' }),
};
const text = (s: string) => new TextEncoder().encode(s);

/** A film carrying one imported crate, as `packModels` packs it. */
async function film() {
  const r = await importModel(
    new Map([['crate.glb', await glbFromMesh(box([0, 0, 0], [1, 1, 1]))]]),
    { section: 'props', class: 'Prop', name: 'Crate', licence: { choice: 'own-work' } },
    tools,
  );
  if (!r.ok) throw new Error('import failed');
  const models: FilmModelInput[] = [{ folder: 'prop-crate', item: r.item }];
  const files = new Map(r.files.map((f) => [`models/prop-crate/${f.path}`, f.bytes]));
  return { models, files, item: r.item };
}

describe('checkFilmModels (spec 03, section 1.3)', () => {
  it('passes a packed model that an import made', async () => {
    const { models, files } = await film();
    expect(await checkFilmModels(models, files)).toEqual({ checked: ['prop-crate'], refused: [] });
  });

  it('refuses a sketch with a script in it, so it never reaches the studio', async () => {
    const { models, files } = await film();
    files.set(
      'models/prop-crate/sketches/front.svg',
      text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    );
    const result = await checkFilmModels(models, files);
    expect(result.checked).toEqual([]);
    expect(result.refused[0]).toMatchObject({
      name: 'Crate',
      reason: expect.stringMatching(/sketches/),
    });
  });

  it('refuses a model that isn’t one, or that claims more than it holds', async () => {
    const { models, files } = await film();
    files.set('models/prop-crate/model.glb', text('not a model'));
    expect((await checkFilmModels(models, files)).refused[0]!.reason).toMatch(/damaged/);
  });

  it('refuses a record that isn’t a class’s import, a bad folder, or a missing model', async () => {
    const { models, files, item } = await film();
    const shipped = {
      ...item,
      origin: 'shipped',
      licence: 'CC0-1.0',
      source: { url: 'https://example.org' },
    };
    expect(
      (await checkFilmModels([{ folder: 'prop-crate', item: shipped }], files)).refused[0]!.reason,
    ).toMatch(/isn't a class's imported model/);
    expect((await checkFilmModels([{ folder: '../x', item }], files)).refused[0]!.reason).toMatch(
      /damaged/,
    );
    expect((await checkFilmModels(models, new Map())).refused[0]!.reason).toMatch(/missing/);
  });

  it('refuses a model over its section’s budget: a Set piece claimed as a Prop', async () => {
    const n = 80; // 12,800 triangles: within Set's 20,000, over a Prop's 8,000
    const lines: string[] = [];
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) lines.push(`v ${x / n} 0 ${y / n}`);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = y * (n + 1) + x + 1;
        lines.push(`f ${v} ${v + 1} ${v + n + 2} ${v + n + 1}`);
      }
    const r = await importModel(
      new Map([['mat.obj', text(lines.join('\n'))]]),
      { section: 'set', class: 'Prop', name: 'Mat', licence: { choice: 'own-work' } },
      tools,
    );
    if (!r.ok) throw new Error('import failed');
    const files = new Map(r.files.map((f) => [`models/set-mat/${f.path}`, f.bytes]));
    const asProp = { ...r.item, section: 'props' };
    expect((await checkFilmModels([{ folder: 'set-mat', item: r.item }], files)).checked).toEqual([
      'set-mat',
    ]);
    expect(
      (await checkFilmModels([{ folder: 'set-mat', item: asProp }], files)).refused[0]!.reason,
    ).toMatch(/more detailed/);
  });

  it('refuses a thumbnail that isn’t a picture within the limits', async () => {
    const { models, files, item } = await film();
    files.set(`models/prop-crate/${item.files.thumbnail}`, png(20_000, 20_000));
    expect((await checkFilmModels(models, files)).refused[0]!.reason).toMatch(/too big/);
  });
});

describe('isSafeSketch', () => {
  const ok =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" data-facing="front" data-backstage-id="class/Prop/crate"><title>Crate, front</title><path class="fill" d="M0 0L1 1Z" fill="#fff" fill-rule="evenodd"/><path class="outline" d="M0 0L1 1" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  it('accepts what the sketch renderer writes', () => {
    expect(isSafeSketch(ok)).toBe(true);
    expect(isSafeSketch(ok.replace('Crate, front', 'Tom &amp; Jerry'))).toBe(true);
  });

  it('refuses scripts, handlers, links, styles, entities, comments and other elements', () => {
    for (const bad of [
      ok.replace('<title>', '<script>x</script><title>'),
      ok.replace('class="fill"', 'class="fill" onload="x()"'),
      ok
        .replace('<path class="fill"', '<a href="https://x.org"><path class="fill"')
        .replace('</svg>', '</a></svg>'),
      ok.replace('<title>', '<style>*{}</style><title>'),
      ok.replace('<title>', '<foreignObject></foreignObject><title>'),
      `<!DOCTYPE svg [<!ENTITY x "y">]>${ok}`,
      ok.replace('<title>', '<!-- hi --><title>'),
      ok.replace('Crate, front', '&x;'),
      ok.replace('xmlns="http://www.w3.org/2000/svg"', 'xmlns="http://evil.example"'),
      ok.replace('</svg>', '</svg><svg></svg>'),
      ok.replace('<title>Crate, front</title>', '<title>a<b</title>'),
      'plain text',
    ])
      expect(isSafeSketch(bad), bad.slice(0, 60)).toBe(false);
  });

  it('stays quick on a long run of spaces in a tag (no slow matching)', () => {
    const started = Date.now();
    expect(isSafeSketch(`<svg${' '.repeat(200_000)}x`)).toBe(false);
    expect(isSafeSketch(`<svg ${' '.repeat(200_000)}>`.concat('</svg>'))).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('checkFilmInWorker', () => {
  it('checks in the import worker, and refuses every model if the worker fails', async () => {
    const { models, files } = await film();
    type Listener = (event: { data: unknown }) => void;
    const toWorker: Listener[] = [];
    const toStudio: Listener[] = [];
    const errors: ((e: unknown) => void)[] = [];
    let terminated = 0;
    const side: WorkerPort = {
      postMessage: (m) =>
        queueMicrotask(() => toStudio.forEach((l) => l({ data: structuredClone(m) }))),
      addEventListener: (_t, l) => void toWorker.push(l),
    };
    serveImports(side, tools);
    const worker: ImportWorker = {
      postMessage: (m) =>
        queueMicrotask(() => toWorker.forEach((l) => l({ data: structuredClone(m) }))),
      addEventListener: ((type: string, l: Listener) =>
        type === 'message'
          ? void toStudio.push(l)
          : void errors.push(l as (e: unknown) => void)) as ImportWorker['addEventListener'],
      terminate: () => void terminated++,
    };
    expect(await checkFilmInWorker(() => worker, models, files)).toEqual({
      checked: ['prop-crate'],
      refused: [],
    });
    expect(terminated).toBe(1);

    const failing: ImportWorker = {
      ...worker,
      postMessage: () => queueMicrotask(() => errors.forEach((e) => e(new Error('x')))),
    };
    const result = await checkFilmInWorker(() => failing, models, files);
    expect(result.checked).toEqual([]);
    expect(result.refused).toHaveLength(1);
  });
});
