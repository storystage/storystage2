import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Spec 14, section 7: the tile editor in a real browser. Keyboard paths and screen-reader names,
// and axe with WCAG 2.2 AA at the three sizes S5's accessibility test uses (07-ux, section 1).

const PAGE = 'http://localhost:4183/';
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SIZES = [
  { name: 'laptop', width: 1536, height: 864 },
  { name: 'Chromebook', width: 1366, height: 768 },
  { name: 'iPad', width: 1180, height: 820 },
] as const;

async function open(page: Page) {
  await page.goto(PAGE);
  await expect(page.getByRole('tree', { name: 'Scene1.myFirstMethod' })).toBeVisible();
}

const item = (page: Page, name: string) => page.getByRole('treeitem', { name, exact: true });

for (const size of SIZES) {
  test(`axe finds no serious issues at ${size.name} size`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await open(page);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
    const serious = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(serious).toEqual([]);
  });
}

test('every row and empty list is 44 px high or more', async ({ page }) => {
  await open(page);
  for (const row of await page.getByRole('treeitem').all()) {
    const box = await row.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('the keyboard reaches every row and pill, with focus always visible', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab');
  await expect(item(page, 'cat say Hello')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(item(page, 'cat move forward 1 how long 2')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tl-pill', { hasText: 'forward' })).toBeFocused();
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).boxShadow);
  expect(ring).not.toBe('none');
  await page.keyboard.press('End');
  await expect(item(page, 'Now the cat looks around')).toBeFocused();
});

test('names rows by the words they show, and a switched-off row as switched off', async ({
  page,
}) => {
  await open(page);
  await expect(item(page, 'cat move forward 1 how long 2')).toBeVisible();
  await expect(item(page, 'cat turn left 0.25 (switched off)')).toBeVisible();
  await expect(item(page, 'count up to 2')).toBeVisible();
});

test('highlights through the contract show on the row', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const { editor } = (
      window as unknown as { tiles: { editor: { highlight(n: string[], k: string): void } } }
    ).tiles;
    editor.highlight(['countt'], 'rehearse');
  });
  await expect(page.locator('li.tl-box', { has: item(page, 'count up to 2') })).toHaveClass(
    /tl-hl-rehearse/,
  );
});
