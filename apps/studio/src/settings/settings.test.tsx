import {
  browserHost,
  type ClassFolders,
  type HostInterface,
  type PrompterUsage,
} from '@storystage/host';
import { memoryClassFolders, memoryFilePicker } from '@storystage/host/testing';
import {
  ProductionSaver,
  exampleProduction,
  saveProduction,
  type ProductionFiles,
} from '@storystage/production';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { ClassSetup } from './ClassSetup.tsx';

const NO_FILES: ProductionFiles = { audio: new Map(), models: new Map() };

function hostWith(
  classes: ClassFolders,
  picker = memoryFilePicker(),
  prompterUsage: PrompterUsage | null = null,
): HostInterface {
  return { ...browserHost, version: '1.0.0', classes, picker, prompterUsage };
}

async function classOf(...names: string[]) {
  const classes = memoryClassFolders();
  const pupils = [];
  for (const name of names) pupils.push(await classes.addPupil(name));
  return { classes, pupils };
}

function titled(title: string) {
  const p = exampleProduction();
  return { ...p, manifest: { ...p.manifest, title } };
}

async function saveFilm(classes: ClassFolders, pupil: string, title: string) {
  const saved = await new ProductionSaver(await classes.folder(pupil), { key: null }).save(
    titled(title),
    NO_FILES,
    'asked',
  );
  if (!saved.ok) throw new Error(saved.problem.message);
  return saved.key;
}

const pupilRows = async () =>
  within(await screen.findByRole('grid', { name: 'Pupils and folders' }))
    .getAllByRole('row')
    .map((r) => r.querySelector('.st-row-name')?.textContent);

const bin = () => screen.getByRole('region', { name: 'The bin' });
const collectCard = () => screen.getByRole('region', { name: 'Collect and hand back' });

describe('Pupils and folders (07-ux 9.4)', () => {
  it('lists the class with how many films each has', async () => {
    const { classes, pupils } = await classOf('Sam', 'Ana');
    await saveFilm(classes, pupils[0]!.id, 'Kite');
    await saveFilm(classes, pupils[0]!.id, 'Moon');
    render(<ClassSetup host={hostWith(classes)} />);
    expect(await pupilRows()).toEqual(['Ana', 'Sam']);
    expect(screen.getByRole('row', { name: 'Open Sam’s folder' }).textContent).toContain('2 films');
    expect(screen.getByText('2 pupils')).toBeTruthy();
  });

  it('adds a pupil, and refuses a name already in the class', async () => {
    const { classes } = await classOf('Sam');
    render(<ClassSetup host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add pupil' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'sam');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'There’s already a pupil called sam.',
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' K.{Enter}');
    await waitFor(async () => expect(await pupilRows()).toEqual(['Sam', 'sam K.']));
  });

  it('imports a pasted class list, leaving out what can’t be added', async () => {
    const { classes } = await classOf('Sam');
    render(<ClassSetup host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Import class list' }));
    const paste = screen.getByRole('textbox', { name: 'Names, one a line' });
    await userEvent.click(paste);
    await userEvent.paste('Ana\nSam\nana\nPip');
    const preview = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(preview).toEqual([
      'AnaWill be added',
      'SamAlready in the class',
      'anaListed twice',
      'PipWill be added',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Add 2 pupils' }));
    await waitFor(async () => expect(await pupilRows()).toEqual(['Ana', 'Pip', 'Sam']));
  });

  it('renames a pupil, and removes one, their films going to the bin', async () => {
    const { classes, pupils } = await classOf('Sam', 'Ana');
    await saveFilm(classes, pupils[0]!.id, 'Kite');
    render(<ClassSetup host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Open Ana’s folder' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const rename = await screen.findByRole('dialog');
    const field = within(rename).getByRole('textbox', { name: 'Name' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Ana B.{Enter}');
    expect(await screen.findByRole('heading', { name: 'Ana B.' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'All pupils' }));
    await userEvent.click(await screen.findByRole('row', { name: 'Open Sam’s folder' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const remove = await screen.findByRole('dialog', { name: 'Remove Sam?' });
    expect(remove.textContent).toContain('Sam comes off the class list, and their film goes');
    await userEvent.click(within(remove).getByRole('button', { name: 'Remove' }));
    await waitFor(async () => expect(await pupilRows()).toEqual(['Ana B.']));
    // In the bin, but not restorable until the pupil can be put back (S8's #262).
    expect(within(bin()).getByText(/A pupil no longer in the class/)).toBeTruthy();
    expect(
      within(bin()).getByRole('button', { name: 'Restore Kite' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('moves a film to the bin and restores it, and empties the bin after asking', async () => {
    const { classes, pupils } = await classOf('Sam');
    await saveFilm(classes, pupils[0]!.id, 'Kite');
    render(<ClassSetup host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Open Sam’s folder' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move to the bin: Kite' }));
    expect(await within(bin()).findByText('Kite')).toBeTruthy();
    expect(within(bin()).getByText(/Sam’s/)).toBeTruthy();
    expect(screen.getByText('No films yet.')).toBeTruthy();

    await userEvent.click(within(bin()).getByRole('button', { name: 'Restore Kite' }));
    expect(await screen.findByRole('button', { name: 'Move to the bin: Kite' })).toBeTruthy();
    expect(within(bin()).getByText('The bin is empty.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Move to the bin: Kite' }));
    await userEvent.click(await within(bin()).findByRole('button', { name: 'Empty the bin' }));
    const dialog = await screen.findByRole('dialog', { name: 'Empty the bin?' });
    expect(dialog.textContent).toContain('can’t be undone');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Empty the bin' }));
    expect(await within(bin()).findByText('The bin is empty.')).toBeTruthy();
    expect(await classes.bin()).toEqual([]);
  });

  it('won’t remove the pupil whose folder is open, nor bin the open film', async () => {
    const { classes, pupils } = await classOf('Sam');
    const key = await saveFilm(classes, pupils[0]!.id, 'Kite');
    render(<ClassSetup host={hostWith(classes)} open={{ pupil: pupils[0]!.id, film: key }} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Open Sam’s folder' }));
    expect(screen.getByRole('button', { name: 'Remove' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Sam’s folder is open/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Move to the bin: Kite' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

describe('films kept from before the class list (07-ux 9.4)', () => {
  it('lists the device’s films once the class has names, and moves them to a pupil', async () => {
    const classes = memoryClassFolders();
    const device = await classes.openDevice();
    await new ProductionSaver(device, { key: null }).save(titled('Owl Night'), NO_FILES, 'asked');
    await classes.close();
    const sam = await classes.addPupil('Sam');
    render(<ClassSetup host={hostWith(classes)} />);
    const card = await screen.findByRole('region', {
      name: 'Films kept from before the class list',
    });
    expect(within(card).getByText('Owl Night')).toBeTruthy();
    await userEvent.click(within(card).getByRole('button', { name: 'Move these films to…' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sam' }));
    await waitFor(() =>
      expect(screen.getAllByRole('status')[0]!.textContent).toBe('Moved 1 film to Sam’s folder.'),
    );
    expect(
      screen.queryByRole('region', { name: 'Films kept from before the class list' }),
    ).toBeNull();
    expect((await (await classes.folder(sam.id)).list()).map((i) => i.name)).toEqual(['Owl Night']);
  });

  it('leaves them while the device’s folder is open in the studio', async () => {
    const classes = memoryClassFolders();
    const device = await classes.openDevice();
    await new ProductionSaver(device, { key: null }).save(titled('Owl Night'), NO_FILES, 'asked');
    await classes.close();
    await classes.addPupil('Sam');
    render(<ClassSetup host={hostWith(classes)} open={{ pupil: 'device', film: null }} />);
    const card = await screen.findByRole('region', {
      name: 'Films kept from before the class list',
    });
    expect(within(card).getByText(/open in the studio now/)).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Move these films to…' })).toBeNull();
  });
});

describe('Collect and Hand back (07-ux 9.4)', () => {
  it('collects every pupil’s films, and hands back what it can', async () => {
    const { classes, pupils } = await classOf('Sam', 'Ana');
    await saveFilm(classes, pupils[0]!.id, 'Kite');
    await saveFilm(classes, pupils[1]!.id, 'Moon');
    const picker = memoryFilePicker({
      handBack: () => [
        { folder: 'Sam', file: 'Kite.storystage', bytes: saveProduction(titled('Kite'), NO_FILES) },
        { folder: 'Nobody', file: 'Owl.storystage', bytes: new Uint8Array([1]) },
      ],
    });
    render(<ClassSetup host={hostWith(classes, picker)} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Collect…' }));
    await waitFor(() =>
      expect(within(collectCard()).getByRole('status').textContent).toBe('Collected 2 films.'),
    );
    expect(picker.collected.map((f) => `${f.folder}/${f.file}`).sort()).toEqual([
      'Ana/Moon.storystage',
      'Sam/Kite.storystage',
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Hand back…' }));
    await waitFor(() =>
      expect(within(collectCard()).getByRole('status').textContent).toBe('Handed back 1 film.'),
    );
    expect(screen.getByText('Nobody / Owl.storystage')).toBeTruthy();
    expect(screen.getByText(/no pupil called Nobody in this class/)).toBeTruthy();
    expect(await screen.findByRole('row', { name: 'Open Sam’s folder' })).toHaveProperty(
      'textContent',
      expect.stringContaining('2 films'),
    );
  });
});

describe('the Prompter’s use today (07-ux 9.4)', () => {
  it('lists each pupil’s requests against the limit, and the device’s', async () => {
    const { classes, pupils } = await classOf('Sam');
    const usage: PrompterUsage = {
      today: async () => ({
        date: '2026-11-08',
        level: 'planOnly',
        dailyCap: 20,
        capAction: 'explainOnly',
        entries: [
          { pupil: pupils[0]!.id, used: 7, level: 'planOnly' },
          { pupil: null, used: 2, level: 'planOnly' },
          { pupil: 'pupil-gone', used: 1, level: 'planOnly' },
        ],
      }),
    };
    render(<ClassSetup host={hostWith(classes, memoryFilePicker(), usage)} />);
    const table = await screen.findByRole('table');
    expect(
      within(table)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual([
      'PupilRequests today',
      'Sam7 of 20',
      'This device2 of 20',
      'A pupil no longer in the class1 of 20',
    ]);
  });
});

describe('reaching Settings from the name page', () => {
  it('opens Class set-up, and goes back to the names it changed', async () => {
    const { classes } = await classOf('Sam');
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Class set-up' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add pupil' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Ana{Enter}');
    await screen.findByRole('row', { name: 'Open Ana’s folder' });
    await userEvent.click(screen.getByRole('button', { name: 'Back to the names' }));
    const names = await screen.findByRole('grid', { name: 'Names' });
    expect(
      within(names)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual(['Ana', 'Sam']);
  });
});

describe('Settings in the studio', () => {
  it('opens Class set-up over the studio, its rows working', async () => {
    const { classes } = await classOf('Sam');
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await screen.findByRole('textbox', { name: 'Title' });
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(await screen.findByRole('row', { name: 'Open Sam’s folder' }));
    expect(await screen.findByRole('heading', { name: 'Sam' })).toBeTruthy();
  });
});
