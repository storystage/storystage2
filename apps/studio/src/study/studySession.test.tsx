import { browserHost, type HostInterface, type PupilFolder } from '@storystage/host';
import { memoryClassFolders } from '@storystage/host/testing';
import { exampleProduction } from '@storystage/production';
import { StudyStore, type StudyEvent } from '@storystage/study';
import { ThemeRoot } from '@storystage/ui';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { editorSetting } from '../production/editorSetting.ts';
import { useStudio, type Studio } from '../studio.ts';
import { StudyBar, StudyQuestion } from './StudyBar.tsx';
import { forgetDeviceAnswer, useStudy, type Study } from './useStudy.ts';

// The study session in the studio (spec 14 sections 6.2, 6.3 and 6.6): who takes part, the bar
// with the session's code, the question with no class list, and what the session is told.

type Classes = ReturnType<typeof memoryClassFolders>;

function hostWith(classes: Classes, on = true): HostInterface {
  return {
    ...browserHost,
    version: '1.0.0',
    classes,
    policy: { ...browserHost.policy, trusted: true, study: { enabled: on } },
  };
}

let latest: { studio: Studio; study: Study } | null = null;

function Harness(props: {
  host: HostInterface;
  folder: PupilFolder | null;
  hasClass: boolean;
  inStudio?: boolean;
}) {
  const studio = useStudio(exampleProduction());
  const study = useStudy({ ...props, inStudio: props.inStudio ?? true, studio });
  useEffect(() => {
    latest = { studio, study };
  });
  return (
    <ThemeRoot>
      {study.session && <StudyBar session={study.session} />}
      <StudyQuestion isOpen={study.asking} onAnswer={study.answer} />
    </ThemeRoot>
  );
}

const bar = () => screen.findByRole('region', { name: 'Study' });

async function tickedPupil(classes: Classes, ticked = true) {
  const pupil = await classes.addPupil('Ava');
  if (ticked) await new StudyStore(classes.study()).setTakingPart(pupil.id, true);
  return classes.open(pupil.id);
}

/** The session's log, as kept on the device. */
async function logOf(classes: Classes): Promise<readonly StudyEvent[]> {
  const session = latest!.study.session!;
  await session.flush();
  return (await new StudyStore(classes.study()).readSession(session.code))?.events ?? [];
}

afterEach(() => {
  forgetDeviceAnswer();
  editorSetting.set({ chosen: null, explained: false });
  latest = null;
});

describe('who takes part, and the study bar (6.2, 6.3)', () => {
  it('starts a session for a ticked pupil, with the code in the study bar', async () => {
    const classes = memoryClassFolders();
    const folder = await tickedPupil(classes);
    render(<Harness host={hostWith(classes)} folder={folder} hasClass />);
    const shown = await bar();
    const code = latest!.study.session!.code;
    expect(shown.textContent).toBe(`Study session ${code.slice(0, 4)}-${code.slice(4)}`);
  });

  it('keeps every other pupil’s tick when one pupil’s folder opens', async () => {
    const classes = memoryClassFolders();
    const ava = await classes.addPupil('Ava');
    const ben = await classes.addPupil('Ben');
    const store = new StudyStore(classes.study());
    await store.setTakingPart(ava.id, true);
    await store.setTakingPart(ben.id, true);
    render(<Harness host={hostWith(classes)} folder={await classes.open(ava.id)} hasClass />);
    await bar();
    expect(await store.takingPart([ava.id, ben.id])).toEqual(new Set([ava.id, ben.id]));
  });

  it('keeps nothing for a pupil not ticked, or while study mode is off', async () => {
    const classes = memoryClassFolders();
    const folder = await tickedPupil(classes, false);
    const { unmount } = render(<Harness host={hostWith(classes)} folder={folder} hasClass />);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByRole('region', { name: 'Study' })).toBeNull();
    unmount();
    const other = memoryClassFolders();
    render(<Harness host={hostWith(other, false)} folder={await tickedPupil(other)} hasClass />);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByRole('region', { name: 'Study' })).toBeNull();
    expect(await other.study().list(['sessions'])).toEqual([]);
  });

  it('ends the session when the folder closes', async () => {
    const classes = memoryClassFolders();
    const folder = await tickedPupil(classes);
    const host = hostWith(classes);
    const { rerender } = render(<Harness host={host} folder={folder} hasClass />);
    await bar();
    rerender(<Harness host={host} folder={null} hasClass />);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Study' })).toBeNull());
  });

  it('asks on a device with no class list, No first, and keeps the answer', async () => {
    const classes = memoryClassFolders();
    const device = await classes.openDevice();
    const host = hostWith(classes);
    const { unmount } = render(<Harness host={host} folder={device} hasClass={false} />);
    const asked = await screen.findByRole('dialog', {
      name: 'Is this learner taking part in the study?',
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(within(asked).getByRole('button', { name: 'No' })),
    );
    await userEvent.setup().click(within(asked).getByRole('button', { name: 'No' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Study' })).toBeNull();
    unmount();
    // The answer lasts until the app closes: the next film doesn't ask again.
    render(<Harness host={host} folder={device} hasClass={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('starts a session when the adult answers Yes', async () => {
    const classes = memoryClassFolders();
    const device = await classes.openDevice();
    render(<Harness host={hostWith(classes)} folder={device} hasClass={false} />);
    const asked = await screen.findByRole('dialog');
    await userEvent.setup().click(within(asked).getByRole('button', { name: 'Yes' }));
    await bar();
  });

  it('waits for a film to be open before asking', async () => {
    const classes = memoryClassFolders();
    const device = await classes.openDevice();
    render(<Harness host={hostWith(classes)} folder={device} hasClass={false} inStudio={false} />);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('what the session is told (6.6)', () => {
  it('counts each step, undo and redo in a task, and Learn as help', async () => {
    const classes = memoryClassFolders();
    const folder = await tickedPupil(classes);
    render(<Harness host={hostWith(classes)} folder={folder} hasClass />);
    await bar();
    const { studio, study } = latest!;
    act(() => void study.session!.openTask('T1', 'blocks', true));
    const now = latest!.studio.production;
    act(() => studio.commit('Rename', { ...now, manifest: { ...now.manifest, title: 'Two' } }));
    act(() => latest!.studio.undo());
    act(() => latest!.studio.redo());
    act(() => latest!.study.learnOpened());
    expect((await logOf(classes)).map((e) => e.kind)).toEqual([
      'session',
      'task',
      'edit',
      'undo',
      'redo',
      'help',
    ]);
  });

  it('counts a run of typing as one step before the undo that follows it', async () => {
    const classes = memoryClassFolders();
    const folder = await tickedPupil(classes);
    render(<Harness host={hostWith(classes)} folder={folder} hasClass />);
    await bar();
    act(() => void latest!.study.session!.openTask('T1', 'blocks', true));
    // Two changes with one key are one step, closed by the undo without a change of its own.
    for (const title of ['T', 'Tw']) {
      const now = latest!.studio.production;
      act(() =>
        latest!.studio.commit('Rename', { ...now, manifest: { ...now.manifest, title } }, 'title'),
      );
    }
    act(() => latest!.studio.undo());
    expect((await logOf(classes)).map((e) => e.kind)).toEqual(['session', 'task', 'edit', 'undo']);
  });

  it('counts the last run of typing when the task card settles before a check', async () => {
    const classes = memoryClassFolders();
    const folder = await tickedPupil(classes);
    render(<Harness host={hostWith(classes)} folder={folder} hasClass />);
    await bar();
    act(() => void latest!.study.session!.openTask('T1', 'blocks', true));
    const now = latest!.studio.production;
    act(() =>
      latest!.studio.commit('Rename', { ...now, manifest: { ...now.manifest, title: 'T' } }, 'k'),
    );
    act(() => latest!.studio.seal());
    act(() => latest!.study.settle());
    expect((await logOf(classes)).map((e) => e.kind)).toEqual(['session', 'task', 'edit']);
  });

  it('logs the learner’s switch of editor, in a task or not', async () => {
    const classes = memoryClassFolders();
    const folder = await tickedPupil(classes);
    render(<Harness host={hostWith(classes)} folder={folder} hasClass />);
    await bar();
    act(() => editorSetting.set({ chosen: 'tiles', explained: false }));
    const log = await logOf(classes);
    expect(log.map((e) => e.kind)).toEqual(['session', 'switch']);
    expect(log[1]).toMatchObject({ from: 'blocks', to: 'tiles' });
  });

  it('counts nothing outside a task but switches', async () => {
    const classes = memoryClassFolders();
    const folder = await tickedPupil(classes);
    render(<Harness host={hostWith(classes)} folder={folder} hasClass />);
    await bar();
    const now = latest!.studio.production;
    act(() =>
      latest!.studio.commit('Rename', { ...now, manifest: { ...now.manifest, title: 'Two' } }),
    );
    act(() => latest!.study.learnOpened());
    // Nothing worth keeping yet: a session with no task and no switch keeps no log (6.3).
    await latest!.study.session!.flush();
    expect(await classes.study().list(['sessions'])).toEqual([]);
  });
});
