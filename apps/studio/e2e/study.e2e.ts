import { expect, test } from '@playwright/test';
import { readExport, type StudyEvent } from '@storystage/study';
import {
  answer,
  checkStep,
  exportLogs,
  fixInBlocks,
  fixInTiles,
  openFolder,
  prompter,
  sessionCode,
  startTask,
  startWithClass,
  studyBar,
  studyCard,
  switchPupil,
  tick,
} from './study-steps.ts';

// Study mode in a browser (docs/spec/14-editors.md section 6; WP7.13), on the studio's
// development server, where a test can switch it on (`src/prompter/devPrompter.ts`: a policy
// from a trusted source with `study.enabled`, as a school's would be). A release build has no
// way to reach it, so the browser version never runs a study. The unit and component tests are
// `packages/study/src/*.test.ts` and `apps/studio/src/study/*.test.tsx`.

test('without a trusted policy there is no study: no ticks, no bar, nothing kept', async ({
  page,
}) => {
  await startWithClass(page, ['Ava'], false);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Class set-up' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Taking part in the study/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Study', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to the names' }).click();
  await openFolder(page, 'Ava');
  await expect(studyBar(page)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Study tasks' })).toHaveCount(0);
});

test('a ticked pupil’s sessions: tasks in Blocks and in Tiles by keyboard, then the export read back', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await startWithClass(page, ['Ava', 'Ben'], true);

  // The teacher ticks Ava, once, in the class list (6.2).
  await tick(page, 'Ava');

  // Ava's folder opens a session, with its code on the study bar; nothing is asked (6.3).
  await openFolder(page, 'Ava');
  const first = await sessionCode(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // T1 holds the class's editor, and the Prompter is held off while it's open (6.5).
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(prompter(page)).toBeVisible();
  let card = await startTask(page, 'Say hello');
  await expect(page.getByText('Set to Blocks for this study task')).toBeVisible();
  await expect(
    page.getByRole('radiogroup', { name: 'Code editor' }).getByRole('radio', { name: 'Tiles' }),
  ).toBeDisabled();
  await expect(prompter(page)).toHaveCount(0);
  // The film as it opens isn't done yet (6.4).
  await checkStep(page, card);
  await expect(card.getByRole('status')).toHaveText(
    'Not quite yet. Rehearse it and watch what happens.',
    { timeout: 60_000 },
  );
  await card.getByRole('button', { name: 'Stop this task' }).focus();
  await page.keyboard.press('Enter');
  await answer(page, 1, 1);
  // The learner's own film is back, and the Prompter with it.
  await expect(card).toBeHidden();
  await expect(prompter(page)).toBeVisible();

  // T5 in Blocks, the class's editor, by keyboard (6.4).
  card = await startTask(page, 'Fix it');
  await expect(page.getByText('Set to Blocks for this study task')).toHaveCount(0);
  await fixInBlocks(page);
  await checkStep(page, card);
  await answer(page, 2, 0, 'You did it!');

  // A pupil not ticked has no session.
  await switchPupil(page);
  await openFolder(page, 'Ben');
  await expect(studyBar(page)).toHaveCount(0);

  // Ava again: a new session, and T5 in Tiles this time: T5 doesn't hold the editor, so the
  // learner switches, by keyboard, and the switch is logged (6.6).
  await switchPupil(page);
  await openFolder(page, 'Ava');
  const second = await sessionCode(page);
  expect(second.code).not.toBe(first.code);
  card = await startTask(page, 'Fix it');
  await page
    .getByRole('radiogroup', { name: 'Code editor' })
    .getByRole('radio', { name: 'Blocks' })
    .focus();
  await page.keyboard.press('ArrowRight');
  const explain = page.getByRole('dialog', { name: '⇄ Switching to Tiles' });
  await expect(explain.getByRole('button', { name: 'Show me Tiles' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(explain).toBeHidden();
  await expect(page.getByRole('region', { name: 'Code for scene 1, in Tiles' })).toBeVisible();
  await fixInTiles(page);
  await checkStep(page, card);
  await answer(page, null, null, 'You did it!');

  // The teacher exports the logs (6.8), and the file reads back (6.7).
  await switchPupil(page);
  const study = await studyCard(page);
  await expect(study.getByText(`Session ${first.shown}`)).toBeVisible();
  await expect(study.getByText(`Session ${second.shown}`)).toBeVisible();
  const saved = await exportLogs(page, study);
  expect(saved.name).toMatch(/^study-logs-\d{4}-\d{2}-\d{2}-[a-z0-9]+\.json$/);
  const { bytes } = saved;
  const logs = readExport(bytes);
  const codes = [first.code, second.code];
  expect(logs.sessions.map((s) => s.code).sort()).toEqual([...codes].sort());
  const events = (code: string) => logs.sessions.find((s) => s.code === code)!.events;
  const shape = (e: StudyEvent) => {
    switch (e.kind) {
      case 'session':
        return `session ${e.editor}`;
      case 'task':
        return `task ${e.task} ${e.editor}${e.held ? ' held' : ''}`;
      case 'switch':
        return `switch ${e.from} ${e.to}`;
      case 'check':
        return `check ${e.outcome}`;
      case 'end':
        return `end ${e.outcome}`;
      case 'answer':
        return `${e.question} ${e.value}`;
      default:
        return e.kind;
    }
  };
  expect(events(codes[0]!).map(shape)).toEqual([
    'session blocks',
    'task T1 blocks held',
    'check notYet',
    'end stopped',
    'ease ok',
    'choice tiles',
    'task T5 blocks',
    'edit',
    'check success',
    'end success',
    'ease easy',
    'choice blocks',
  ]);
  expect(events(codes[1]!).map(shape)).toEqual([
    'session blocks',
    'task T5 blocks',
    'switch blocks tiles',
    'edit',
    'check success',
    'end success',
    'ease skipped',
    'choice skipped',
  ]);
  // No names in it: only codes and counts (6.6).
  const text = new TextDecoder().decode(bytes);
  for (const name of ['Ava', 'Ben', 'ava', 'ben']) expect(text).not.toContain(name);

  // Then, as the study asks, deleted from this device.
  const after = page.getByRole('dialog', { name: 'Delete these logs from this device?' });
  await after.getByRole('button', { name: 'Delete from this device' }).click();
  await expect(study.getByText('No study sessions are kept on this device.')).toBeVisible();
});
