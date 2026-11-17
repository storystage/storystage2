import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { exampleProduction } from '@storystage/production';

// The Blocks | Tiles switch with both real editors, in a browser (`14-editors.md` section 4;
// WP7.11): the first switch's dialog, Tiles under the studio's bar, one history across both, and
// the header at the iPad's width. The component tests are `src/production/editorSwitch.test.tsx`.

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const example = exampleProduction();
const main = example.program.types
  .flatMap((t) => t.methods)
  .find((m) => m.id === example.scenes[0]!.method)!;

async function openCode(page: Page, width = 1366) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
}

const editorSwitch = (page: Page) => page.getByRole('radiogroup', { name: 'Code editor' });
/** A side of the switch, clicked where it's drawn (React Aria's radio input is hidden). */
const side = (page: Page, name: 'Blocks' | 'Tiles') =>
  page.locator('.pr-editor-switch .ss-segment', { hasText: name });
const tilesRows = (page: Page) => page.locator('.pr-tiles [data-statement]');
const block = (page: Page, id: string) =>
  page.locator(`.pr-workspace .blocklyDraggable[data-id="${id}"]`).first();

/** Axe's serious and critical findings: WCAG 2.2 AA, and a dialog's name. */
async function serious(page: Page) {
  const wcag = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  const named = await new AxeBuilder({ page }).withRules(['aria-dialog-name']).analyze();
  return [...wcag.violations, ...named.violations]
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function toTiles(page: Page) {
  await side(page, 'Tiles').click();
  const dialog = page.getByRole('dialog', { name: '⇄ Switching to Tiles' });
  await expect(dialog.getByRole('button', { name: 'Show me Tiles' })).toBeFocused();
  return dialog;
}

test('the first switch explains, and Tiles shows the same program under the studio’s bar', async ({
  page,
}) => {
  await openCode(page);
  const dialog = await toTiles(page);
  await expect(dialog.getByText(/Your program is kept\./)).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('region', { name: 'Code for scene 1, in Tiles' })).toBeVisible();
  await expect(tilesRows(page)).toHaveCount(main.body.length);
  await expect(page.locator('.pr-tiles')).toContainText('say');
  // One set of method tabs and one object picker: the studio's.
  await expect(page.locator('.pr-code [role="tablist"]')).toHaveCount(1);
  await expect(page.locator('.pr-tiles .tl-picker')).toHaveCount(0);
  expect(await serious(page)).toEqual([]);
});

test('a step made in Tiles undoes in Blocks: one history', async ({ page }) => {
  await openCode(page);
  const dialog = await toTiles(page);
  await dialog.getByText('Don’t explain this again').click();
  await expect(dialog.getByRole('checkbox', { name: 'Don’t explain this again' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Show me Tiles' }).click();
  await expect(tilesRows(page)).toHaveCount(main.body.length);
  await tilesRows(page).first().focus();
  await page.keyboard.press('Control+d');
  await expect(tilesRows(page)).toHaveCount(main.body.length + 1);
  // Explained once: no dialog now.
  await side(page, 'Blocks').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  await expect(block(page, main.body[0]!.id)).toBeVisible();
  const undo = page.getByRole('toolbar', { name: 'Undo and redo' }).getByRole('button', {
    name: /^Undo/,
  });
  await undo.click();
  await side(page, 'Tiles').click();
  await expect(tilesRows(page)).toHaveCount(main.body.length);
});

for (const width of [1366, 1180]) {
  test(`the switch fits in the bar at ${width} px, with no sideways scroll`, async ({ page }) => {
    await openCode(page, width);
    await expect(editorSwitch(page)).toBeVisible();
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scroll).toBeLessThanOrEqual(width);
    const own = (await page.locator('.pr-editor-switch').boundingBox())!;
    expect(own.height, 'Code, the switch and the note sit on one row').toBeLessThan(90);
  });
}
