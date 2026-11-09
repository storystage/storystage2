import {
  exampleProduction,
  type Production,
  type ProductionFiles,
  type ProductionSaver,
} from '@storystage/production';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSaving, type OpenFilm, type Pack } from './useSaving.ts';

// Packing a film's class models before each save (S4's packModels, #261; decision 0049).

const OPENED: ProductionFiles = { audio: new Map(), models: new Map() };

function fakeSaver() {
  const save = vi.fn(async (_p: Production, _files: ProductionFiles, _kind: string) => ({
    ok: true as const,
    key: 'film-1',
    savedAt: '2026-11-08T12:00:00.000Z',
  }));
  return { saver: { save } as unknown as ProductionSaver, save };
}

function titled(title: string) {
  const p = exampleProduction();
  return { ...p, manifest: { ...p.manifest, title } };
}

describe('useSaving with packing', () => {
  it('writes what packing gives, and the next save starts from the files it grew', async () => {
    const { saver, save } = fakeSaver();
    const film: OpenFilm = { saver, files: OPENED };
    const calls: ProductionFiles[] = [];
    // Each save packs one more model file, and gives back a production for saving only.
    const pack: Pack = async (p, files) => {
      calls.push(files);
      const models = new Map(files.models);
      models.set(`models/m${models.size}/model.glb`, new Uint8Array([models.size]));
      return {
        production: titled(`${p.manifest.title} (packed)`),
        files: { ...files, models },
        missing: [],
      };
    };
    const { result, rerender } = renderHook(
      ({ production }) => useSaving(production, film, null, pack),
      { initialProps: { production: titled('Kite') } },
    );
    await act(() => result.current.save('asked'));
    expect(calls[0]).toBe(OPENED);
    expect(save.mock.calls[0]![0].manifest.title).toBe('Kite (packed)');
    expect([...save.mock.calls[0]![1].models.keys()]).toEqual(['models/m0/model.glb']);

    rerender({ production: titled('Kite 2') });
    await act(() => result.current.save('asked'));
    expect([...calls[1]!.models.keys()]).toEqual(['models/m0/model.glb']);
    expect([...save.mock.calls[1]![1].models.keys()]).toEqual([
      'models/m0/model.glb',
      'models/m1/model.glb',
    ]);
  });

  it('counts the class models this device can’t find', async () => {
    const { saver } = fakeSaver();
    const film: OpenFilm = { saver, files: OPENED };
    const pack: Pack = async (production, files) => ({
      production,
      files,
      missing: ['class/owl', 'class/kite'],
    });
    const { result } = renderHook(() => useSaving(titled('Kite'), film, null, pack));
    await act(() => result.current.save('asked'));
    expect(result.current.status).toMatchObject({
      kind: 'saved',
      missing: ['class/owl', 'class/kite'],
    });
  });

  it('still saves when the class Backstage can’t be read', async () => {
    const { saver, save } = fakeSaver();
    const film: OpenFilm = { saver, files: OPENED };
    const pack: Pack = async () => {
      throw new Error('unreadable');
    };
    const { result } = renderHook(() => useSaving(titled('Kite'), film, null, pack));
    await act(() => result.current.save('asked'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toBe(OPENED);
    expect(result.current.status).toMatchObject({ kind: 'saved', missing: [] });
  });

  it('packs from the models the last save packed, not the ones the film opened with', async () => {
    const { saver, save } = fakeSaver();
    const film: OpenFilm = { saver, files: OPENED };
    const given: string[][] = [];
    const crate = { folder: 'prop-crate', item: { id: 'class/Prop/crate' } } as never;
    // Packing adds the crate the first time; after that it only keeps what it's given.
    const pack: Pack = async (p, files) => {
      given.push(p.manifest.models.map((m) => m.item.id));
      const models = given.length === 1 ? [crate] : p.manifest.models;
      return { production: { ...p, manifest: { ...p.manifest, models } }, files, missing: [] };
    };
    const { result, rerender } = renderHook(
      ({ production }) => useSaving(production, film, null, pack),
      { initialProps: { production: titled('Kite') } },
    );
    await act(() => result.current.save('asked'));
    rerender({ production: titled('Kite 2') });
    await act(() => result.current.save('asked'));
    expect(given[1]).toEqual(['class/Prop/crate']);
    expect(save.mock.calls[1]![0].manifest.models.map((m) => m.item.id)).toEqual([
      'class/Prop/crate',
    ]);
  });

  it('falls back to the packed models and their files together', async () => {
    const { saver, save } = fakeSaver();
    const film: OpenFilm = { saver, files: OPENED };
    const crate = { folder: 'prop-crate', item: { id: 'class/Prop/crate' } } as never;
    const crateFiles = {
      audio: new Map(),
      models: new Map([['models/prop-crate/model.glb', new Uint8Array([1])]]),
    };
    let calls = 0;
    const pack: Pack = async (p) => {
      calls++;
      if (calls > 1) throw new Error('unreadable');
      return {
        production: { ...p, manifest: { ...p.manifest, models: [crate] } },
        files: crateFiles,
        missing: [],
      };
    };
    const { result, rerender } = renderHook(
      ({ production }) => useSaving(production, film, null, pack),
      { initialProps: { production: titled('Kite') } },
    );
    await act(() => result.current.save('asked'));
    rerender({ production: titled('Kite 2') });
    await act(() => result.current.save('asked'));
    const [written, files] = save.mock.calls[1]!;
    expect(written.manifest.models.map((m) => m.item.id)).toEqual(['class/Prop/crate']);
    expect(files).toBe(crateFiles);
  });

  it('gives Save a copy the packed film', async () => {
    const { saver } = fakeSaver();
    const film: OpenFilm = { saver, files: OPENED };
    const pack: Pack = async (p, files) => ({
      production: titled(`${p.manifest.title} (packed)`),
      files,
      missing: [],
    });
    const { result } = renderHook(() => useSaving(titled('Kite'), film, null, pack));
    const copy = await result.current.packed();
    expect(copy.production.manifest.title).toBe('Kite (packed)');
  });
});
