import { describe, expect, it } from 'vitest';
import {
  exampleProduction,
  openProduction,
  saveProduction,
  type Production,
} from '@storystage/production';
import { box, glbFromMesh } from '@storystage/sketches/testing';
import { backstageId } from '@storystage/story-api';
import { importModel, type ImportTools } from './import.ts';
import { modelsUsed, packFolder, packModels, type ClassModels } from './pack.ts';

const tools: ImportTools = {
  encodeTexture: async (image) => image,
  encodeThumbnail: async () => ({ bytes: new Uint8Array([1, 2]), mimeType: 'image/webp' }),
};

/** A class Backstage holding one imported crate, as the host would keep it. */
async function classWithCrate() {
  const r = await importModel(
    new Map([['crate.glb', await glbFromMesh(box([0, 0, 0], [1, 1, 1]))]]),
    { section: 'props', class: 'Prop', name: 'Crate', licence: { choice: 'own-work' } },
    tools,
  );
  if (!r.ok) throw new Error('import failed');
  const reads: string[] = [];
  const classModels: ClassModels = {
    list: async () => [{ id: r.item.id, record: r.item }],
    read: async (id, path) => {
      reads.push(path);
      const f = r.files.find((x) => x.path === path);
      if (id !== r.item.id || !f) throw Object.assign(new Error('gone'), { code: 'not_found' });
      return f.bytes;
    },
  };
  return { item: r.item, files: r.files, classModels, reads };
}

/** The example production, with its first scene's first object played by `model`. */
function using(model: string): Production {
  const p = exampleProduction();
  const [first, ...rest] = p.scenes;
  const [object, ...others] = first!.setup.objects;
  const played = { ...object!, model: backstageId(model) };
  return {
    ...p,
    scenes: [{ ...first!, setup: { ...first!.setup, objects: [played, ...others] } }, ...rest],
  };
}

const NO_FILES = { audio: new Map<string, Uint8Array>(), models: new Map<string, Uint8Array>() };

describe('packModels (spec 03, section 1.3)', () => {
  it('lists the models a production uses: set-ups, cards and sketches', () => {
    const used = modelsUsed(using('class/Prop/crate'));
    expect(used.has('class/Prop/crate')).toBe(true);
    expect([...used].every((id) => typeof id === 'string')).toBe(true);
  });

  it('packs a class model the production uses, so the saved file opens with it', async () => {
    const { item, files, classModels } = await classWithCrate();
    const packed = await packModels(using(item.id), NO_FILES, classModels);
    expect(packed.missing).toEqual([]);
    expect(packed.production.manifest.models).toEqual([{ folder: 'prop-crate', item }]);
    expect([...packed.files.models.keys()].sort()).toEqual(
      files.map((f) => `models/prop-crate/${f.path}`).sort(),
    );
    const opened = openProduction(saveProduction(packed.production, packed.files));
    expect(opened.status).toBe('ok');
    if (opened.status === 'ok') expect(opened.production.manifest.models[0]!.item).toEqual(item);
  });

  it('keeps a packed model as it is, even when the class Backstage no longer has it', async () => {
    const { item, classModels } = await classWithCrate();
    const first = await packModels(using(item.id), NO_FILES, classModels);
    const empty: ClassModels = { list: async () => [], read: async () => new Uint8Array() };
    const again = await packModels(first.production, first.files, empty);
    expect(again.production.manifest.models).toEqual(first.production.manifest.models);
    expect(again.files.models).toEqual(first.files.models);
    expect(again.missing).toEqual([]);
  });

  it('drops a model the production stopped using, with its files', async () => {
    const { item, classModels } = await classWithCrate();
    const first = await packModels(using(item.id), NO_FILES, classModels);
    const without = { ...first.production, scenes: exampleProduction().scenes };
    const again = await packModels(without, first.files, classModels);
    expect(again.production.manifest.models).toEqual([]);
    expect(again.files.models.size).toBe(0);
  });

  it('says which class models it couldn’t find, and leaves shipped ones out', async () => {
    const { classModels } = await classWithCrate();
    const packed = await packModels(using('class/Prop/lost'), NO_FILES, classModels);
    expect(packed.missing).toEqual(['class/Prop/lost']);
    expect(packed.production.manifest.models).toEqual([]);
    // The example's own models are shipped: nothing is packed or missing for them.
    expect((await packModels(exampleProduction(), NO_FILES, classModels)).missing).toEqual([]);
  });

  it('doesn’t pack a model whose files can’t be read', async () => {
    const { item, classModels } = await classWithCrate();
    const broken: ClassModels = {
      ...classModels,
      read: async () => Promise.reject(new Error('locked')),
    };
    const packed = await packModels(using(item.id), NO_FILES, broken);
    expect(packed.missing).toEqual([item.id]);
    expect(packed.production.manifest.models).toEqual([]);
  });
});

describe('packFolder', () => {
  it('makes a folder safe as a file name, and unique', () => {
    expect(packFolder('class/Prop/crate', new Set())).toBe('prop-crate');
    expect(packFolder('class/Prop/crate', new Set(['prop-crate']))).toBe('prop-crate-2');
    expect(packFolder('class/Biped/a-very-long-name-for-a-character-indeed', new Set())).toMatch(
      /^[a-z0-9][a-z0-9-]{0,31}$/,
    );
    expect(packFolder('///', new Set())).toBe('model');
  });
});
