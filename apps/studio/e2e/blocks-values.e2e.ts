import { expect, test, type Page } from '@playwright/test';

// The Blocks editor's value chips in a browser (docs/spec/14-editors.md sections 2.3 and 3i):
// Blockly's own drop-down on a chip opens and changes the value as one step, and a turn's left
// and right are drawn with Blockly Games' arrows (2.3 item 4) while their names stay plain.

const undoButton = (page: Page) =>
  page.getByRole('toolbar', { name: 'Undo and redo' }).getByRole('button', { name: /^Undo/ });

test('a turn’s direction chip shows its arrow, and its drop-down changes it as one step', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  await page.locator('.pr-workspace').scrollIntoViewIfNeeded();
  // A turn for the penguin, added by keyboard: down the palette to it, Enter picks it up
  // (Blockly's move), a down arrow chooses the method's first place, Enter puts it there.
  await page.getByRole('button', { name: /Blocks for/ }).click();
  await page.locator('.sb-menu-item', { hasText: 'penguin' }).click();
  await page.getByRole('button', { name: 'New in scene 1' }).focus();
  await page.keyboard.press('Tab');
  await expect
    .poll(
      async () => {
        await page.keyboard.press('ArrowDown');
        return page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
      },
      { timeout: 30_000 },
    )
    .toMatch(/turn, /);
  for (const key of ['Enter', 'ArrowDown', 'Enter']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  // The cascade asks which way, with the arrows (S6's shared menu), then how far.
  const which = page.getByRole('menu').last();
  await expect(which.getByRole('menuitemradio', { name: /^left/ })).toBeVisible();
  await which.getByRole('menuitemradio', { name: /^left/ }).click();
  await page.getByRole('menu').last().getByRole('menuitemradio').first().click();
  await expect(undoButton(page)).toHaveText(/^Undo: Make penguin turn left /);
  // The chip draws the arrow; its name is the plain word.
  const chip = page.locator('.pr-workspace .ss_enum_TurnDirection:not(.blocklyFlyout *)').first();
  await expect(chip).toHaveText(/left\s↺/);
  await expect(chip.locator('[aria-label="dropdown: left"]').first()).toBeAttached();
  const before = await chip.getAttribute('data-id');
  // Blockly's drop-down opens on the chip, its options named in plain words too.
  await chip.click();
  const right = page.locator('.blocklyDropDownDiv .blocklyMenuItem', { hasText: 'right' });
  await expect(right).toBeVisible();
  await expect(right).toHaveAttribute('aria-label', 'right');
  await right.click();
  await expect(chip).toHaveText(/right\s↻/);
  await expect(undoButton(page)).toHaveText('Undo: Change left to right in penguin turn');
  // A value chosen is a new value node, as the shared model's answers are (2.3, 5.3).
  const after = await chip.getAttribute('data-id');
  expect(after).not.toBe(before);
  // Changed again: one more step, from the new node.
  await chip.click();
  await page.locator('.blocklyDropDownDiv .blocklyMenuItem', { hasText: 'left' }).click();
  await expect(chip).toHaveText(/left\s↺/);
  await expect(undoButton(page)).toHaveText('Undo: Change right to left in penguin turn');
  await undoButton(page).click();
  await expect(chip).toHaveText(/right\s↻/);
  await expect(undoButton(page)).toHaveText('Undo: Change left to right in penguin turn');
});
