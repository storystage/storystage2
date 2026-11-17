import type * as Check from '@storystage/check';
import type * as Export from '@storystage/export';
import { browserHost, type HostInterface } from '@storystage/host';
import { memoryClassFolders } from '@storystage/host/testing';
import { exampleProduction } from '@storystage/production';
import { StudyStore, TASK_LIMIT_MS, type StudyEvent } from '@storystage/study';
import { ThemeRoot } from '@storystage/ui';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { useStudio, type Studio } from '../studio.ts';
import { StudyBar } from './StudyBar.tsx';
import {
  QuestionsDialog,
  TaskCard,
  TasksDialog,
  useStudyTasks,
  type StudyTasks,
} from './StudyTasks.tsx';
import { forgetDeviceAnswer, useStudy, type Study } from './useStudy.ts';

// Study tasks in the studio (spec 14 sections 6.4 and 6.5): the list from the study bar, a task's
// own film in memory with the learner's kept aside, the card's Hint, Check my step and Stop, the
// fifteen minutes, the two questions, and the editor held. Check my step's run is the check's
// `traceScene`, given here; the real one, on a real stage, is S6's study.e2e.ts.

const trace = vi.hoisted(() => ({ run: null as unknown }));
vi.mock('@storystage/check', async (original) => ({
  ...(await original<typeof Check>()),
  traceScene: async () => trace.run,
}));
vi.mock('@storystage/export', async (original) => ({
  ...(await original<typeof Export>()),
  usedModels: () => [],
}));

const NOT_YET = { samples: [], said: [], error: null };
const fakeStage: StageMaker = async () => ({ dispose: () => {} }) as never;
const models = { prepare: async () => {}, source: {} } as unknown as ModelSourceHandle;

type Classes = ReturnType<typeof memoryClassFolders>;

function hostWith(classes: Classes): HostInterface {
  return {
    ...browserHost,
    version: '1.0.0',
    classes,
    policy: { ...browserHost.policy, trusted: true, study: { enabled: true } },
  };
}

const learnerFilm = () => {
  const p = exampleProduction();
  return { ...p, manifest: { ...p.manifest, title: 'My own film' } };
};

let latest: { studio: Studio; study: Study; tasks: StudyTasks } | null = null;
const saved = vi.fn(async () => true);

function Harness({
  host,
  folder,
}: {
  host: HostInterface;
  folder: Parameters<typeof useStudy>[0]['folder'];
}) {
  const studio = useStudio(learnerFilm());
  const study = useStudy({ host, folder, hasClass: true, inStudio: true, studio });
  const tasks = useStudyTasks({
    study,
    studio,
    host,
    models,
    beforeOpen: saved,
    onAnnounce: () => {},
    makeStage: fakeStage,
    startWorker: () => ({}) as never,
  });
  const [listing, setListing] = useState(false);
  useEffect(() => {
    latest = { studio, study, tasks };
  });
  return (
    <ThemeRoot>
      <p data-testid="film">{studio.production.manifest.title}</p>
      {study.session && (
        <>
          <StudyBar
            session={study.session}
            inTask={studio.inTask}
            onTasks={() => setListing(true)}
          />
          <TasksDialog
            session={study.session}
            isOpen={listing}
            onClose={() => setListing(false)}
            onStart={(task) => void tasks.start(task)}
          />
        </>
      )}
      <TaskCard tasks={tasks} />
      <QuestionsDialog tasks={tasks} />
    </ThemeRoot>
  );
}

async function opened() {
  const classes = memoryClassFolders();
  const pupil = await classes.addPupil('Ava');
  await new StudyStore(classes.study()).setTakingPart(pupil.id, true);
  render(<Harness host={hostWith(classes)} folder={await classes.open(pupil.id)} />);
  await screen.findByRole('region', { name: 'Study' });
  return classes;
}

async function startTask(name: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Study tasks' }));
  const list = await screen.findByRole('dialog', { name: 'Study tasks' });
  await user.click(within(list).getByRole('button', { name }));
  return screen.findByRole('region', { name: /^Study task: / });
}

async function logOf(classes: Classes): Promise<readonly StudyEvent[]> {
  const session = latest!.study.session!;
  await session.flush();
  return (await new StudyStore(classes.study()).readSession(session.code))?.events ?? [];
}

afterEach(() => {
  forgetDeviceAnswer();
  vi.useRealTimers();
  trace.run = null;
  latest = null;
});

describe('Study tasks (6.4)', () => {
  it('opens a task’s own film, saving the learner’s first, and keeps theirs aside', async () => {
    const classes = await opened();
    const card = await startTask(/^Start Say hello$/);
    expect(saved).toHaveBeenCalled();
    expect(within(card).getByRole('heading', { name: 'Say hello' })).toBeTruthy();
    expect(within(card).getByText(/Make Teddy walk to the tree/)).toBeTruthy();
    expect(latest!.studio.inTask).toBe(true);
    expect(screen.getByTestId('film').textContent).not.toBe('My own film');
    // The bar's Study tasks waits while a task is open.
    expect(screen.getByRole('button', { name: 'Study tasks' }).hasAttribute('disabled')).toBe(true);
    // T1 holds the class's editor (6.5), and says so.
    expect(latest!.tasks.heldNote).toBe('Set to Blocks for this study task');
    expect((await logOf(classes)).at(-1)).toMatchObject({ kind: 'task', task: 'T1', held: true });
  });

  it('gives the hint, as help, and Stop ends the task with the two questions', async () => {
    const classes = await opened();
    const card = await startTask(/^Start Click me$/);
    expect(latest!.tasks.heldNote).toBeNull();
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', { name: 'Hint' }));
    expect(within(card).getByText(/An event starts blocks/)).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: 'Stop this task' }));
    const questions = await screen.findByRole('dialog', { name: 'Two quick questions' });
    // The learner's own film is back, as they left it.
    expect(screen.getByTestId('film').textContent).toBe('My own film');
    expect(latest!.studio.inTask).toBe(false);
    await user.click(within(questions).getByRole('radio', { name: 'Easy' }));
    await user.click(within(questions).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await logOf(classes)).slice(1).map((e) => e.kind)).toEqual([
      'task',
      'help',
      'end',
      'answer',
      'answer',
    ]);
    const answers = (await logOf(classes)).filter((e) => e.kind === 'answer');
    expect(answers).toMatchObject([
      { question: 'ease', value: 'easy' },
      { question: 'choice', value: 'skipped' },
    ]);
  });

  it('says not yet, then ends the task on success, with the questions', async () => {
    const classes = await opened();
    const card = await startTask(/^Start Say hello$/);
    trace.run = NOT_YET;
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', { name: 'Check my step' }));
    expect(
      await within(card).findByText('Not quite yet. Rehearse it and watch what happens.'),
    ).toBeTruthy();
    // A run that reaches T1's end state: Teddy by the tree, facing it, having said Hello.
    const { STUDY_TASKS } = await import('@storystage/study');
    vi.spyOn(STUDY_TASKS[0]!, 'succeeded').mockReturnValue(true);
    await user.click(within(card).getByRole('button', { name: 'Check my step' }));
    const questions = await screen.findByRole('dialog', { name: 'Two quick questions' });
    expect(within(questions).getByText('You did it!')).toBeTruthy();
    expect(
      (await logOf(classes)).filter((e) => e.kind === 'check' || e.kind === 'end'),
    ).toMatchObject([
      { kind: 'check', outcome: 'notYet' },
      { kind: 'check', outcome: 'success' },
      { kind: 'end', outcome: 'success' },
    ]);
  });

  it('says an error’s words, as the check does', async () => {
    await opened();
    const card = await startTask(/^Start Say hello$/);
    trace.run = { ...NOT_YET, error: { at: 0, node: null, words: 'Teddy can’t walk there.' } };
    await userEvent.setup().click(within(card).getByRole('button', { name: 'Check my step' }));
    expect(await within(card).findByText('Teddy can’t walk there.')).toBeTruthy();
  });

  it('ends a task after fifteen minutes', async () => {
    // Time runs as usual, and the fifteen minutes can be jumped.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const classes = await opened();
    await startTask(/^Start Three jumps$/);
    act(() => vi.advanceTimersByTime(TASK_LIMIT_MS));
    const questions = await screen.findByRole('dialog', { name: 'Two quick questions' });
    expect(within(questions).getByText(/Time’s up for this task/)).toBeTruthy();
    expect((await logOf(classes)).find((e) => e.kind === 'end')).toMatchObject({
      outcome: 'timeUp',
    });
  });

  it('runs the fifteen minutes from the task opening, whatever the learner edits', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const classes = await opened();
    await startTask(/^Start Three jumps$/);
    act(() => vi.advanceTimersByTime(10 * 60 * 1000));
    // An edit at ten minutes, which once started the fifteen again.
    const film = latest!.studio.production;
    act(() =>
      latest!.studio.commit('Rename', { ...film, manifest: { ...film.manifest, title: 'Jumps' } }),
    );
    act(() => vi.advanceTimersByTime(5 * 60 * 1000));
    await screen.findByRole('dialog', { name: 'Two quick questions' });
    expect((await logOf(classes)).find((e) => e.kind === 'end')).toMatchObject({
      outcome: 'timeUp',
    });
  });

  it('counts a run of typing still open when the task ends', async () => {
    const classes = await opened();
    const card = await startTask(/^Start Fix it$/);
    // Two changes with one key, and no leaving the field: the step is still open.
    for (const title of ['F', 'Fi']) {
      const film = latest!.studio.production;
      act(() =>
        latest!.studio.commit(
          'Rename',
          { ...film, manifest: { ...film.manifest, title } },
          'title',
        ),
      );
    }
    await userEvent.setup().click(within(card).getByRole('button', { name: 'Stop this task' }));
    await screen.findByRole('dialog', { name: 'Two quick questions' });
    expect((await logOf(classes)).slice(1).map((e) => e.kind)).toEqual(['task', 'edit', 'end']);
  });

  it('waits to open a task if the learner’s own film can’t be saved first', async () => {
    saved.mockResolvedValueOnce(false);
    await opened();
    await startTask(/^Start Say hello$/).catch(() => null);
    expect(latest!.studio.inTask).toBe(false);
    expect(screen.queryByRole('region', { name: /^Study task: / })).toBeNull();
  });

  it('ticks a task done in this session, and won’t open it again', async () => {
    await opened();
    const card = await startTask(/^Start Fix it$/);
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', { name: 'Stop this task' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Two quick questions' })).getByRole(
        'button',
        { name: 'Done' },
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Study tasks' }));
    const list = await screen.findByRole('dialog', { name: 'Study tasks' });
    expect(within(list).queryByRole('button', { name: 'Start Fix it' })).toBeNull();
    expect(within(list).getByText('Task 5: Fix it').closest('li')!.textContent).toContain('Done');
  });
});
