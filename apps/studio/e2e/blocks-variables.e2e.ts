import { expect, test, type Page } from '@playwright/test';
import { exampleProduction } from '@storystage/production';

// Variables in the Blocks editor, in a browser (docs/spec/14-editors.md sections 2.3, 3a and 5.4
// task 7): the palette's control group has variable and set, as Tiles' bar has them. Dropped,
// each asks Tiles' own question (a name and what it holds; which variable), then the shared
// cascade asks for its value. A count can then count up to the variable.

const example = exampleProduction();
const main = example.program.types
  .flatMap((t) => t.methods)
  .find((m) => m.id === example.scenes[0]!.method)!;
const say = main.body[0]!.id;
const inWorkspace = ':not(.blocklyFlyout *)';
const undoButton = (page: Page) =>
  page.getByRole('toolbar', { name: 'Undo and redo' }).getByRole('button', { name: /^Undo/ });

/** Blockly's keys, paced as a person presses them (SwiftShader drops focus on faster ones). */
async function key(page: Page, name: string) {
  await page.keyboard.press(name);
  await page.waitForTimeout(150);
}

/** Into the flyout from New, then down to the block whose entry is `entry`. */
async function toFlyoutBlock(page: Page, entry: string) {
  await page.getByRole('button', { name: 'New in scene 1' }).focus();
  await key(page, 'Tab');
  const at = () =>
    page.evaluate(() =>
      document.activeElement?.closest('[data-callee]')?.getAttribute('data-callee'),
    );
  // Down the palette at a person's pace: the control group is at its end.
  for (let i = 0; i < 80 && (await at()) !== entry; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
  }
  expect(await at()).toBe(entry);
}

/** Enter picks the flyout block up; ↓ until its marker joins on under `after`; Enter. */
async function putAfter(page: Page, after: string) {
  await key(page, 'Enter');
  const marker = page.locator(
    `.pr-workspace .blocklyBlock[data-id="${after}"] > .blocklyInsertionMarker`,
  );
  for (let i = 0; i < 12 && (await marker.count()) === 0; i++) await key(page, 'ArrowDown');
  await expect(marker).toHaveCount(1);
  await key(page, 'Enter');
}

const blocksOf = (page: Page, type: string) =>
  page.locator(`.pr-workspace .blocklyBlock.${type}${inWorkspace}`);

test('the control group ends with variable, set and a note, as Tiles’ bar does', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  const control = await page
    .locator('.pr-workspace .blocklyFlyout [data-callee^="control:"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-callee')));
  expect(control.slice(-3)).toEqual(['control:variable', 'control:assign', 'control:comment']);
});

test('a variable, set, and a count up to it, by keyboard, each asked as Tiles asks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  await page.locator('.pr-workspace').scrollIntoViewIfNeeded();

  // Set, with no variable above it yet: nothing goes in, and the learner hears why.
  await toFlyoutBlock(page, 'control:assign');
  await putAfter(page, say);
  await expect(page.locator('.pr > p[aria-live="polite"]')).toHaveText(
    'There’s no variable here to set. Put in a variable above it first.',
  );
  await expect(blocksOf(page, 'ss_assign')).toHaveCount(0);

  // A variable after the say: its name and what it holds, then what it starts as.
  await toFlyoutBlock(page, 'control:variable');
  await putAfter(page, say);
  const dialog = page.getByRole('dialog', { name: 'A new variable' });
  await expect(dialog.getByRole('textbox', { name: 'Its name' })).toBeFocused();
  await page.keyboard.type('steps');
  await page.keyboard.press('Tab');
  const whole = dialog.getByRole('radio', { name: 'a whole number', exact: true });
  for (let i = 0; i < 6 && !(await whole.isChecked()); i++) await key(page, 'ArrowDown');
  await expect(whole).toBeChecked();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const starts = page.getByRole('menu', { name: 'steps', exact: true });
  await starts.getByRole('menuitemradio', { name: '3', exact: true }).click();
  await expect(blocksOf(page, 'ss_local')).toHaveCount(1);
  await expect(blocksOf(page, 'ss_local')).toContainText('steps');
  const local = (await blocksOf(page, 'ss_local').getAttribute('data-id'))!;
  const afterVariable = await undoButton(page).textContent();
  expect(afterVariable).toMatch(/^Undo: Add /);

  // A count after it, counting up to steps: the cascade offers the variable in scope.
  await toFlyoutBlock(page, 'control:count');
  await putAfter(page, local);
  await page
    .getByRole('menu', { name: 'how many times', exact: true })
    .getByRole('menuitemradio', { name: 'steps', exact: true })
    .or(
      page
        .getByRole('menu', { name: 'how many times', exact: true })
        .getByRole('menuitem', { name: 'steps', exact: true }),
    )
    .first()
    .click();
  await expect(undoButton(page)).toHaveText('Undo: Add count up to steps');
  await expect(blocksOf(page, 'ss_count')).toContainText('steps');

  // Set, now there's a variable above: which one, then its new value.
  await toFlyoutBlock(page, 'control:assign');
  await putAfter(page, local);
  const which = page.getByRole('menu').last();
  await which.getByRole('menuitem', { name: 'steps' }).click();
  await page.getByRole('menu').last().getByRole('menuitemradio').first().click();
  await expect(blocksOf(page, 'ss_assign')).toHaveCount(1);
  await expect(undoButton(page)).toHaveText(/^Undo: Add set steps /);
});
