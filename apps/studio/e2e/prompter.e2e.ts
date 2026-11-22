import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { exampleProduction } from '@storystage/production';
import type { PlanStep, PrompterEvent } from '@storystage/prompter';
import { testReply, type TestBlock } from '@storystage/prompter/testing';
import { DEV_STUDIO } from './devStudio.ts';

// The Prompter panel in a browser (07-ux section 2.4; spec 04 sections 4.5 and 6; WP13c), on the
// studio's development server, where a test can give the Prompter scripted replies
// (`src/prompter/devPrompter.ts`): a release build has no way to reach them.

const STUDIO = `${DEV_STUDIO}/?example`;
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
  holds: 0,
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

async function openStage(
  page: Page,
  key?: 'absent' | 'present',
  replies: PrompterEvent[][] = REPLIES,
  level = 'full',
) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(
    ({ replies, key, level }: { replies: string; key: string | null; level: string }) => {
      (window as { __storystagePrompter?: unknown }).__storystagePrompter = {
        level,
        replies: JSON.parse(replies),
        ...(key ? { key } : {}),
      };
    },
    { replies: JSON.stringify(replies), key: key ?? null, level },
  );
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

test('at Plan only, a step already built is ticked, and the panel counts what is built (6.6)', async ({
  page,
}) => {
  // Frame 1.1 links the penguin's line, so a step for it is done as the plan is shown.
  const line: PlanStep = {
    ...walks,
    words: 'The penguin says line 2.',
    action: 'say',
    details: [],
    line: 'l2',
  };
  await openStage(
    page,
    undefined,
    [
      testReply([toolUse('t1', 'propose_plan', { steps: [line, walks], frame: 'f1' })]),
      say('Here is a plan. Build the steps in the Code editor.'),
    ],
    'planOnly',
  );
  const prompter = panel(page);
  await prompter.getByRole('radio', { name: 'Show me how' }).check();
  const field = prompter.getByRole('textbox', { name: 'Ask the Prompter' });
  await field.fill('Make the penguin walk to the fox.');
  await field.press('Enter');
  const plan = prompter.getByRole('grid', { name: 'Plan before change' });
  await expect(
    plan.getByRole('row', { name: 'Step 1, done: The penguin says line 2.' }),
  ).toBeVisible();
  await expect(
    plan.getByRole('row', { name: 'Step 2: The penguin waddles forward.' }),
  ).toBeVisible();
  await expect(prompter.getByText('1 of 2 built')).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .include('.pm')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await prompter.screenshot({ path: test.info().outputPath('plan-only-ticks.png') });
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
  // Cancel straight after Add a step takes the new step out again.
  await expect(plan.getByRole('row')).toHaveCount(1);
  await expect(prompter.getByRole('button', { name: 'Build these steps' })).toBeEnabled();
});

test('Repeat… says what it changed where a screen reader can hear it, past its dialog', async ({
  page,
}) => {
  const fox = { ...walks, words: 'The fox walks forward.', actor: 'fox', together: true };
  await openStage(page, undefined, [
    testReply([toolUse('t1', 'propose_plan', { steps: [walks, fox] })]),
    say('Here is a plan.'),
  ]);
  const prompter = panel(page);
  await prompter.getByRole('radio', { name: 'Show me how' }).check();
  const field = prompter.getByRole('textbox', { name: 'Ask the Prompter' });
  await field.fill('Make them walk together.');
  await field.press('Enter');
  await prompter.getByRole('button', { name: 'Add a repeat around the last step' }).click();
  const editor = page.getByRole('dialog', { name: 'Change step 2' });
  await expect(editor).toBeVisible();
  const region = page.locator('.pr > p[aria-live="polite"]');
  await expect(region).toContainText('Step 2 added.');
  await expect(region).toContainText("so now it doesn't.");
  // The dialog makes the page behind it inert, which silences a live region inside it.
  expect(await region.evaluate((p) => p.closest('[inert], [aria-hidden="true"]') === null)).toBe(
    true,
  );
  // All else behind the dialog stays out of reach.
  expect(
    await page
      .locator('.pm')
      .evaluate((el) => el.closest('[inert], [aria-hidden="true"]') !== null),
  ).toBe(true);
});

test('a repeat holds the steps after it, indented, and moves with them (6.8)', async ({ page }) => {
  const step = (words: string, s: Partial<PlanStep> = {}): PlanStep => ({ ...walks, words, ...s });
  const hops = [
    step('The fox walks forward.', { actor: 'fox' }),
    step('Repeat 3 times:', {
      kind: 'repeat',
      actor: '',
      action: '',
      details: [],
      repeat: 3,
      holds: 2,
      why: 'So she hops three times.',
    }),
    step('The penguin moves up.', {
      details: [
        { name: 'direction', value: 'up' },
        { name: 'amount', value: '0.3' },
      ],
    }),
    step('The penguin moves down.', {
      details: [
        { name: 'direction', value: 'down' },
        { name: 'amount', value: '0.3' },
      ],
    }),
  ];
  await openStage(page, undefined, [
    testReply([toolUse('t1', 'propose_plan', { steps: hops })]),
    say('Here is a plan with a repeat.'),
  ]);
  const prompter = panel(page);
  await prompter.getByRole('radio', { name: 'Show me how' }).check();
  const field = prompter.getByRole('textbox', { name: 'Ask the Prompter' });
  await field.fill('Make the penguin hop three times.');
  await field.press('Enter');
  const plan = prompter.getByRole('grid', { name: 'Plan before change' });
  await expect(
    plan.getByRole('row', { name: 'Step 2: Repeat 3 times, holding steps 3 and 4' }),
  ).toBeVisible();
  await expect(plan.locator('[data-inside]')).toHaveCount(2);
  // Indented, with the loop colour's line down its left.
  const inside = plan.getByRole('row', { name: /^Step 3, inside the repeat: / });
  const shift = await inside.evaluate((row) => getComputedStyle(row).marginInlineStart);
  expect(shift).toBe('28px');
  const { violations } = await new AxeBuilder({ page })
    .include('.pm-plan')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // The repeat moved to the top, from the keyboard, takes its steps with it.
  // The list keeps focus on its rows: down to step 2, right to its handle, Enter to pick it up.
  await plan.getByRole('row').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(plan.getByRole('button', { name: 'Move step 2' })).toBeFocused();
  await page.keyboard.press('Enter');
  // React Aria's first drop place is just after step 1, where it is now; the next is before it.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(
    plan.getByRole('row', { name: 'Step 1: Repeat 3 times, holding steps 2 and 3' }),
  ).toBeVisible();
  await expect(plan.getByRole('row', { name: /^Step 4: The fox walks forward/ })).toBeVisible();

  // Change step on it: how many times, and which steps are inside.
  await plan.getByRole('button', { name: 'Change step 1' }).click();
  const editor = page.getByRole('dialog', { name: 'Change step 1' });
  await expect(editor.getByText('Repeats steps 2 and 3.')).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .include('.pm-editor')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await editor.getByRole('spinbutton', { name: 'How many times' }).fill('4');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(plan.getByRole('row', { name: /^Step 1: Repeat 4 times, holding/ })).toBeVisible();
});

test('an adult sets the Prompter up from the panel, and removes the key in Settings', async ({
  page,
}) => {
  // The dev server's key commands store a key at once, with no system dialog (devPrompter.ts).
  await openStage(page, 'absent');
  const prompter = panel(page);
  await expect(prompter.getByText('Ask an adult to set up the Prompter.')).toBeVisible();
  await prompter.getByRole('button', { name: 'Set up…' }).click();

  const wizard = page.getByRole('dialog', { name: 'Set up the Prompter' });
  await expect(wizard.getByText('Step 1 of 4')).toBeVisible();
  // React Aria's radio and checkbox inputs are hidden: a person presses the card or its words.
  await wizard.getByText('I’m the adult who owns the Claude key').click();
  await expect(wizard.getByRole('radio', { name: /I’m the adult/ })).toBeChecked();
  await wizard.getByRole('button', { name: 'Next' }).click();
  await expect(wizard.getByRole('heading', { name: /Meet the Prompter/ })).toBeVisible();
  await wizard.getByText(/I’m the responsible adult/).click();
  await expect(wizard.getByRole('checkbox', { name: /I’m the responsible adult/ })).toBeChecked();
  await wizard.getByRole('button', { name: 'I agree, continue' }).click();
  await expect(wizard.getByRole('heading', { name: 'Add your Claude key' })).toBeVisible();
  // No key field in the studio: the system's dialog takes it (decision 0056).
  await expect(wizard.getByRole('textbox')).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page })
    .include('.ss-modal')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await wizard.getByRole('button', { name: 'Add key' }).click();
  await expect(wizard.getByText('Key works. Checked just now.')).toBeVisible();
  await wizard.getByRole('button', { name: 'Done' }).click();
  await expect(wizard).toHaveCount(0);
  // The panel reads its status again, and is ready.
  await expect(prompter.getByRole('textbox', { name: 'Ask the Prompter' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  const card = page.getByRole('region', { name: 'The Prompter' });
  await expect(card.getByText(/a Claude key is in its secure store/)).toBeVisible();
  await card.getByRole('button', { name: 'Remove key' }).click();
  await expect(card.getByText(/Not set up on this device/)).toBeVisible();
});

test('a flag on the frame card is asked about in Explain mode, opening the panel (11.6)', async ({
  page,
}) => {
  await openStage(page, undefined, [say('The fox walks off before the frame ends.')]);
  const prompter = panel(page);
  await prompter.getByRole('button', { name: 'Hide the Prompter' }).click();
  // A planted difference: the penguin moved well out of the wide shot.
  const objects = page.getByRole('region', { name: 'Objects in this scene' });
  await objects.getByRole('option', { name: /penguin/i }).click();
  const x = objects.getByRole('textbox', { name: 'x (m)' });
  await x.fill('40');
  await x.press('Tab');
  const card = page.getByRole('region', { name: /^Automatic check: frame 1\.1/ });
  await card.getByRole('button', { name: 'Check this frame' }).click();
  await expect(card.getByRole('listitem').first()).toBeVisible({ timeout: 30_000 });
  const asks = card.getByRole('button', { name: /^Ask the Prompter: / });
  await expect(asks.first()).toBeVisible();
  const words = (await asks.first().getAttribute('aria-label'))!.replace('Ask the Prompter: ', '');
  // The button names the flag's words; the question leaves them to the check result.
  expect(words).not.toBe('');
  await asks.first().click();
  await expect(prompter.getByRole('heading', { name: 'The Prompter' })).toBeVisible();
  await expect(prompter.getByText('Why does the check flag this on frame 1.1?')).toBeVisible();
  await expect(prompter.getByText('The fox walks off before the frame ends.')).toBeVisible();
  await expect(prompter.getByRole('radio', { name: /Explain/ })).toBeChecked();
  expect(
    (await new AxeBuilder({ page }).include('.pr-check').analyze()).violations.map((v) => v.id),
  ).toEqual([]);
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
