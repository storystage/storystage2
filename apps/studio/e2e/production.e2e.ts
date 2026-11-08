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
  await expect(block(page, main.body[0]!.id)).toBeVisible();
}

/** Drags a block by a point near its top left to (x, y) on the page. */
async function drag(page: Page, from: Locator, to: { x: number; y: number }) {
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 40, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

const undoLabel = async (page: Page) => {
  await page.getByRole('tab', { name: /Storyboard/ }).click();
  const text = await page.getByRole('button', { name: /^Undo/ }).textContent();
  await page.getByRole('tab', { name: /Production stage/ }).click();
  return text;
};

test('the scene’s method opens in the Blocks editor, one tab per method', async ({ page }) => {
  await openCode(page);
  const tabs = page.getByRole('tablist', { name: 'Methods in scene 1' }).getByRole('tab');
  await expect(tabs.first()).toHaveText(main.name);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  for (const s of main.body) await expect(block(page, s.id)).toBeVisible();
});

test('a value changed in a block is one undo step in the studio’s history', async ({ page }) => {
  await openCode(page);
  const say = block(page, main.body[0]!.id);
  const words = say.locator('.blocklyEditableField').last();
  await words.click();
  const input = page.locator('.blocklyHtmlInput');
  await expect(input).toBeVisible();
  await input.fill('Hello there');
  await input.press('Enter');
  await expect(say).toContainText('Hello there');
  await expect.poll(() => undoLabel(page)).toBe('Undo: Change text');
  // Undo, from the Storyboard's button, puts the words back in the block.
  await page.getByRole('tab', { name: /Storyboard/ }).click();
  await page.getByRole('button', { name: /^Undo/ }).click();
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(block(page, main.body[0]!.id)).not.toContainText('Hello there');
});

test('a block dropped outside the method goes back, and the learner hears why', async ({
  page,
}) => {
  await openCode(page);
  const first = block(page, main.body[0]!.id);
  const start = (await first.boundingBox())!;
  const area = (await page.locator('.pr-workspace').boundingBox())!;
  await drag(page, first, { x: area.x + area.width - 60, y: area.y + area.height - 40 });
  // The studio's live region (Blockly has one of its own too).
  await expect(page.locator('.pr > p[aria-live="polite"]')).toHaveText(
    'Blocks go inside a method.',
  );
  await expect
    .poll(async () => Math.round((await block(page, main.body[0]!.id).boundingBox())!.y))
    .toBe(Math.round(start.y));
  expect(await undoLabel(page)).toBe('Undo');
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
