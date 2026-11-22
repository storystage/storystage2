import { browserHost, type ClassFolders, type HostInterface } from '@storystage/host';
import { memoryClassFolders, memoryFilePicker } from '@storystage/host/testing';
import { StudySession, StudyStore, readExport, showCode } from '@storystage/study';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ClassSetup } from '../settings/ClassSetup.tsx';

// Study mode in Class set-up (spec 14 sections 6.1, 6.2 and 6.8): the tick beside each pupil,
// and the Study card's class code, age band, sessions, Delete and Export study logs.

function hostWith(
  classes: ClassFolders,
  options: { on?: boolean; trusted?: boolean } = {},
): HostInterface & { picker: ReturnType<typeof memoryFilePicker> } {
  const picker = memoryFilePicker();
  return {
    ...browserHost,
    version: '1.0.0',
    classes,
    picker,
    policy: {
      ...browserHost.policy,
      trusted: options.trusted ?? true,
      study: { enabled: options.on ?? true },
    },
    storagePersistent: async () => true,
  };
}

async function classOf(...names: string[]) {
  const classes = memoryClassFolders();
  const pupils = [];
  for (const name of names) pupils.push(await classes.addPupil(name));
  return { classes, pupils };
}

/** A session that switched editor once, so it's kept. */
async function keptSession(store: StudyStore) {
  const session = new StudySession({
    store,
    context: {
      date: '2026-11-17',
      version: '1.0.0',
      classCode: null,
      ageBand: null,
      editorDefault: 'blocks',
      editorLocked: false,
      editor: 'blocks',
    },
  });
  session.switched('blocks', 'tiles');
  await session.flush();
  return session.code;
}

const pupilsList = () => screen.findByRole('grid', { name: 'Pupils and folders' });
/** A pupil's tick, in their row. */
const tick = (list: HTMLElement, name: string) =>
  within(within(list).getByRole('row', { name: new RegExp(name) })).getByRole<HTMLInputElement>(
    'checkbox',
    {
      name: `Taking part in the study: ${name}`,
    },
  );
const studyCard = () => screen.findByRole('region', { name: 'Study' });

describe('study mode in Class set-up', () => {
  it('shows nothing of the study while it is off, or not from a trusted source', async () => {
    for (const options of [{ on: false }, { trusted: false }]) {
      const { classes } = await classOf('Ava');
      const { unmount } = render(<ClassSetup host={hostWith(classes, options)} />);
      await pupilsList();
      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(screen.queryByRole('region', { name: 'Study' })).toBeNull();
      unmount();
    }
  });

  it('ticks who takes part, keeps the ticks in the study’s store, and forgets a removed pupil', async () => {
    const { classes, pupils } = await classOf('Ava', 'Ben');
    const host = hostWith(classes);
    const store = new StudyStore(classes.study());
    render(<ClassSetup host={host} />);
    const list = await pupilsList();
    const user = userEvent.setup();
    await user.click(tick(list, 'Ava'));
    await waitFor(async () =>
      expect([...(await store.takingPart(pupils.map((p) => p.id)))]).toEqual([pupils[0]!.id]),
    );
    // Never in the pupil's folder: only the study's own files.
    expect(await classes.study().list([])).toEqual(['taking-part.json']);
    await waitFor(() => expect(tick(list, 'Ava').checked).toBe(true));

    // Removing Ava takes her tick away.
    await user.click(within(list).getByRole('row', { name: /Ava/ }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }),
    );
    await waitFor(async () =>
      expect([...(await store.takingPart(pupils.map((p) => p.id)))]).toEqual([]),
    );
  });

  it('keeps the study class code and age band, and refuses a code that won’t do', async () => {
    const { classes } = await classOf('Ava');
    const host = hostWith(classes);
    render(<ClassSetup host={host} />);
    const card = await studyCard();
    const user = userEvent.setup();
    const code = within(card).getByRole('textbox', { name: 'Study class code' });
    await user.type(code, 'Oak class');
    expect(within(card).getByText('Use only letters, digits and dashes, 12 at most.')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    await user.clear(code);
    await user.type(code, 'GB-0417');
    await user.click(within(card).getByRole('radio', { name: '9–11' }));
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(async () =>
      expect(await new StudyStore(classes.study()).settings()).toEqual({
        classCode: 'GB-0417',
        ageBand: '9-11',
      }),
    );
  });

  it('lists the sessions kept, and deletes one only once asked', async () => {
    const { classes } = await classOf('Ava');
    const host = hostWith(classes);
    const store = new StudyStore(classes.study());
    const code = await keptSession(store);
    render(<ClassSetup host={host} />);
    const card = await studyCard();
    expect(within(card).getByText(`Session ${showCode(code)}`)).toBeTruthy();
    expect(within(card).getByText('2026-11-17 · 0 tasks')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(
      within(card).getByRole('button', { name: `Delete session ${showCode(code)}` }),
    );
    const asked = await screen.findByRole('dialog', { name: `Delete session ${showCode(code)}?` });
    await user.click(within(asked).getByRole('button', { name: 'Delete' }));
    await waitFor(async () => expect(await store.sessions()).toEqual([]));
    expect(
      await within(card).findByText('No study sessions are kept on this device.'),
    ).toBeTruthy();
  });

  it('exports every session in one file, then deletes them from the device if asked', async () => {
    const { classes } = await classOf('Ava');
    const host = hostWith(classes);
    const store = new StudyStore(classes.study());
    const codes = [await keptSession(store), await keptSession(store)];
    render(<ClassSetup host={host} />);
    const card = await studyCard();
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', { name: 'Export study logs' }));
    const asked = await screen.findByRole('dialog', {
      name: 'Delete these logs from this device?',
    });
    const [file] = host.picker.saved;
    expect(file!.name).toMatch(/^study-logs-\d{4}-\d{2}-\d{2}-[a-z0-9]{8}\.json$/);
    expect(
      readExport(file!.bytes)
        .sessions.map((s) => s.code)
        .sort(),
    ).toEqual([...codes].sort());
    await user.click(within(asked).getByRole('button', { name: 'Delete from this device' }));
    await waitFor(async () => expect(await store.sessions()).toEqual([]));
  });

  it('keeps the logs for now if the teacher says so, and shows the card while logs are kept', async () => {
    const { classes } = await classOf('Ava');
    const host = hostWith(classes, { on: false });
    const store = new StudyStore(classes.study());
    await keptSession(store);
    render(<ClassSetup host={host} />);
    // Study mode is off, but the logs kept are still the teacher's to export or delete.
    const card = await studyCard();
    expect(screen.queryByRole('checkbox')).toBeNull();
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', { name: 'Export study logs' }));
    const asked = await screen.findByRole('dialog', {
      name: 'Delete these logs from this device?',
    });
    await user.click(within(asked).getByRole('button', { name: 'Keep for now' }));
    expect(await store.sessions()).toHaveLength(1);
  });
});
