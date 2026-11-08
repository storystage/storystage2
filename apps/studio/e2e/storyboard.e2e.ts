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

const sketchNames = (page: Page) =>
  page
    .getByRole('listbox', { name: /^Sketches on frame/ })
    .getByRole('option')
    .evaluateAll((options) => options.map((o) => o.getAttribute('aria-label')));

test('a sketch goes on the frame and moves with the keyboard alone, one undo step', async ({
  page,
}) => {
  await planThreeScenes(page);
  await page.getByRole('button', { name: 'Add a frame' }).click();
  await page.getByRole('row', { name: 'Add Trees to frame 3.1' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => sketchNames(page)).toEqual(['Trees, in the middle']);
  await page.getByRole('option', { name: 'Trees, in the middle' }).focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Equal');
  await page.keyboard.press('Enter');
  await expect.poll(() => sketchNames(page)).toEqual(['Trees, on the left']);
  // The move and the resize, one step each.
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveText('Undo: Make Trees bigger');
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveText('Undo: Move Trees');
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(() => sketchNames(page)).toEqual(['Trees, in the middle']);
});

test('a sketch drags from the library onto the frame, and across it', async ({ page }) => {
  await planThreeScenes(page);
  await page.getByRole('button', { name: 'Add a frame' }).click();
  const paper = page.locator('.sb-canvas-paper');
  const box = (await paper.boundingBox())!;
  await page
    .getByRole('row', { name: 'Add Speech bubble to frame 3.1' })
    .dragTo(paper, { targetPosition: { x: box.width * 0.8, y: box.height * 0.3 } });
  await expect.poll(() => sketchNames(page)).toEqual(['Speech bubble, on the right']);
  const bubble = page.getByRole('option', { name: 'Speech bubble, on the right' });
  const at = (await bubble.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => sketchNames(page)).toEqual(['Speech bubble, on the left']);
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveText('Undo: Move Speech bubble');
});

test('axe finds no serious issues with the sketch library and sketches on the frame', async ({
  page,
}) => {
  await planThreeScenes(page);
  await page.getByRole('button', { name: 'Add a frame' }).click();
  for (const name of ['Hills', 'Speech bubble'])
    await page.getByRole('row', { name: `Add ${name} to frame 3.1` }).click();
  await expect.poll(() => sketchNames(page)).toHaveLength(2);
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('option', { name: /^Speech bubble/ }).focus();
  await page.keyboard.press('Enter');
  expect(await seriousIssues(page)).toEqual([]);
});

const scriptLines = (page: Page) =>
  page
    .getByRole('grid', { name: /^Lines in scene/ })
    .getByRole('row')
    .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).innerText.replace(/\s+/g, ' ')));

test('lines are written, pinned and reordered with the keyboard alone', async ({ page }) => {
  await planThreeScenes(page);
  await page.getByRole('button', { name: 'Add a frame' }).click();
  const script = page.getByRole('complementary', { name: 'Script' });
  const newLine = script.getByRole('textbox', { name: 'New line' });
  await newLine.fill('Night. The owl lands on a low branch.');
  await newLine.press('Enter');
  const who = script.getByRole('combobox', { name: 'Who says it' });
  await who.fill('Owl');
  await who.press('Tab');
  await newLine.fill('Here is the key.');
  await newLine.press('Enter');
  await expect.poll(() => scriptLines(page)).toHaveLength(2);
  expect((await scriptLines(page))[1]).toContain('Here is the key.');
  // Pin line 2 to the current frame from the keyboard.
  await script.getByRole('button', { name: 'Pin line 2' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Pin to frame 3.1, this frame' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('list', { name: 'Lines pinned to frame 3.1' })).toContainText(
    'Owl: Here is the key.',
  );
  // Move line 2 above line 1.
  await script.getByRole('button', { name: 'Move line 2' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.sb-line[data-dragging]')).toHaveCount(1);
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(150);
  }
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await scriptLines(page))[0]).toContain('Here is the key.');
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveText('Undo: Move line 2');
  await page.screenshot({ path: 'test-results/script-pane.png' });
});

test('axe finds no serious issues with the script pane, a line open and a menu open', async ({
  page,
}) => {
  await planThreeScenes(page);
  await page.getByRole('button', { name: 'Add a frame' }).click();
  const script = page.getByRole('complementary', { name: 'Script' });
  for (const text of ['The gate is locked.', 'Who has the key?']) {
    await script.getByRole('textbox', { name: 'New line' }).fill(text);
    await script.getByRole('textbox', { name: 'New line' }).press('Enter');
  }
  await expect.poll(() => scriptLines(page)).toHaveLength(2);
  expect(await seriousIssues(page)).toEqual([]);
  await page
    .getByRole('grid', { name: /^Lines in scene/ })
    .getByRole('row')
    .first()
    .click();
  await expect(script.getByRole('textbox', { name: 'Line 1' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await script.getByRole('button', { name: 'Pin line 2' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});
