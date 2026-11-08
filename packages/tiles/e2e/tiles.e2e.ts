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
  await item(page, 'cat say Hello add detail').focus();
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

const highlight = (page: Page, nodes: string[], kind: string) =>
  page.evaluate(
    ([n, k]) =>
      (
        window as unknown as { tiles: { editor: { highlight(n: string[], k: string): void } } }
      ).tiles.editor.highlight(n as string[], k as string),
    [nodes, kind] as const,
  );

test('the Prompter’s highlight wears the AI badge, and axe finds nothing', async ({ page }) => {
  await open(page);
  await highlight(page, ['saystm'], 'prompter');
  await expect(item(page, 'cat say Hello add detail AI')).toHaveClass(/tl-hl-prompter/);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

test('Rehearse’s outline moves, and holds still for reduced motion', async ({ page }) => {
  await open(page);
  await highlight(page, ['saystm'], 'rehearse');
  const animation = () =>
    page.locator('[data-key="saystm"]').evaluate((e) => getComputedStyle(e).animationName);
  expect(await animation()).toBe('tl-running');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animation()).toBe('none');
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
  await item(page, 'cat say Hello add detail').focus();
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

// The palette and the control bar (spec 14, 3a and 2.3).

async function chooseObject(page: Page, name: string) {
  await page.getByRole('button', { name: /Blocks for/ }).click();
  await page.getByRole('option', { name, exact: true }).click();
}

const last = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { tiles: { host: { announcements: string[] } } }
    ).tiles.host.announcements.at(-1),
  );

test('a block from the palette asks for each value, Enter taking the suggestion each time', async ({
  page,
}) => {
  await open(page);
  await chooseObject(page, 'cat');
  await page.getByRole('option', { name: 'cat move ??? ???' }).click();
  const direction = page.getByRole('menu', { name: 'direction' });
  await expect(direction.getByRole('menuitemradio', { name: 'forward' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByRole('menu', { name: 'amount' })
      .getByRole('menuitemradio', { name: '1', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await last(page)).toBe('Make cat move forward 1');
  await expect(page.getByRole('treeitem', { name: 'cat move forward 1 add detail' })).toBeVisible();
});

test('Escape part way through leaves the program as it was', async ({ page }) => {
  await open(page);
  const before = await page.locator('[data-statement]').count();
  await chooseObject(page, 'cat');
  await page.getByRole('option', { name: 'cat move ??? ???' }).click();
  await expect(page.getByRole('menu', { name: 'direction' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'amount' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await last(page)).toBe('Nothing added');
  await expect(page.locator('[data-statement]')).toHaveCount(before);
});

test('dragging a control block onto an empty list puts it there', async ({ page }) => {
  await open(page);
  const source = (await page.getByRole('button', { name: 'do together' }).first().boundingBox())!;
  const empty = (await page
    .getByRole('treeitem', { name: 'drop statement here, in if' })
    .boundingBox())!;
  await page.mouse.move(source.x + 10, source.y + 10);
  await page.mouse.down();
  await page.mouse.move(source.x + 40, source.y + 40, { steps: 5 });
  await page.mouse.move(empty.x + 40, empty.y + empty.height / 2, { steps: 10 });
  await expect(page.locator('.tl-drop-line')).toBeVisible();
  await page.mouse.up();
  expect(await last(page)).toBe('Add do together');
  await expect(page.getByRole('treeitem', { name: 'drop statement here, in if' })).toHaveCount(0);
});

test('dragging a block from the palette puts it where it is let go, after its values', async ({
  page,
}) => {
  await open(page);
  await chooseObject(page, 'cat');
  const source = (await page.getByRole('option', { name: 'cat move ??? ???' }).boundingBox())!;
  const count = (await page.getByRole('treeitem', { name: 'count up to 2' }).boundingBox())!;
  await page.mouse.move(source.x + 10, source.y + 10);
  await page.mouse.down();
  await page.mouse.move(source.x + 60, source.y + 20, { steps: 5 });
  await page.mouse.move(count.x + 100, count.y + 4, { steps: 10 });
  await expect(page.locator('.tl-drop-line')).toBeVisible();
  await page.mouse.up();
  await expect(
    page.getByRole('menu', { name: 'direction' }).getByRole('menuitemradio', { name: 'forward' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByRole('menu', { name: 'amount' })
      .getByRole('menuitemradio', { name: '1', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await last(page)).toBe('Make cat move forward 1');
  const rows = await page
    .locator('[data-statement][aria-level="1"]')
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.replace(/\s+/g, ' ').trim()),
    );
  expect(rows.findIndex((r) => r?.startsWith('cat move forward 1'))).toBe(
    rows.findIndex((r) => r?.startsWith('count up to 2')) - 1,
  );
});

test('adding an event opens it in a tab of its own', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'add event' }).click();
  await page.getByRole('menuitem', { name: 'when the scene starts' }).click();
  await expect(page.getByRole('tab', { name: 'when the scene starts' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tree', { name: 'when the scene starts' })).toBeVisible();
});
