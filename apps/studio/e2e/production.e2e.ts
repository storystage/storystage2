import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { exampleProduction } from '@storystage/production';

// The Production stage's Code editor with the real Blocks editor (Blockly), in a browser
// (docs/spec/07-ux.md section 7.3; 14-editors.md section 3i): the example production's scene 1,
// a value changed in a block as one undo step, and a block dropped outside the method put back.

const example = exampleProduction();
const main = example.program.types
  .flatMap((t) => t.methods)
  .find((m) => m.id === example.scenes[0]!.method)!;
const block = (page: Page, id: string) =>
  page.locator(`.blocklyDraggable[data-id="${id}"]`).first();

async function openCode(page: Page) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  // The whole workspace in the window: the code sits below the scene view, and the rows'
  // height can put the first block at the window's edge, where a drag can't start.
  await page.locator('.pr-workspace').scrollIntoViewIfNeeded();
  await expect(block(page, main.body[0]!.id)).toBeInViewport({ ratio: 1 });
}

/** Drags a block by a point near its top left to (x, y) on the page. */
async function drag(page: Page, from: Locator, to: { x: number; y: number }) {
  const box = (await from.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.y + 8, 'the block to drag is in the window').toBeLessThan(view.height);
  expect(to.y, 'where it goes is in the window').toBeLessThan(view.height);
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 40, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

/** The block keyboard focus is in, by its node id. */
const focusedBlock = (page: Page) =>
  page.evaluate(() => document.activeElement?.closest('[data-id]')?.getAttribute('data-id'));

/** The stage's own Undo (07-ux section 7.5), named for its step. */
const undoButton = (page: Page) =>
  page.getByRole('toolbar', { name: 'Undo and redo' }).getByRole('button', { name: /^Undo/ });

test('the scene’s method opens in the Blocks editor, one tab per method', async ({ page }) => {
  await openCode(page);
  const tabs = page.getByRole('tablist', { name: 'Methods in scene 1' }).getByRole('tab');
  // The scene's script method reads "When the scene starts" (the owner, 21 Nov); its code keeps
  // Alice's name, `myFirstMethod`.
  await expect(tabs.first()).toHaveText('When the scene starts');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  // The header block can't be moved, so it isn't one of Blockly's draggable ones.
  const header = page.locator(`.blocklyWorkspace [data-id="${main.id}"]`).first();
  await expect(header).toContainText('When the scene starts');
  await expect(header).not.toContainText(main.name);
  for (const s of main.body) await expect(block(page, s.id)).toBeVisible();
});

test('a value changed in a block is one undo step in the studio’s history', async ({ page }) => {
  await openCode(page);
  const say = block(page, main.body[0]!.id);
  const words = say.locator('.blocklyEditableField:not(.ss-add-detail)').last();
  await words.click();
  const input = page.locator('.blocklyHtmlInput');
  await expect(input).toBeVisible();
  await input.fill('Hello there');
  await input.press('Enter');
  await expect(say).toContainText('Hello there');
  // Named as Tiles names it (spec 14, section 2.4).
  await expect(undoButton(page)).toHaveText(/^Undo: Change .* in /);
  // Ctrl+Z with focus in Blockly is the studio's undo, not Blockly's own: the words go back.
  expect(await page.evaluate(() => !!document.activeElement?.closest('.pr-workspace'))).toBe(true);
  await page.keyboard.press('Control+z');
  await expect(block(page, main.body[0]!.id)).not.toContainText('Hello there');
  // The studio's history went back a step, so it can be redone (Blockly's would be a new step).
  await expect(
    page.getByRole('toolbar', { name: 'Undo and redo' }).getByRole('button', { name: /^Redo/ }),
  ).toHaveText(/^Redo: Change .* in /);
  await page.keyboard.press('Control+Shift+z');
  await expect(block(page, main.body[0]!.id)).toContainText('Hello there');
});

test('a block from the palette asks for its words, then is one undo step', async ({ page }) => {
  await openCode(page);
  // Blocks for the penguin.
  await page.getByRole('button', { name: /Blocks for/ }).click();
  await page.locator('.sb-menu-item', { hasText: 'penguin' }).click();
  const say = page.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: /say/ }).first();
  await expect(say).toBeVisible();
  const last = (await block(page, main.body.at(-1)!.id).boundingBox())!;
  await drag(page, say, { x: last.x + 8, y: last.y + last.height + 6 });
  // The shared cascade asks for the words.
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /Other words/ }).click();
  const field = page.getByRole('textbox').last();
  await field.fill('Hello from the palette');
  await field.press('Enter');
  await expect(page.locator('.pr-workspace')).toContainText('Hello from the palette');
  await expect(undoButton(page)).toHaveText(/^Undo: .*say Hello from the palette/);
  // The stage's Undo takes the new block away again.
  await undoButton(page).click();
  await expect(page.locator('.pr-workspace')).not.toContainText('Hello from the palette');
});

test('a block dropped outside the method goes back, and the learner hears why', async ({
  page,
}) => {
  await openCode(page);
  const first = block(page, main.body[0]!.id);
  // Back where it was is checked by what holds it, not where it's drawn: the workspace may
  // scroll as the block goes back. Blockly draws a block joined to another inside that block's
  // group, and the method's first statement directly inside the method's.
  const inMethod = page.locator(
    `.pr-workspace .blocklyBlock[data-id="${main.id}"] > .blocklyBlock[data-id="${main.body[0]!.id}"]`,
  );
  await expect(inMethod).toHaveCount(1);
  const area = (await page.locator('.pr-workspace').boundingBox())!;
  await drag(page, first, { x: area.x + area.width - 60, y: area.y + area.height - 40 });
  // The studio's live region (Blockly has one of its own too).
  await expect(page.locator('.pr > p[aria-live="polite"]')).toHaveText(
    'Blocks go inside a method.',
  );
  await expect(inMethod).toHaveCount(1);
  await expect(undoButton(page)).toHaveText('Undo');
});

test('New adds a procedure in its own tab, offered in the palette, one undo step', async ({
  page,
}) => {
  await openCode(page);
  // From the keyboard: the page may still move as the stage loads, which can spoil a click.
  await page.getByRole('button', { name: 'New in scene 1' }).press('Enter');
  await page.getByRole('menuitem', { name: 'Procedure…' }).click();
  const dialog = page.getByRole('dialog', { name: 'New procedure' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('walkToTheDoor');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const tab = page.getByRole('tab', { name: 'walkToTheDoor' });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  await expect(
    page.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: 'walkToTheDoor' }),
  ).toBeVisible();
  await expect(undoButton(page)).toHaveText('Undo: Add procedure walkToTheDoor');
  await undoButton(page).click();
  await expect(tab).toBeHidden();
  await expect(page.getByRole('tab', { name: 'When the scene starts' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('a procedure gets an input in New, shown on its block and its calls, with an Inputs menu (7.14)', async ({
  page,
}) => {
  await openCode(page);
  await page.getByRole('button', { name: 'New in scene 1' }).press('Enter');
  await page.getByRole('menuitem', { name: 'Procedure…' }).click();
  const dialog = page.getByRole('dialog', { name: 'New procedure' });
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('waddle');
  await dialog.getByRole('button', { name: 'Add an input (parameter)…' }).click();
  await dialog.getByRole('textbox', { name: 'Name of input 1' }).fill('steps');
  await dialog
    .getByRole('radiogroup', { name: 'What input 1 holds' })
    .getByRole('radio', { name: 'A whole number' })
    .click({ force: true });
  const { violations } = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('tab', { name: 'waddle' })).toHaveAttribute('aria-selected', 'true');
  await expect(undoButton(page)).toHaveText('Undo: Add procedure waddle with steps');
  // The method's own block names its input; a call from the palette has a slot for it.
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  await expect(
    page.locator('.pr-workspace').getByText('waddle (steps: whole number)', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: 'waddle' }).first(),
  ).toContainText('steps');
  // The Inputs menu lists it, with Rename and Remove.
  await page.getByRole('button', { name: 'Inputs of waddle' }).press('Enter');
  const steps = page.getByRole('group', { name: 'steps: whole number' });
  await expect(steps.getByRole('menuitem', { name: 'Rename input…' })).toBeVisible();
  await expect(steps.getByRole('menuitem', { name: 'Remove input…' })).toBeVisible();
  await page.keyboard.press('Escape');
  await undoButton(page).click();
  await expect(page.getByRole('tab', { name: 'waddle' })).toBeHidden();
});

test('the penguin learns a move from New, with a tab of its own, and the scene can call it (7.14)', async ({
  page,
}) => {
  await openCode(page);
  const blocksFor = async (name: string) => {
    await page.getByRole('button', { name: /Blocks for/ }).click();
    await page.locator('.sb-popover').getByRole('option', { name, exact: true }).click();
  };
  await blocksFor('penguin');
  await page.getByRole('button', { name: 'New in scene 1' }).press('Enter');
  await page.getByRole('menuitem', { name: 'Move for penguin…' }).click();
  const dialog = page.getByRole('dialog', { name: 'New move for penguin' });
  await expect(dialog).toContainText('Every penguin in every scene can use it.');
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('waddle');
  const { violations } = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toBeHidden();
  const tab = page.getByRole('tab', { name: 'penguin: waddle' });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(undoButton(page)).toHaveText('Undo: Add move waddle for penguin');
  // Its own blocks are the penguin's, for "this penguin" only.
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Blocks for/ })).toContainText('this penguin');
  await expect(page.locator('.blocklyFlyout .blocklyDraggable').first()).toBeVisible();
  // Back in the scene's script, with the penguin chosen, "your own" offers it.
  await page.getByRole('tab', { name: 'When the scene starts' }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  await blocksFor('penguin');
  await expect(
    page.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: 'waddle' }).first(),
  ).toBeVisible();
  await undoButton(page).click();
  await expect(tab).toBeHidden();
});

test('Ctrl+Z changes nothing behind a dialog, and undoes again once it closes', async ({
  page,
}) => {
  await openCode(page);
  await page.getByRole('button', { name: 'Add a marker here' }).click();
  const marker = page.locator('[role="option"]').filter({ hasText: 'marker1' });
  await expect(marker).toHaveCount(1);
  await page.getByRole('button', { name: 'New in scene 1' }).press('Enter');
  await page.getByRole('menuitem', { name: 'Procedure…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Close' }).focus();
  await page.keyboard.press('Control+z');
  await expect(marker).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.keyboard.press('Control+z');
  await expect(marker).toHaveCount(0);
});

test('the Code editor is as tall as what it holds, however short the window', async ({ page }) => {
  await openCode(page);
  const code = async () =>
    page.locator('.pr-code').evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      holds: el.scrollHeight,
      workspace: el.querySelector('.pr-workspace-frame')!.getBoundingClientRect().height,
    }));
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect
    .poll(async () => {
      const { height, holds } = await code();
      return holds - height;
    })
    .toBeLessThan(2);
  // A taller window, then a short one again: the workspace gives back any room it took.
  const short = (await code()).workspace;
  await page.setViewportSize({ width: 1180, height: 1500 });
  await page.waitForTimeout(500);
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect.poll(async () => (await code()).workspace).toBeLessThan(short + 2);
});

test('a block’s menu and keys switch it off, add a detail and duplicate, each one step', async ({
  page,
}) => {
  await openCode(page);
  const id = main.body[0]!.id;
  const said = page.locator('.pr > p[aria-live="polite"]');
  await block(page, id).click({ button: 'right', position: { x: 8, y: 8 } });
  const menu = page.locator('.blocklyContextMenu');
  await expect(menu).toBeVisible();
  // Ours, in place of Blockly's own.
  await expect(menu).toContainText('Switch off');
  await expect(menu).toContainText('Add detail: how long');
  await expect(menu).toContainText('Duplicate');
  for (const blockly of ['Comment', 'Collapse', 'Inline', 'Help', 'Disable'])
    await expect(menu).not.toContainText(blockly);
  const { violations } = await new AxeBuilder({ page }).include('.blocklyWidgetDiv').analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await menu.getByText('Switch off', { exact: true }).click();
  await expect(block(page, id)).toHaveClass(/blocklyDisabledPattern/);
  await expect(undoButton(page)).toHaveText(/^Undo: Switch off /);
  await expect(said).toHaveText(/^Switch off /);
  // Ctrl+/ on the block in focus switches it on again, as in Tiles.
  await expect.poll(() => focusedBlock(page)).toBe(id);
  await page.keyboard.press('Control+/');
  await expect(block(page, id)).not.toHaveClass(/blocklyDisabledPattern/);
  await expect(undoButton(page)).toHaveText(/^Undo: Switch on /);
  // Ctrl+D duplicates it just after itself, in the method (not loose, as Blockly's D would).
  const says = page.locator('.pr-workspace .ss_story_say');
  const before = await says.count();
  await expect.poll(() => focusedBlock(page)).toBe(id);
  await page.keyboard.press('Control+d');
  await expect(says).toHaveCount(before + 1);
  await expect(undoButton(page)).toHaveText(/^Undo: Make /);
  await undoButton(page).click();
  await expect(says).toHaveCount(before);

  // Ctrl+V before anything is copied says so; Ctrl+C then Ctrl+V pastes a copy just after it,
  // with an id of its own, as one undo step (spec 14, 3d; the owner, 21 Nov), as in Tiles.
  await block(page, id).click({ position: { x: 8, y: 8 } });
  await expect.poll(() => focusedBlock(page)).toBe(id);
  await page.keyboard.press('Control+v');
  await expect(said).toHaveText('Copy a block first, then paste it.');
  await expect(says).toHaveCount(before);
  await page.keyboard.press('Control+c');
  await expect(said).toHaveText(/^Copied /);
  await page.keyboard.press('Control+v');
  await expect(says).toHaveCount(before + 1);
  await expect(says.nth(1)).not.toHaveAttribute('data-id', id);
  await expect(undoButton(page)).toHaveText(/^Undo: Make /);
  // Blockly's own Ctrl+X, which would take the block out of the program, does nothing here.
  await page.keyboard.press('Control+x');
  await expect(says).toHaveCount(before + 1);
  await undoButton(page).click();
  await expect(says).toHaveCount(before);

  // Add detail asks for the value through the cascade, then it's in the block.
  await block(page, id).click({ button: 'right', position: { x: 8, y: 8 } });
  await page.locator('.blocklyContextMenu').getByText('Add detail: how long').click();
  const cascade = page.getByRole('menu', { name: 'how long' });
  await expect(cascade).toBeVisible();
  await cascade.getByRole('menuitemradio', { name: '2', exact: true }).click();
  await expect(block(page, id)).toContainText('how long');
  await expect(undoButton(page)).toHaveText(/^Undo: Add how long to /);
  await undoButton(page).click();
  await expect(block(page, id)).not.toContainText('how long');
});

test('“add detail ▾” at the end of a row adds a detail, by pointer and by keyboard', async ({
  page,
}) => {
  await openCode(page);
  const id = main.body[0]!.id;
  const button = block(page, id).getByRole('button', { name: 'add detail' });
  await expect(button).toBeVisible();
  // By pointer: Tiles' detail menu, then the cascade for its value, as one step.
  await button.click();
  await page
    .getByRole('menu', { name: 'add detail' })
    .getByRole('menuitem', { name: 'how long' })
    .click();
  await page
    .getByRole('menu', { name: 'how long' })
    .getByRole('menuitemradio', { name: '2', exact: true })
    .click();
  await expect(block(page, id)).toContainText('how long');
  await expect(undoButton(page)).toHaveText(/^Undo: Add how long to /);
  // By keyboard: along the row to it, then Enter; Escape adds nothing.
  await block(page, id).click({ position: { x: 20, y: 20 } });
  await expect
    .poll(async () => {
      await page.keyboard.press('ArrowRight');
      return button.evaluate((b) => b === document.activeElement);
    })
    .toBe(true);
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'add detail' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'how long' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(undoButton(page)).toHaveText(/^Undo: Add how long to /);
});

test('the Blocks editor by keyboard alone: add, answer, move and delete, each said (7.5)', async ({
  page,
}) => {
  await openCode(page);
  const said = page.locator('.pr > p[aria-live="polite"]');
  const where = () =>
    page.evaluate(() => document.activeElement?.closest('[data-id]')?.getAttribute('data-id'));
  const says = page.locator('.pr-workspace .ss_story_say');
  // Blockly's move, by keyboard: it says how, and an insertion marker shows each place.
  const hint = page.getByText('Use the arrow keys to move').first();
  const marker = page.locator('.pr-workspace .blocklyInsertionMarker');
  // Tab from New to the palette; down to "wait", Enter picks it up (Blockly's move), a down
  // arrow puts it at the method's first place, Enter puts it there; then the cascade asks.
  const toWait = async () => {
    await page.getByRole('button', { name: 'New in scene 1' }).focus();
    await page.keyboard.press('Tab');
    await expect
      .poll(async () => {
        await page.keyboard.press('ArrowDown');
        return page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
      })
      .toMatch(/^this, wait/);
    await page.keyboard.press('Enter');
    await expect(hint).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(marker.first()).toBeAttached();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
  };
  // Escape asks no more and adds nothing, and focus stays in the method.
  await toWait();
  await page.keyboard.press('Escape');
  await expect(undoButton(page)).toHaveText('Undo');
  await expect.poll(where).toBe(main.id);
  // Answered, it's one step, said, with focus on the new block.
  await toWait();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(undoButton(page)).toHaveText(/^Undo: Make the scene wait /);
  await expect(said).toHaveText(/^Make the scene wait /);
  // Focus is in the new block.
  const wait = page.locator('.pr-workspace .ss_story_delay:not(.blocklyFlyout .ss_story_delay)');
  const inWait = () => page.evaluate(() => !!document.activeElement?.closest('.ss_story_delay'));
  await expect.poll(inWait).toBe(true);
  // Alt+↑ or Alt+↓ moves it one place past the say, as in Tiles: one step, said, focus kept.
  const above = async () => (await wait.boundingBox())!.y < (await says.first().boundingBox())!.y;
  const wasAbove = await above();
  await page.keyboard.press(wasAbove ? 'Alt+ArrowDown' : 'Alt+ArrowUp');
  await expect(undoButton(page)).toHaveText(/^Undo: Move the scene wait /);
  await expect(said).toHaveText(/^Move the scene wait /);
  await expect.poll(above).toBe(!wasAbove);
  await expect.poll(inWait).toBe(true);
  // At the end of the list, a move that can't go says why, and changes nothing.
  await page.keyboard.press(wasAbove ? 'Alt+ArrowDown' : 'Alt+ArrowUp');
  await expect(said).toHaveText(
    wasAbove ? 'It’s already at the bottom.' : 'It’s already at the top.',
  );
  await expect(undoButton(page)).toHaveText(/^Undo: Move the scene wait /);
  // Blockly's own move works too (M, an arrow, Enter, at a person's pace). Wherever the arrow
  // takes it, a place in the method or outside it, where it goes back with the reason said,
  // focus stays on the block.
  for (const k of ['m', wasAbove ? 'ArrowUp' : 'ArrowDown', 'Enter']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
  }
  await expect.poll(inWait).toBe(true);
  // Delete takes it out: one step, said.
  await expect.poll(where).toBe(await wait.getAttribute('data-id'));
  await page.keyboard.press('Delete');
  await expect(undoButton(page)).toHaveText(/^Undo: Delete the scene wait /);
  await expect(said).toHaveText(/^Delete the scene wait /);
  await expect(says).toHaveCount(1);
});

test('axe finds no serious issues with the Code editor open', async ({ page }) => {
  await openCode(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(serious).toEqual([]);
});

test('Rehearse plays the scene on the scene view, highlights the blocks running, and stops', async ({
  page,
}) => {
  await openCode(page);
  const view = page.getByRole('region', { name: 'Scene view' });
  await expect(view.locator('canvas')).toBeVisible();
  const rehearse = view.getByRole('button', { name: 'Rehearse', exact: true });
  await expect(rehearse).toBeEnabled();
  await rehearse.click();
  await expect(view.getByRole('button', { name: 'Stop' })).toBeVisible();
  // A block running is marked in the Blocks editor (14-editors 3i.10). The stage can take a while
  // to start the run under software drawing on a busy machine (only Stop shows meanwhile).
  await expect(page.locator('.ss-highlight-rehearse').first()).toBeAttached({ timeout: 30_000 });
  // The frame the run reached is Rehearsed on the strip (07-ux 2.3, 7.1).
  const strip = page.getByRole('listbox', { name: 'Frames' });
  await expect(strip.getByRole('option').first()).toContainText('Rehearsed', { timeout: 10_000 });
  await view.getByRole('button', { name: 'Stop' }).click();
  await expect(rehearse).toBeVisible();
  await expect(page.locator('.ss-highlight-rehearse')).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).include('.pr-scene').analyze()).violations.map((v) => v.id),
  ).toEqual([]);
});

test('Rehearse pauses, plays on at half speed and starts again (07-ux 7.4)', async ({ page }) => {
  await openCode(page);
  const view = page.getByRole('region', { name: 'Scene view' });
  await expect(view.locator('canvas')).toBeVisible();
  // The example scene is short: on a busy machine it can end before Pause is pressed, so start
  // it again until Pause is caught while it plays.
  const pause = view.getByRole('button', { name: 'Pause' });
  await expect(async () => {
    if (!(await pause.isVisible()))
      await view.getByRole('button', { name: /^(Rehearse|Restart)$/ }).click();
    await pause.click({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  const play = view.getByRole('button', { name: 'Play' });
  await expect(play).toBeVisible();
  // Half speed while paused, so the short example scene is still running for what follows.
  const speed = view.getByRole('radiogroup', { name: 'Speed' });
  await speed.getByText('Half').click();
  await expect(speed.getByRole('radio', { name: 'Half' })).toBeChecked();
  await play.click();
  await expect(view.getByRole('button', { name: 'Pause' })).toBeVisible();
  // Restart starts again from the set-up, playing.
  await view.getByRole('button', { name: 'Restart' }).click();
  await expect(view.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.locator('.ss-highlight-rehearse').first()).toBeAttached({ timeout: 10_000 });
  await view.getByRole('button', { name: 'Stop' }).click();
  await expect(view.getByRole('button', { name: 'Rehearse', exact: true })).toBeVisible();
});

test('Check this frame plays the scene on a hidden stage and lists what it found', async ({
  page,
}) => {
  await openCode(page);
  const card = page.getByRole('region', { name: /^Automatic check: frame 1\.1/ });
  await expect(card.getByText(/^Not checked yet/)).toBeVisible();
  await card.getByRole('button', { name: 'Check this frame' }).click();
  await expect(card.getByRole('listitem').first()).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(/^Not checked yet/)).toHaveCount(0);
  // The strip shows the check's status for frame 1.1.
  const first = page.getByRole('listbox', { name: 'Frames' }).getByRole('option').first();
  await expect(first).toContainText(/Checked|Look at/);
  expect(
    (await new AxeBuilder({ page }).include('.pr-check').analyze()).violations.map((v) => v.id),
  ).toEqual([]);
});

test('the view moves by its buttons: Look around’s own, and the scene’s camera as undo steps', async ({
  page,
}) => {
  // 07-ux 7.2 (the owner, 24 Nov 2026): slide, circle round, tilt and zoom, as buttons.
  await openCode(page);
  const pad = page.getByRole('toolbar', { name: 'Move the view' });
  await expect(pad.getByRole('button')).toHaveCount(10);
  const { violations } = await new AxeBuilder({ page }).include('.pr-view-pad').analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Camera view: a click is one undo step, named for it.
  await pad.getByRole('button', { name: 'Zoom in' }).click();
  await expect(undoButton(page)).toHaveText('Undo: Zoom the camera in');
  // A hold is one step too, however many times it repeats.
  const circle = pad.getByRole('button', { name: 'Circle round to the left' });
  const at = (await circle.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(undoButton(page)).toHaveText('Undo: Circle the camera round to the left');
  await undoButton(page).click();
  await expect(undoButton(page)).toHaveText('Undo: Zoom the camera in');

  // Look around: the buttons move its view, and nothing is written.
  await page.getByRole('radiogroup', { name: 'View' }).getByText('Look around').click();
  for (const name of ['Slide left', 'Rise and look down', 'Zoom out'])
    await pad.getByRole('button', { name }).click();
  await expect(undoButton(page)).toHaveText('Undo: Zoom the camera in');
});
