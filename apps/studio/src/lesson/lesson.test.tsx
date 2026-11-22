import {
  FileError,
  browserHost,
  type ClassFolders,
  type HostInterface,
  type PupilFolder,
} from '@storystage/host';
import { memoryClassFolders, memoryFilePicker } from '@storystage/host/testing';
import {
  ProductionSaver,
  exampleProduction,
  openProduction,
  type ProductionFiles,
} from '@storystage/production';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { sinceWords } from './LessonPages.tsx';

const NO_FILES: ProductionFiles = { audio: new Map(), models: new Map() };
const SLOW = { timeout: 4000 };

function hostWith(classes: ClassFolders, picker = memoryFilePicker()): HostInterface {
  // A Tauri app's host: no browser note, unless a test asks for one.
  return { ...browserHost, version: '1.0.0', classes, picker, storagePersistent: async () => true };
}

async function classOf(...names: string[]) {
  const classes = memoryClassFolders();
  const pupils = [];
  for (const name of names) pupils.push(await classes.addPupil(name));
  return { classes, pupils };
}

/** Saves the example production into the pupil's folder, titled `title`. */
async function saveFilm(classes: ClassFolders, pupil: string, title: string) {
  const folder = await classes.folder(pupil);
  const p = exampleProduction();
  const titled = { ...p, manifest: { ...p.manifest, title } };
  const saved = await new ProductionSaver(folder, { key: null }).save(titled, NO_FILES, 'asked');
  if (!saved.ok) throw new Error(saved.problem.message);
  return folder;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('the name page (07-ux 9.1)', () => {
  it('lists the class by name, and finds a name as it is typed', async () => {
    const { classes } = await classOf('Sam', 'Ana', 'Pip');
    render(<App host={hostWith(classes)} />);
    const names = await screen.findByRole('grid', { name: 'Names' });
    expect(
      within(names)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual(['Ana', 'Pip', 'Sam']);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search names' }), 'p');
    expect(
      within(names)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual(['Pip']);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search names' }), 'z');
    expect(screen.getByText(/No name matches/)).toBeTruthy();
  });

  it('opens a new film for a pupil with none, under the Film menu', async () => {
    const { classes } = await classOf('Sam');
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    const film = await screen.findByRole('button', { name: 'Film: Untitled film · Sam' });
    expect(film.textContent).toContain('Sam');
  });
});

describe('My films (07-ux 9.1)', () => {
  it('lists the films newest first, after New film, and opens one', async () => {
    const { classes, pupils } = await classOf('Sam');
    await saveFilm(classes, pupils[0]!.id, 'The Lost Kite');
    await saveFilm(classes, pupils[0]!.id, 'Moon Garden');
    await classes.close();
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    const films = await screen.findByRole('grid', { name: 'My films' });
    expect(screen.getByRole('heading', { name: 'Sam’s films' })).toBeTruthy();
    const rows = within(films).getAllByRole('row');
    expect(rows.map((r) => r.querySelector('.ls-film-name')?.textContent)).toEqual([
      'New film',
      'Moon Garden',
      'The Lost Kite',
    ]);
    await userEvent.click(rows[2]!);
    expect(await screen.findByRole('button', { name: 'Film: The Lost Kite · Sam' })).toBeTruthy();
  });

  it('offers the earlier versions of a film that can’t be opened', async () => {
    const { classes, pupils } = await classOf('Sam');
    const folder = await saveFilm(classes, pupils[0]!.id, 'The Lost Kite');
    const [info] = await folder.list();
    // A later save that is not a production: the first version becomes a backup.
    await folder.write(info!.key, info!.name, new TextEncoder().encode('not a film'));
    await classes.close();
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.click(await screen.findByRole('row', { name: /The Lost Kite/ }));
    expect(
      await screen.findByRole('heading', { name: 'This film couldn’t be opened' }),
    ).toBeTruthy();
    expect(screen.getByRole('alert').textContent).not.toBe('');
    await userEvent.click(screen.getByRole('button', { name: /Open the version saved/ }));
    expect(await screen.findByRole('button', { name: 'Film: The Lost Kite · Sam' })).toBeTruthy();
    // The earlier version is the film now, before any change: the next lesson opens it.
    const now = openProduction(await folder.read(info!.key));
    expect(now.status === 'ok' && now.production.manifest.title).toBe('The Lost Kite');
  });
});

describe('saving (07-ux 9.2)', () => {
  it('saves a moment after a change, and says so', async () => {
    const { classes, pupils } = await classOf('Sam');
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Title' }), 'Kite');
    expect(await screen.findByRole('status', {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved'), SLOW);
    const folder = await classes.folder(pupils[0]!.id);
    const [film] = await folder.list();
    const opened = openProduction(await folder.read(film!.key));
    expect(opened.status === 'ok' && opened.production.manifest.title).toBe('Kite');
  });

  it('saves now with Ctrl+S, without waiting', async () => {
    const { classes, pupils } = await classOf('Sam');
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Title' }), 'K');
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(async () => {
      const folder = await classes.folder(pupils[0]!.id);
      expect(await folder.list()).toHaveLength(1);
    });
  });

  it('says why a save failed, in S4’s words, with Try again', async () => {
    const classes = memoryClassFolders(() => new Date(), 10);
    await classes.addPupil('Sam');
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Title' }), 'K');
    await userEvent.keyboard('{Control>}s{/Control}');
    expect((await screen.findByRole('alert')).textContent).not.toBe('');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('keeps a film open when it couldn’t be saved before leaving it', async () => {
    const classes = memoryClassFolders(() => new Date(), 10);
    await classes.addPupil('Sam');
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Title' }), 'K');
    await userEvent.click(screen.getByRole('button', { name: 'Film: K · Sam' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'My films' }));
    expect((await screen.findByRole('alert')).textContent).not.toBe('');
    expect(screen.queryByRole('grid', { name: 'My films' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveProperty('value', 'K');
  });

  it('says once, in the browser, where the films are kept', async () => {
    const { classes } = await classOf('Sam');
    const host = { ...hostWith(classes), version: null };
    const first = render(<App host={host} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    expect(await screen.findByText(/kept in this browser on this device/)).toBeTruthy();
    first.unmount();
    await classes.close();
    render(<App host={host} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await screen.findByRole('button', { name: /^Film:/ });
    expect(screen.queryByText(/kept in this browser on this device/)).toBeNull();
  });
});

describe('the Film menu (07-ux 9.3)', () => {
  it('goes back to My films, and to the name page', async () => {
    const { classes } = await classOf('Sam', 'Ana');
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Title' }), 'Kite');
    await userEvent.click(screen.getByRole('button', { name: 'Film: Kite · Sam' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'My films' }));
    const films = await screen.findByRole('grid', { name: 'My films' });
    // Leaving the film saved it.
    expect(within(films).getByRole('row', { name: /Kite/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Switch pupil' }));
    expect(await screen.findByRole('heading', { name: 'Who’s making films today?' })).toBeTruthy();
  });

  it('saves a copy through the picker', async () => {
    const { classes } = await classOf('Sam');
    const picker = memoryFilePicker();
    render(<App host={hostWith(classes, picker)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Film:/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Save a copy…' }));
    await waitFor(() => expect(picker.saved).toHaveLength(1));
  });

  it('offers Switch pupil with a class list', async () => {
    const { classes } = await classOf('Sam');
    render(<App host={hostWith(classes)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Film:/ }));
    expect(await screen.findByRole('menuitem', { name: 'Switch pupil' })).toBeTruthy();
  });
});

describe('without a class list', () => {
  it('opens the studio, with no name page', async () => {
    render(<App host={hostWith(memoryClassFolders())} />);
    expect(await screen.findByRole('textbox', { name: 'Title' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Who’s making films today?' })).toBeNull();
  });
});

describe('a folder that can’t be opened', () => {
  it('goes to the name page when a name was added as the device’s folder opened', async () => {
    const { classes } = await classOf('Sam');
    let asked = 0;
    // The first look finds no names; by the time the device's folder opens, Sam is there.
    const racing = {
      ...classes,
      pupils: () => (asked++ === 0 ? Promise.resolve([]) : classes.pupils()),
      openDevice: (): Promise<PupilFolder> => Promise.reject(new FileError('invalid')),
    };
    render(<App host={hostWith(racing)} />);
    expect(await screen.findByRole('row', { name: 'Sam' })).toBeTruthy();
  });

  it('says so on the name page when a pupil’s folder won’t open', async () => {
    const { classes } = await classOf('Sam');
    const broken = { ...classes, open: () => Promise.reject(new FileError('unreadable')) };
    render(<App host={hostWith(broken)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t be opened/);
    expect(screen.getByRole('row', { name: 'Sam' })).toBeTruthy();
  });

  it('says when the device is full, and tries again', async () => {
    const classes = memoryClassFolders();
    let full = true;
    const device = {
      ...classes,
      openDevice: async (): Promise<PupilFolder> => {
        if (full) throw new FileError('full');
        return classes.open((await classes.addPupil('Device')).id);
      },
    };
    render(<App host={hostWith(device)} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/no room left/);
    full = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /^Film:/ })).toBeTruthy();
  });
});

describe('sinceWords', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  it('says how long ago, in the largest unit that fits', () => {
    expect(sinceWords('2026-11-08T11:59:40Z', now)).toBe('this minute');
    expect(sinceWords('2026-11-08T11:50:00Z', now)).toBe('10 minutes ago');
    expect(sinceWords('2026-11-07T12:00:00Z', now)).toBe('yesterday');
  });
});
