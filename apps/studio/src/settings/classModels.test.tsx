import { importModel, type ImportTools } from '@storystage/backstage-import';
import type { ImportMessage, ImportWorker } from '@storystage/backstage-import/worker-client';
import { browserHost, type ClassFolders, type HostInterface } from '@storystage/host';
import { memoryClassFolders, memoryFilePicker } from '@storystage/host/testing';
import { box, glbFromMesh } from '@storystage/sketches/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ClassSetup } from './ClassSetup.tsx';
import { nameFrom } from './ImportModel.tsx';

// Settings › Class set-up › Class models, and importing a model (07-ux 9.6; spec 17, 5 and 6).

const tools: ImportTools = {
  encodeTexture: async (image) => image,
  encodeThumbnail: async () => ({ bytes: new Uint8Array([1, 2]), mimeType: 'image/webp' }),
};

/** A worker that runs S4's import here, as the real one does in its own thread. */
function inPageWorker(): ImportWorker & { started: number } {
  const listeners: ((event: { data: unknown }) => void)[] = [];
  const worker = {
    started: 0,
    postMessage(message: unknown) {
      const { request } = message as ImportMessage;
      void importModel(new Map(request.files), request.choices, tools, new Set(request.taken)).then(
        (result) => listeners.forEach((l) => l({ data: { type: 'result', result } })),
      );
    },
    addEventListener(type: string, listener: (event: { data: unknown }) => void) {
      if (type === 'message') listeners.push(listener);
    },
    terminate() {},
  };
  return worker;
}

function hostWith(classes: ClassFolders): HostInterface {
  return {
    ...browserHost,
    version: '1.0.0',
    classes,
    picker: memoryFilePicker(),
    storagePersistent: async () => true,
  };
}

async function crateFile() {
  return new File([(await glbFromMesh(box([0, 0, 0], [1, 1, 1]))).slice()], 'wooden_crate.glb');
}

const card = () => screen.getByRole('region', { name: 'Class models' });

describe('importing a model (07-ux 9.6)', () => {
  it('asks for the details, checks the model, reports, and adds it to the class', async () => {
    const classes = memoryClassFolders();
    await classes.addPupil('Sam');
    let started = 0;
    render(
      <ClassSetup
        host={hostWith(classes)}
        startWorker={() => {
          started++;
          return inPageWorker();
        }}
      />,
    );
    expect(
      await within(await screen.findByRole('region', { name: 'Class models' })).findByText(
        'No class models yet.',
      ),
    ).toBeTruthy();
    await userEvent.click(within(card()).getByRole('button', { name: 'Import a model…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import a model' });

    // Nothing runs until the details are there.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check model' }));
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Choose the model’s files first.',
    );
    expect(started).toBe(0);

    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await crateFile());
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveProperty(
      'value',
      'Wooden crate',
    );
    await userEvent.click(within(dialog).getByRole('radio', { name: /A prop/ }));
    await userEvent.click(within(dialog).getByRole('radio', { name: /^CC BY Free, give credit/ }));
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Where is it from?' }),
      'https://models.example.org/crate',
    );

    // CC BY needs its maker: the worker's licence step says so, before reading the model.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check model' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'name who made the model',
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Who made it' }), 'A. Maker');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check model' }));

    expect(
      await within(dialog).findByRole(
        'heading',
        { name: 'What Backstage did' },
        { timeout: 15_000 },
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText('Wooden crate by A. Maker, CC BY 4.0, changed for StoryStage'),
    ).toBeTruthy();
    expect(within(dialog).getByRole('img', { name: 'Wooden crate, in colour' })).toBeTruthy();
    expect(started).toBe(2);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to class models' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await within(card()).findByText('Wooden crate')).toBeTruthy();
    expect(within(card()).getByText(/A prop/)).toBeTruthy();
    expect(screen.getAllByRole('status')[0]!.textContent).toBe(
      'Wooden crate is in the class’s Backstage now.',
    );
    const stored = await classes.backstage().list();
    expect(stored.map((m) => [m.id, m.owner])).toEqual([['class/Prop/wooden-crate', 'class']]);
  }, 30_000);

  it('says why a file can’t be imported', async () => {
    const classes = memoryClassFolders();
    render(<ClassSetup host={hostWith(classes)} startWorker={inPageWorker} />);
    await userEvent.click(
      await within(await screen.findByRole('region', { name: 'Class models' })).findByRole(
        'button',
        { name: 'Import a model…' },
      ),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Import a model' });
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['not a model'], 'notes.glb'));
    await userEvent.click(within(dialog).getByRole('radio', { name: /A prop/ }));
    await userEvent.click(within(dialog).getByRole('radio', { name: /Made it myself/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check model' }));
    expect((await within(dialog).findByRole('alert')).textContent).not.toBe('');
    expect(await classes.backstage().list()).toEqual([]);
  });

  it('moves a model to the bin, restores it, and empties both bins together', async () => {
    const classes = memoryClassFolders();
    const r = await importModel(
      new Map([['crate.glb', await glbFromMesh(box([0, 0, 0], [1, 1, 1]))]]),
      { section: 'props', class: 'Prop', name: 'Crate', licence: { choice: 'own-work' } },
      tools,
    );
    if (!r.ok) throw new Error('import failed');
    await classes.backstage().add('class', r.item.id, r.item, r.files);
    render(<ClassSetup host={hostWith(classes)} startWorker={inPageWorker} />);
    await userEvent.click(
      await within(await screen.findByRole('region', { name: 'Class models' })).findByRole(
        'button',
        { name: 'Move to the bin: Crate' },
      ),
    );
    const bin = await screen.findByRole('region', { name: 'The bin' });
    await userEvent.click(await within(bin).findByRole('button', { name: 'Restore Crate' }));
    expect(await within(card()).findByText('Crate')).toBeTruthy();

    await userEvent.click(within(card()).getByRole('button', { name: 'Move to the bin: Crate' }));
    await userEvent.click(await within(bin).findByRole('button', { name: 'Empty the bin' }));
    const confirm = await screen.findByRole('dialog', { name: 'Empty the bin?' });
    expect(confirm.textContent).toContain('The model in the bin will be deleted.');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Empty the bin' }));
    expect(await within(bin).findByText('The bin is empty.')).toBeTruthy();
    expect(await classes.backstage().bin()).toEqual([]);
  });
});

describe('nameFrom', () => {
  it('makes a name from a file’s name', () => {
    expect(nameFrom('red-dragon_v2.glb')).toBe('Red dragon v2');
    expect(nameFrom('robot.vrm')).toBe('Robot');
  });
});
