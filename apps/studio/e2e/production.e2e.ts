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
  // Named as Tiles names it (spec 14, section 2.4).
  await expect.poll(() => undoLabel(page)).toMatch(/^Undo: Change .* in /);
  // Undo, from the Storyboard's button, puts the words back in the block.
  await page.getByRole('tab', { name: /Storyboard/ }).click();
  await page.getByRole('button', { name: /^Undo/ }).click();
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(block(page, main.body[0]!.id)).not.toContainText('Hello there');
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
  await expect.poll(() => undoLabel(page)).toMatch(/^Undo: .*say Hello from the palette/);
  // Undo takes the new block away again.
  await page.getByRole('tab', { name: /Storyboard/ }).click();
  await page.getByRole('button', { name: /^Undo/ }).click();
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace')).not.toContainText('Hello from the palette');
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
  // A block running is marked in the Blocks editor (14-editors 3i.10).
  await expect(page.locator('.ss-highlight-rehearse').first()).toBeAttached({ timeout: 10_000 });
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
