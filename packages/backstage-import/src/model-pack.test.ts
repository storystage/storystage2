import { describe, expect, it } from 'vitest';
import { readArchive, writeArchive } from '@storystage/production';
import type { TextureEncoder } from '@storystage/backstage/optimize';
import { box, figure, glbFromMesh } from '@storystage/sketches/testing';
import { importModel, type ImportChoices, type ImportTools } from './import.ts';
import {
  MODEL_PACK_FORMAT,
  modelPackFromClass,
  openModelPack,
  writeModelPack,
  type PackModel,
} from './model-pack.ts';
import type { ClassModels } from './pack.ts';

/** A PNG header of the given size. */
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

function counting() {
  let calls = 0;
  const encodeTexture: TextureEncoder = async (_i, _m, maxPx, size) => {
    calls++;
    const s = Math.min(1, maxPx / Math.max(...size));
    return { bytes: png(Math.round(size[0] * s), Math.round(size[1] * s)), mimeType: 'image/png' };
  };
  const tools: ImportTools = {
    encodeTexture,
    encodeThumbnail: async () => ({ bytes: new Uint8Array([9]), mimeType: 'image/webp' }),
  };
  return { tools, calls: () => calls };
}

const crate: ImportChoices = {
  section: 'props',
  class: 'Prop',
  name: 'Crate',
  licence: { choice: 'CC BY', sourceUrl: 'https://example.org/crate', maker: 'A. Maker' },
};
const pip: ImportChoices = {
  section: 'cast',
  class: 'Biped',
  name: 'Pip',
  licence: { choice: 'own-work' },
};

async function imported(model: Uint8Array, choices: ImportChoices): Promise<PackModel> {
  const r = await importModel(new Map([['m.glb', model]]), choices, counting().tools);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return { item: r.item, files: r.files };
}

async function twoModels() {
  return [
    await imported(await glbFromMesh(box([0, 0, 0], [1, 1, 1])), crate),
    await imported(await glbFromMesh(figure()), pip),
  ];
}

const entries = (pack: Uint8Array) => {
  const r = readArchive(pack, { wanted: () => true });
  if (!r.ok) throw new Error(r.problem.code);
  return new Map(r.names.map((n) => [n, r.entries.get(n)!]));
};
const repack = (map: Map<string, Uint8Array>) =>
  writeArchive([...map].map(([name, bytes]) => ({ name, bytes })));
const text = (s: string) => new TextEncoder().encode(s);

describe('the model pack (spec 17, section 5)', () => {
  it('opens on another device with the same models: ids, records and credits kept', async () => {
    const models = await twoModels();
    const pack = writeModelPack(models);
    expect([...entries(pack).keys()][0]).toBe('backstage.json');
    const { tools } = counting();
    const opened = await openModelPack(pack, tools);
    if (!opened.ok) throw new Error(opened.problem.message);
    expect(opened.leftOut).toEqual([]);
    expect(opened.models.map((m) => m.item.id)).toEqual(models.map((m) => m.item.id));
    for (const [i, m] of opened.models.entries()) {
      const was = models[i]!.item;
      expect(m.item).toMatchObject({
        displayName: was.displayName,
        section: was.section,
        class: was.class,
        licence: was.licence,
        credit: was.credit,
        joints: was.joints,
        budget: was.budget,
      });
      expect(m.files.map((f) => f.path)).toEqual(models[i]!.files.map((f) => f.path));
      expect(m.report.lines.length).toBeGreaterThan(0);
    }
  });

  it('doesn’t reduce a model already within its budget again', async () => {
    const model = await imported(await glbFromMesh(box([0, 0, 0], [1, 1, 1])), crate);
    const { tools, calls } = counting();
    const opened = await openModelPack(writeModelPack([model]), tools);
    expect(opened.ok && opened.models).toHaveLength(1);
    expect(calls()).toBe(0);
  });

  it('reduces a model the pack says is a prop but is over a prop’s budget', async () => {
    const n = 80;
    const lines: string[] = [];
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) lines.push(`v ${x / n} 0 ${y / n}`);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const a = y * (n + 1) + x + 1;
        lines.push(`f ${a} ${a + 1} ${a + n + 2} ${a + n + 1}`);
      }
    // Imported as Set (20,000 triangles), then claimed as a prop (8,000) in the pack.
    const r = await importModel(
      new Map([['mat.obj', text(lines.join('\n'))]]),
      { ...crate, section: 'set', name: 'Mat' },
      counting().tools,
    );
    if (!r.ok) throw new Error('import failed');
    const asProp = { item: { ...r.item, section: 'props' as const }, files: r.files };
    const opened = await openModelPack(writeModelPack([asProp]), counting().tools);
    if (!opened.ok) throw new Error(opened.problem.message);
    expect(opened.models[0]!.item.budget.triangles).toBeLessThanOrEqual(8_000);
  });

  it('never uses the pack’s own sketches or thumbnail: it draws new ones', async () => {
    const pack = entries(
      writeModelPack([await imported(await glbFromMesh(box([0, 0, 0], [1, 1, 1])), crate)]),
    );
    const sketch = [...pack.keys()].find((k) => k.endsWith('front.svg'))!;
    pack.set(sketch, text('<svg><script>alert(1)</script></svg>'));
    const opened = await openModelPack(repack(pack), counting().tools);
    if (!opened.ok) throw new Error(opened.problem.message);
    const front = opened.models[0]!.files.find((f) => f.path === 'sketches/front.svg')!;
    expect(new TextDecoder().decode(front.bytes)).not.toContain('<script');
  });

  it('leaves out a model the class already has, or one that fails, saying why', async () => {
    const models = await twoModels();
    const pack = entries(writeModelPack(models));
    const manifest = JSON.parse(new TextDecoder().decode(pack.get('backstage.json')!));
    // Pip's model replaced with something that isn't a model.
    pack.set(`models/${manifest.models[1].folder}/model.glb`, text('not a model'));
    const opened = await openModelPack(
      repack(pack),
      counting().tools,
      new Set([models[0]!.item.id]),
    );
    if (!opened.ok) throw new Error(opened.problem.message);
    expect(opened.models).toEqual([]);
    expect(opened.leftOut).toEqual([
      { name: 'Crate', reason: "This class's Backstage already has it." },
      { name: 'Pip', reason: "This file is damaged, or it isn't a model." },
    ]);
  });

  it('leaves out a record that isn’t a class’s imported model', async () => {
    const [model] = await twoModels();
    const shipped = {
      ...model!,
      item: { ...model!.item, origin: 'shipped' as const, licence: 'CC0-1.0' as const },
    };
    const opened = await openModelPack(writeModelPack([shipped]), counting().tools);
    expect(opened.ok && opened.leftOut).toEqual([
      { name: 'Crate', reason: "It isn't a class's imported model." },
    ]);
  });

  it('refuses what isn’t a model pack, and one from a newer StoryStage', async () => {
    expect(await openModelPack(text('hello'), counting().tools)).toMatchObject({ ok: false });
    const other = writeArchive([{ name: 'manifest.json', bytes: text('{}') }]);
    expect(await openModelPack(other, counting().tools)).toMatchObject({
      ok: false,
      problem: { message: "This isn't a StoryStage model pack." },
    });
    const newer = writeArchive([
      {
        name: 'backstage.json',
        bytes: text(
          JSON.stringify({ format: MODEL_PACK_FORMAT, formatVersion: '2.0.0', models: [] }),
        ),
      },
    ]);
    expect(await openModelPack(newer, counting().tools)).toMatchObject({
      ok: false,
      problem: { message: expect.stringMatching(/newer StoryStage/) },
    });
  });
});

describe('modelPackFromClass', () => {
  it('packs the class’s own models, not pupils’, and names any it can’t read', async () => {
    const [a, b] = await twoModels();
    const stored = [
      { id: a!.item.id, record: a!.item, owner: 'class' },
      { id: b!.item.id, record: b!.item, owner: 'pupil-abc' },
    ];
    const classModels: ClassModels = {
      list: async () => stored,
      read: async (id, path) => {
        const m = [a!, b!].find((x) => x.item.id === id)!;
        return m.files.find((f) => f.path === path)!.bytes;
      },
    };
    const { pack, leftOut } = await modelPackFromClass(classModels);
    expect(leftOut).toEqual([]);
    const opened = await openModelPack(pack, counting().tools);
    expect(opened.ok && opened.models.map((m) => m.item.id)).toEqual([a!.item.id]);

    const unreadable: ClassModels = {
      list: async () => stored.slice(0, 1),
      read: async () => Promise.reject(new Error('locked')),
    };
    expect((await modelPackFromClass(unreadable)).leftOut).toEqual([a!.item.id]);
  });
});
