import { importModel, type ImportTools } from '@storystage/backstage-import';
import { browserHost, type ClassFolders, type HostInterface } from '@storystage/host';
import { memoryClassFolders, memoryFilePicker } from '@storystage/host/testing';
import {
  exampleProduction,
  openProduction,
  saveProduction,
  type Production,
} from '@storystage/production';
import { box, glbFromMesh } from '@storystage/sketches/testing';
import { backstageId } from '@storystage/story-api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App.tsx';

// A film that uses a class-imported model carries it when the studio saves it (S4's packModels,
// decision 0049): saving, through the whole studio, on a memory host.

const tools: ImportTools = {
  encodeTexture: async (image) => image,
  encodeThumbnail: async () => ({ bytes: new Uint8Array([1, 2]), mimeType: 'image/webp' }),
};

/** A crate imported into the class Backstage, as the teacher's import would. */
async function crateIn(classes: ClassFolders) {
  const r = await importModel(
    new Map([['crate.glb', await glbFromMesh(box([0, 0, 0], [1, 1, 1]))]]),
    { section: 'props', class: 'Prop', name: 'Crate', licence: { choice: 'own-work' } },
    tools,
  );
  if (!r.ok) throw new Error('import failed');
  await classes.backstage().add('class', r.item.id, r.item, r.files);
  return r.item;
}

/** The example production, with its first scene's first object played by `model`, titled. */
function using(model: string, title: string): Production {
  const p = exampleProduction();
  const [first, ...rest] = p.scenes;
  const [object, ...others] = first!.setup.objects;
  const played = { ...object!, model: backstageId(model) };
  return {
    ...p,
    manifest: { ...p.manifest, title },
    scenes: [{ ...first!, setup: { ...first!.setup, objects: [played, ...others] } }, ...rest],
  };
}

function hostWith(classes: ClassFolders, picker = memoryFilePicker()): HostInterface {
  return {
    ...browserHost,
    version: '1.0.0',
    classes,
    picker,
    storagePersistent: async () => true,
  };
}

const NO_FILES = { audio: new Map<string, Uint8Array>(), models: new Map<string, Uint8Array>() };

describe('saving packs the film’s class models', { timeout: 30_000 }, () => {
  it('saves a film with the class model it uses, so it opens anywhere', async () => {
    const classes = memoryClassFolders();
    const sam = await classes.addPupil('Sam');
    const crate = await crateIn(classes);
    // A film that uses the crate, saved before packing existed: the model isn't in it yet.
    const folder = await classes.folder(sam.id);
    await folder.write(null, 'Crates', saveProduction(using(crate.id, 'Crates'), NO_FILES));

    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.click(await screen.findByRole('row', { name: /Crates/ }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Title' }), '!');
    await userEvent.keyboard('{Control>}s{/Control}');

    await waitFor(async () => {
      const [film] = await folder.list();
      const opened = openProduction(await folder.read(film!.key));
      expect(opened.status).toBe('ok');
      if (opened.status !== 'ok') return;
      expect(opened.production.manifest.title).toBe('Crates!');
      expect(opened.production.manifest.models.map((m) => m.item.id)).toEqual([crate.id]);
      expect(opened.files.models.size).toBeGreaterThan(0);
    });
  });

  it('keeps a packed model when the class Backstage has since lost it (spec 03, 1.3)', async () => {
    const classes = memoryClassFolders();
    const sam = await classes.addPupil('Sam');
    const crate = await crateIn(classes);
    const folder = await classes.folder(sam.id);
    await folder.write(null, 'Crates', saveProduction(using(crate.id, 'Crates'), NO_FILES));
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.click(await screen.findByRole('row', { name: /Crates/ }));
    const title = await screen.findByRole('textbox', { name: 'Title' });
    await userEvent.type(title, '!');
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(async () => {
      const [film] = await folder.list();
      const opened = openProduction(await folder.read(film!.key));
      expect(opened.status === 'ok' && opened.production.manifest.title).toBe('Crates!');
    });
    // The class bins the crate; the film, already carrying it, keeps it.
    await classes.backstage().remove(crate.id);
    await userEvent.type(title, '?');
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(async () => {
      const [film] = await folder.list();
      const opened = openProduction(await folder.read(film!.key));
      expect(opened.status).toBe('ok');
      if (opened.status !== 'ok') return;
      expect(opened.production.manifest.title).toBe('Crates!?');
      expect(opened.production.manifest.models.map((m) => m.item.id)).toEqual([crate.id]);
    });
    expect(screen.queryByText(/doesn’t have/)).toBeNull();
  });

  it('says when the film uses a model this device doesn’t have', async () => {
    const classes = memoryClassFolders();
    const sam = await classes.addPupil('Sam');
    const folder = await classes.folder(sam.id);
    await folder.write(
      null,
      'Owls',
      saveProduction(using('class/Prop/owl-from-another-device', 'Owls'), NO_FILES),
    );
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.click(await screen.findByRole('row', { name: /Owls/ }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Title' }), '!');
    await userEvent.keyboard('{Control>}s{/Control}');
    expect(
      await screen.findByText(
        'This film uses imported models this device doesn’t have: owl from another device. They’re shown as outlines, and the film still saves.',
      ),
    ).toBeTruthy();
  });

  it('gives Save a copy the packed film', async () => {
    const classes = memoryClassFolders();
    const sam = await classes.addPupil('Sam');
    const crate = await crateIn(classes);
    const folder = await classes.folder(sam.id);
    await folder.write(null, 'Crates', saveProduction(using(crate.id, 'Crates'), NO_FILES));
    const picker = memoryFilePicker();
    render(<App host={hostWith(classes, picker)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.click(await screen.findByRole('row', { name: /Crates/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Film:/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Save a copy…' }));
    await waitFor(() => expect(picker.saved).toHaveLength(1));
    const copy = openProduction(picker.saved[0]!.bytes);
    expect(copy.status === 'ok' && copy.production.manifest.models.map((m) => m.item.id)).toEqual([
      crate.id,
    ]);
  });
});
