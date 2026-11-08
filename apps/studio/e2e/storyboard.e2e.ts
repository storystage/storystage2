import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The Storyboard by keyboard and touch-free mouse, in a real browser (docs/spec/07-ux.md section
// 6): the script header, adding scenes, reordering them with the keyboard, and deleting one.

async function seriousIssues(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const titles = (page: Page) => page.locator('.sb-scene-title').allTextContents();

async function planThreeScenes(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Logline' }).fill('A shy owl must find a lost key.');
  await page.getByRole('textbox', { name: 'Synopsis' }).fill('The owl finds the key.');
  for (const heading of ['The locked gate', 'Finding the key', 'Home at last']) {
    await page.getByRole('button', { name: 'Add a scene' }).click();
    await page.getByRole('textbox', { name: 'Heading' }).fill(heading);
  }
  await expect
    .poll(() => titles(page))
    .toEqual(['1 · The locked gate', '2 · Finding the key', '3 · Home at last']);
}

test('a scene moves with the keyboard alone, as one undo step', async ({ page }) => {
  await planThreeScenes(page);
  await page.getByRole('button', { name: 'Move scene 3' }).focus();
  await page.keyboard.press('Enter');
  // Wait for the drag to start, and for a place to drop it, before moving on.
  await expect(page.locator('.sb-scene-card[data-dragging]')).toHaveCount(1);
  // The first place to the left is just after scene 2, where scene 3 already is; the second is
  // before scene 2. Each key press is given a moment to land.
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
  }
  await expect(page.locator('[data-drop-target]')).not.toHaveCount(0);
  await page.keyboard.press('Enter');
  // Home at last is no longer the last scene. (How far one arrow key moves the drop place is
  // React Aria's; that the move happens by keyboard is what this checks.)
  await expect.poll(async () => (await titles(page)).at(-1)).not.toBe('3 · Home at last');
  expect((await titles(page)).some((t) => t.endsWith('Home at last'))).toBe(true);
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveText('Undo: Move scene 3');
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect
    .poll(() => titles(page))
    .toEqual(['1 · The locked gate', '2 · Finding the key', '3 · Home at last']);
});

test('axe finds no serious issues with scenes, and with the delete dialog open', async ({
  page,
}) => {
  await planThreeScenes(page);
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('button', { name: 'Delete scene' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete scene 3?' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Delete scene' }).click();
  await expect.poll(() => titles(page)).toHaveLength(2);
});

test('axe finds no serious issues with a frame open, its shots and its length', async ({
  page,
}) => {
  await planThreeScenes(page);
  await page.getByRole('button', { name: 'Add a frame' }).click();
  await page.getByRole('button', { name: 'More shots' }).click();
  await expect(page.getByRole('figure')).toContainText('Frame 3.1');
  expect(await seriousIssues(page)).toEqual([]);
  // The length field takes the arrow keys.
  await page.getByRole('textbox', { name: 'Length' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('figure')).toContainText('4 s');
});
