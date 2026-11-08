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
  await expect(item(page, 'cat say Hello add detail')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(item(page, 'cat move forward 1 how long 2 add detail')).toBeFocused();
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
  await expect(item(page, 'cat move forward 1 how long 2 add detail')).toBeVisible();
  await expect(item(page, 'cat turn left 0.25 (switched off) add detail')).toBeVisible();
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

// Editing (spec 14, 3c–3e), which needs real layout and real pointer events.

/** The keys of the statements directly inside `do together`, in order. */
const together = (page: Page) =>
  page
    .locator('[data-key="togeth"]')
    .evaluate((header) =>
      [...header.closest('li')!.querySelectorAll('[data-statement]')]
        .map((e) => e.getAttribute('data-key'))
        .filter((k) => k !== 'togeth'),
    );

test('dragging a statement by its grip shows the drop line, then moves it there', async ({
  page,
}) => {
  await open(page);
  const grip = (await page.locator('[data-key="saystm"] [data-grip]').boundingBox())!;
  const turn = (await page.locator('[data-key="turnst"]').boundingBox())!;
  await page.mouse.move(grip.x + 6, grip.y + 20);
  await page.mouse.down();
  await page.mouse.move(grip.x + 60, grip.y + 60, { steps: 5 });
  await page.mouse.move(turn.x + 200, turn.y + 8, { steps: 10 });
  await expect(page.locator('.tl-drop-line')).toBeVisible();
  await expect(page.locator('.tl-drop-line')).toContainText('Drops here');
  await page.mouse.up();
  expect(await together(page)).toEqual(['movest', 'saystm', 'turnst']);
});

test('a drag let go somewhere nothing can go changes nothing', async ({ page }) => {
  await open(page);
  const grip = (await page.locator('[data-key="saystm"] [data-grip]').boundingBox())!;
  await page.mouse.move(grip.x + 6, grip.y + 20);
  await page.mouse.down();
  await page.mouse.move(grip.x + 400, grip.y + 700, { steps: 10 });
  await page.mouse.up();
  await expect(item(page, 'cat say Hello add detail')).toHaveAttribute('aria-posinset', '1');
});

test('moving by keyboard: Space, ↓, Space', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.tl-drop-line')).toBeVisible();
  await page.keyboard.press('Space');
  expect(await together(page)).toEqual(['saystm', 'movest', 'turnst']);
  await expect(item(page, 'cat say Hello add detail')).toBeFocused();
});

test('choosing a value from its menu, with axe finding nothing while it is open', async ({
  page,
}) => {
  await open(page);
  await page.locator('[data-key="movest"] .tl-pill', { hasText: 'forward' }).click();
  const menu = page.getByRole('menu', { name: 'direction' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'forward' })).toBeFocused();
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await menu.getByRole('menuitemradio', { name: 'backward' }).click();
  await expect(item(page, 'cat move backward 1 how long 2 add detail')).toBeVisible();
});

test('a typed number is checked before it goes in', async ({ page }) => {
  await open(page);
  await page.locator('[data-key="movest"] .tl-pill', { hasText: /^1$/ }).click();
  await page.getByRole('menuitemradio', { name: 'Other number…' }).click();
  const field = page.getByRole('textbox', { name: 'amount' });
  await field.fill('far');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(
    'That isn’t a number. Type digits, like 2 or 0.5.',
  );
  await field.fill('3');
  await page.keyboard.press('Enter');
  await expect(item(page, 'cat move forward 3 how long 2 add detail')).toBeVisible();
});
