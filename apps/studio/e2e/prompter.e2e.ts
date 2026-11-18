import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { exampleProduction } from '@storystage/production';
import type { PlanStep, PrompterEvent } from '@storystage/prompter';
import { testReply, type TestBlock } from '@storystage/prompter/testing';

// The Prompter panel in a browser (07-ux section 2.4; spec 04 sections 4.5 and 6; WP13c), on the
// studio's development server, where a test can give the Prompter scripted replies
// (`src/prompter/devPrompter.ts`): a release build has no way to reach them.

const STUDIO = 'http://localhost:4182/?example';
const example = exampleProduction();
const main = example.program.types
  .flatMap((t) => t.methods)
  .find((m) => m.id === example.scenes[0]!.method)!;

const walks: PlanStep = {
  words: 'The penguin waddles forward.',
  kind: 'do',
  actor: 'penguin',
  action: 'move',
  target: '',
  details: [
    { name: 'direction', value: 'forward' },
    { name: 'amount', value: '1' },
  ],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  why: 'So she can reach the fox.',
};
const toolUse = (id: string, name: string, input: unknown): TestBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const say = (text: string) => testReply([{ type: 'text', text }]);
const REPLIES: PrompterEvent[][] = [
  testReply([toolUse('t1', 'propose_plan', { steps: [walks] })]),
  say('Here is a plan. Change it if you like, then build it.'),
  testReply([
    toolUse('t2', 'insert_statement', {
      method: main.name,
      position: 'end',
      target: 'penguin',
      procedure: 'move',
      arguments: walks.details,
      narration: 'The penguin waddles forward.',
      plan_step: 1,
    }),
  ]),
  say('Built. The penguin now waddles forward.'),
];

async function openStage(page: Page) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript((replies: string) => {
    (window as { __storystagePrompter?: unknown }).__storystagePrompter = {
      level: 'full',
      replies: JSON.parse(replies),
    };
  }, JSON.stringify(REPLIES));
  await page.goto(STUDIO);
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'The Prompter' });
const marked = (page: Page) =>
  page.locator('.pr-workspace .blocklyBlock.ss-highlight-prompter:not(.blocklyFlyout *)');

test('a plan is shown with nothing built, then built as one step, marked, and undone', async ({
  page,
}) => {
  await openStage(page);
  const prompter = panel(page);
  await expect(prompter).toBeVisible();
  await expect(prompter.getByText(/Ask about your film/)).toBeVisible();

  await prompter.getByRole('radio', { name: 'Show me how' }).check();
  const field = prompter.getByRole('textbox', { name: 'Ask the Prompter' });
  await field.fill('Make the penguin walk to the fox.');
  await field.press('Enter');

  const plan = prompter.getByRole('grid', { name: 'Plan before change' });
  await expect(plan.getByRole('row')).toHaveCount(1);
  await expect(prompter.getByText('Nothing built yet')).toBeVisible();
  await expect(prompter.getByText('You asked')).toBeVisible();
  // Nothing in the Prompter's colours, at 4.5:1, and every control named.
  const { violations } = await new AxeBuilder({ page })
    .include('.pm')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  const blocks = page.locator('.pr-workspace .blocklyBlock:not(.blocklyFlyout *)');
  const before = await blocks.count();
  await prompter.getByRole('button', { name: 'Build these steps' }).click();
  await expect(prompter.getByText('Step 1: The penguin waddles forward.')).toBeVisible();
  await expect(prompter.getByText('Built. The penguin now waddles forward.')).toBeVisible();
  await expect(plan).toHaveCount(0);
  // The new blocks are drawn, marked as the Prompter's, and the request is one undo step.
  await expect.poll(() => blocks.count()).toBeGreaterThan(before);
  await expect(marked(page).first()).toBeVisible();
  await expect(
    page.getByRole('toolbar', { name: 'Undo and redo' }).getByRole('button', { name: /^Undo/ }),
  ).toBeEnabled();

  await prompter.getByRole('button', { name: 'Undo this request' }).click();
  await expect.poll(() => blocks.count()).toBe(before);
  await expect(marked(page)).toHaveCount(0);
  await expect(prompter.getByRole('button', { name: 'Undo this request' })).toHaveCount(0);
});

test('a step is changed with the blocks’ own choices, and its words follow', async ({ page }) => {
  await openStage(page);
  const prompter = panel(page);
  await prompter.getByRole('radio', { name: 'Show me how' }).check();
  const field = prompter.getByRole('textbox', { name: 'Ask the Prompter' });
  await field.fill('Make the penguin walk to the fox.');
  await field.press('Enter');
  const plan = prompter.getByRole('grid', { name: 'Plan before change' });
  await expect(plan.getByText('The penguin waddles forward.')).toBeVisible();

  await plan.getByRole('button', { name: 'Change step 1' }).click();
  const editor = page.getByRole('dialog', { name: 'Change step 1' });
  await expect(editor.getByLabel('Who')).toHaveValue('penguin');
  await editor.getByLabel('direction').selectOption('backward');
  const { violations } = await new AxeBuilder({ page })
    .include('.pm-editor')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor).toHaveCount(0);
  // The words are written again from what the step now does.
  await expect(plan.getByText('The penguin waddles forward.')).toHaveCount(0);
  await expect(plan.getByText(/backward/)).toBeVisible();

  await prompter.getByRole('button', { name: 'Add a step' }).click();
  await expect(plan.getByRole('row')).toHaveCount(2);
  await page
    .getByRole('dialog', { name: 'Change step 2' })
    .getByRole('button', { name: 'Cancel' })
    .click();
  await expect(prompter.getByRole('button', { name: 'Build these steps' })).toBeEnabled();
});

test('the panel folds to its rail, giving the code its room', async ({ page }) => {
  await openStage(page);
  const prompter = panel(page);
  const code = page.locator('.pr-main');
  const wide = (await code.boundingBox())!.width;
  await prompter.getByRole('button', { name: 'Hide the Prompter' }).click();
  await expect(prompter.getByRole('textbox')).toHaveCount(0);
  await expect.poll(async () => (await code.boundingBox())!.width).toBeGreaterThan(wide + 200);
  await prompter.getByRole('button', { name: 'Show the Prompter' }).click();
  await expect(prompter.getByRole('textbox', { name: 'Ask the Prompter' })).toBeVisible();
});

test('the browser version has no panel, and says so', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(STUDIO);
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'The Prompter' })).toHaveCount(0);
  await expect(
    page.getByText(
      'The Prompter isn’t part of the browser version. Rehearse, Blocks and Tiles all work here.',
    ),
  ).toBeVisible();
});
