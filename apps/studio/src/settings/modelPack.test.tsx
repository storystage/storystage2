import { importModel, serveImports, type ImportTools } from '@storystage/backstage-import';
import type { ImportWorker } from '@storystage/backstage-import/worker-client';
import { browserHost, type ClassFolders, type HostInterface } from '@storystage/host';
import { memoryClassFolders, memoryFilePicker } from '@storystage/host/testing';
import { box, glbFromMesh } from '@storystage/sketches/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ClassSetup } from './ClassSetup.tsx';
import { MODEL_PACK_NAME, modelName } from './ModelPack.tsx';

// Save models and Open models (spec 17, section 5; 07-ux 9.6): S4's real worker side, served in
// the page through a pair of ports, so the pack is checked as the app checks it.

const tools: ImportTools = {
  encodeTexture: async (image) => image,
  encodeThumbnail: async () => ({ bytes: new Uint8Array([1, 2]), mimeType: 'image/webp' }),
};

/** A worker running S4's `serveImports` here: messages cross as they would between threads. */
function servedWorker(): ImportWorker {
  const toPage: ((event: { data: unknown }) => void)[] = [];
  const toWorker: ((event: { data: unknown }) => void)[] = [];
  serveImports(
    {
      postMessage: (data) => queueMicrotask(() => toPage.forEach((l) => l({ data }))),
      addEventListener: (_type, listener) => void toWorker.push(listener),
    },
    tools,
  );
  return {
    postMessage: (data: unknown) => queueMicrotask(() => toWorker.forEach((l) => l({ data }))),
    addEventListener: (type: string, listener: (event: { data: unknown }) => void) => {
      if (type === 'message') toPage.push(listener);
    },
    terminate: () => {},
  } as ImportWorker;
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

async function withCrate() {
  const classes = memoryClassFolders();
  const r = await importModel(
    new Map([['crate.glb', await glbFromMesh(box([0, 0, 0], [1, 1, 1]))]]),
    { section: 'props', class: 'Prop', name: 'Crate', licence: { choice: 'own-work' } },
    tools,
  );
  if (!r.ok) throw new Error('import failed');
  await classes.backstage().add('class', r.item.id, r.item, r.files);
  return classes;
}

const card = async () => screen.findByRole('region', { name: 'Class models' });

describe('Save models and Open models', { timeout: 30_000 }, () => {
  it('saves the class’s models to one file, and opens them in another class', async () => {
    const picker = memoryFilePicker();
    const first = render(
      <ClassSetup host={hostWith(await withCrate(), picker)} startWorker={servedWorker} />,
    );
    await userEvent.click(within(await card()).getByRole('button', { name: 'Save models…' }));
    await waitFor(() => expect(picker.saved).toHaveLength(1));
    expect(picker.saved[0]!.name).toBe(MODEL_PACK_NAME);
    expect(within(await card()).getByRole('status').textContent).toMatch(/models are saved/);
    first.unmount();

    const other = memoryClassFolders();
    render(<ClassSetup host={hostWith(other)} startWorker={servedWorker} />);
    expect(
      within(await card())
        .getByRole('button', { name: 'Save models…' })
        .hasAttribute('disabled'),
    ).toBe(true);
    await userEvent.upload(
      screen.getByLabelText('A file of class models to open'),
      new File([picker.saved[0]!.bytes.slice()], MODEL_PACK_NAME),
    );
    await waitFor(
      async () =>
        expect(within(await card()).getByRole('status').textContent).toBe(
          'Added 1 model to the class.',
        ),
      { timeout: 15_000 },
    );
    expect(await within(await card()).findByText('Crate', { exact: true })).toBeTruthy();
    expect((await other.backstage().list()).map((m) => m.owner)).toEqual(['class']);
  });

  it('leaves out a model the class already has, and says why', async () => {
    const classes = await withCrate();
    const picker = memoryFilePicker();
    render(<ClassSetup host={hostWith(classes, picker)} startWorker={servedWorker} />);
    await userEvent.click(within(await card()).getByRole('button', { name: 'Save models…' }));
    await waitFor(() => expect(picker.saved).toHaveLength(1));
    await userEvent.upload(
      screen.getByLabelText('A file of class models to open'),
      new File([picker.saved[0]!.bytes.slice()], MODEL_PACK_NAME),
    );
    await waitFor(
      async () =>
        expect(within(await card()).getByRole('status').textContent).toBe(
          'Added 0 models to the class.',
        ),
      { timeout: 15_000 },
    );
    expect(within(await card()).getByRole('heading', { name: 'Left out' })).toBeTruthy();
    expect((await classes.backstage().list()).length).toBe(1);
  });

  it('says plainly when a file isn’t a model pack', async () => {
    render(<ClassSetup host={hostWith(memoryClassFolders())} startWorker={servedWorker} />);
    await card();
    await userEvent.upload(
      screen.getByLabelText('A file of class models to open'),
      new File(['not a pack'], 'notes.storystage-models'),
    );
    await waitFor(async () =>
      expect(within(await card()).getByRole('status').textContent).not.toMatch(/^$|Opening/),
    );
  });
});

describe('modelName', () => {
  it('names a model from its id, as missing models are named', () => {
    expect(modelName('class/Prop/big-crate')).toBe('big crate');
  });
});
