import { expect, type Locator, type Page } from '@playwright/test';

// What each editor offers a learner, driven by pointer or by keyboard (spec 14, section 5.2):
// Tiles' rows, palette, control bar and menus (section 3c–3e), and Blocks' blocks, flyout and
// Blockly's keyboard move (section 3i.6–3i.9). Nothing here edits the program any other way.

export type Way =
  'Blocks by pointer' | 'Blocks by keyboard' | 'Tiles by pointer' | 'Tiles by keyboard';
export const WAYS: readonly Way[] = [
  'Blocks by pointer',
  'Blocks by keyboard',
  'Tiles by pointer',
  'Tiles by keyboard',
];
export const editorOf = (way: Way) => (way.startsWith('Blocks') ? 'Blocks' : 'Tiles');

/** Blockly's keys, paced: under software drawing, faster presses can lose focus (S5). */
export async function blocklyKey(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
}

/** Presses `key` until `done`, at most `most` times. */
export async function pressUntil(page: Page, key: string, done: () => Promise<boolean>, most = 30) {
  for (let i = 0; i < most; i++) {
    if (await done()) return;
    await blocklyKey(page, key);
  }
  expect(await done(), `${key} pressed ${most} times`).toBe(true);
}

const isFocused = (l: Locator) => l.evaluate((e) => e === document.activeElement);

// The studio's bar, which serves both editors (section 4.1).

/** "Blocks for" and its object, by pointer. */
export async function chooseObjectByPointer(page: Page, name: string) {
  await page.getByRole('button', { name: /Blocks for/ }).click();
  await page
    .getByRole('listbox', { name: 'Blocks for', exact: true })
    .getByRole('option', { name, exact: true })
    .click();
}

/** "Blocks for" and its object, by keyboard. */
export async function chooseObjectByKeyboard(page: Page, name: string) {
  await page.getByRole('button', { name: /Blocks for/ }).focus();
  await page.keyboard.press('Enter');
  const list = page.getByRole('listbox', { name: 'Blocks for', exact: true });
  await expect(list).toBeVisible();
  const option = list.getByRole('option', { name, exact: true });
  await pressUntil(page, 'ArrowDown', () => isFocused(option), 8);
  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
}

// The cascade and value menus: one component for both editors (spec 14, section 2.3).

/** A value in a menu: a radio item (a value to choose), or a plain one (a variable, an object). */
const choice = (menu: Locator, value: string) =>
  menu
    .getByRole('menuitemradio', { name: value, exact: true })
    .or(menu.getByRole('menuitem', { name: value, exact: true }));

/** Chooses `value` in the open menu named `slot`, by pointer. */
export async function answerByPointer(page: Page, slot: string, value: string) {
  const menu = page.getByRole('menu', { name: slot, exact: true });
  await choice(menu, value).click();
  await expect(menu).toBeHidden();
}

/** Chooses `value` in the open menu named `slot`, by keyboard: arrows from where it opened. */
export async function answerByKeyboard(page: Page, slot: string, value: string) {
  const menu = page.getByRole('menu', { name: slot, exact: true });
  await expect(menu).toBeVisible();
  const item = choice(menu, value);
  await pressUntil(page, 'ArrowDown', () => isFocused(item), 20);
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
}

// Tiles.

export const tilesRow = (page: Page, id: string) =>
  page.locator(`.pr-tiles [data-statement][data-key="${id}"]`);

/** A palette tile, by the words it shows ("penguin move ??? ???"). */
export const tilesPaletteTile = (page: Page, words: string) =>
  page.locator('.pr-tiles').getByRole('option', { name: words, exact: true });

/** Drags from `from` to just inside the bottom of `below`, where the drop line shows. */
export async function tilesDragBelow(page: Page, from: Locator, below: Locator) {
  const source = (await from.boundingBox())!;
  const row = (await below.boundingBox())!;
  await page.mouse.move(source.x + 10, source.y + 10);
  await page.mouse.down();
  await page.mouse.move(source.x + 60, source.y + 20, { steps: 5 });
  await page.mouse.move(row.x + 100, row.y + row.height - 4, { steps: 10 });
  await expect(page.locator('.tl-drop-line')).toBeVisible();
  await page.mouse.up();
}

// Blocks.

/** A block in the method, by its node id: Blocks' block ids are the program's (section 5.5). */
export const block = (page: Page, id: string) =>
  page.locator(`.pr-workspace .blocklyDraggable[data-id="${id}"]`).first();

/**
 * A block in the flyout by the entry it makes (S5's `data-callee`, #470): a Story API block by
 * its name ("move", "getDistanceTo"), or a control block as "control:doTogether". Exact: a block
 * type's class would match the value blocks inside a flyout block too (S5's review).
 */
export const flyoutBlock = (page: Page, name: string) =>
  page
    .locator(
      `.blocklyFlyout [data-callee="${name.startsWith('control:') ? name : `story:${name}`}"]`,
    )
    .first();

/**
 * The whole workspace in the window, as production.e2e has it: the code sits below the scene
 * view, and a drag can't start or end past the window's edge.
 */
export async function inView(page: Page) {
  await page.locator('.pr-workspace').scrollIntoViewIfNeeded();
}

type Point = { readonly x: number; readonly y: number };

/**
 * Drags a block by a point near its top left to `to` on the page (as production.e2e does). The
 * grab is 8 px in from the block's corner, which is the block's own edge for every statement block
 * today; a chip that started nearer the corner would be pulled out instead (S5's review). `to`
 * may be worked out once the drag has begun, as Blocks closes up the stack when a statement is
 * lifted, so what was below it moves up (S5, #473).
 */
export async function blocksDrag(page: Page, from: Locator, to: Point | (() => Promise<Point>)) {
  const box = (await from.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.y + 8, 'the block to drag is in the window').toBeLessThan(view.height);
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 40, { steps: 5 });
  const there = typeof to === 'function' ? await to() : to;
  expect(there.y, 'where it goes is in the window').toBeLessThan(view.height);
  await page.mouse.move(there.x, there.y, { steps: 10 });
  await page.mouse.up();
}

/** Drags a flyout block to just under the block `below`, where it joins on. */
export async function blocksDragBelow(page: Page, from: Locator, below: Locator) {
  await inView(page);
  await flyoutScrolledTo(page, from);
  const row = (await below.boundingBox())!;
  await blocksDrag(page, from, { x: row.x + 8, y: row.y + row.height + 6 });
}

/** The flyout's blocks by keyboard: Tab from New into it, then down to `name`'s block. */
export async function blocksFlyoutByKeyboard(page: Page, name: string) {
  await page.getByRole('button', { name: /^New in scene/ }).focus();
  await blocklyKey(page, 'Tab');
  const wanted = flyoutBlock(page, name);
  await pressUntil(page, 'ArrowDown', () =>
    wanted.evaluate((b) => b.contains(document.activeElement)),
  );
}

/**
 * Blockly's keyboard move, after Enter on a flyout block: down until its insertion marker joins
 * on under the block `after`, then Enter puts it there.
 */
export async function blocksPutAfter(page: Page, after: string) {
  await blocklyKey(page, 'Enter');
  const marker = page.locator(
    `.pr-workspace .blocklyBlock[data-id="${after}"] > .blocklyInsertionMarker`,
  );
  await pressUntil(page, 'ArrowDown', async () => (await marker.count()) > 0, 10);
  await blocklyKey(page, 'Enter');
}

/** The node id of the block keyboard focus is in, and the words Blockly says for it. */
const blocklyFocus = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return {
      id: a?.closest('[data-id]')?.getAttribute('data-id') ?? null,
      label: a?.getAttribute('aria-label') ?? '',
    };
  });

/** Keyboard focus on the block `id` in the method: Tab from New to the workspace, then ↓. */
export async function blocksFocusBlock(page: Page, id: string) {
  await page.getByRole('button', { name: /^New in scene/ }).focus();
  await blocklyKey(page, 'Tab');
  await blocklyKey(page, 'Tab');
  await pressUntil(page, 'ArrowDown', async () => {
    const at = await blocklyFocus(page);
    return at.id === id && !at.label.startsWith('End ');
  });
}

/** From a block in focus, → along it until `where` holds keyboard focus. */
export async function blocksAlongTo(page: Page, where: Locator) {
  await pressUntil(page, 'ArrowRight', () =>
    where.evaluate((e) => e === document.activeElement || e.contains(document.activeElement)),
  );
}

/** A value chip in a block, by its value's node id. */
export const blocksChip = (page: Page, valueId: string) =>
  page.locator(`.pr-workspace [data-id="${valueId}"] [aria-label^="dropdown:"]`).first();

/** Blockly's own drop-down on a chip: an option, by its name. */
export const blocklyOption = (page: Page, name: string) =>
  page.locator('.blocklyDropDownDiv .blocklyMenuItem', { hasText: name }).first();

/** In Blockly's open drop-down, ↓ to `name`, then Enter. */
export async function blocklyChooseByKeyboard(page: Page, name: string) {
  const option = blocklyOption(page, name);
  await expect(option).toBeVisible();
  await pressUntil(page, 'ArrowDown', async () =>
    option.evaluate(
      (e) =>
        e.classList.contains('blocklyMenuItemHighlight') ||
        e.getAttribute('aria-selected') === 'true' ||
        e === document.activeElement,
    ),
  );
  await blocklyKey(page, 'Enter');
  await expect(option).toBeHidden();
}

/** Chooses `item` in the open menu named `menu` (not a value: a detail, a variable), by pointer. */
export async function itemByPointer(page: Page, menu: string, item: string) {
  await page
    .getByRole('menu', { name: menu, exact: true })
    .getByRole('menuitem', { name: item, exact: true })
    .click();
}

/** The same by keyboard: ↓ to it, then Enter. */
export async function itemByKeyboard(page: Page, menu: string, item: string) {
  const m = page.getByRole('menu', { name: menu, exact: true });
  await expect(m).toBeVisible();
  const it = m.getByRole('menuitem', { name: item, exact: true });
  await pressUntil(page, 'ArrowDown', () => isFocused(it), 20);
  await page.keyboard.press('Enter');
}

/** A pill in a Tiles row, by its value's node id. */
export const tilesPill = (page: Page, valueId: string) =>
  page.locator(`.pr-tiles [data-key="${valueId}"]`).first();

/** From a Tiles row in focus, → along it until `where` has focus. */
export async function tilesAlongTo(page: Page, where: Locator) {
  await pressUntil(page, 'ArrowRight', () => isFocused(where), 12);
}

/** A Tiles row's "add detail ▾". */
export const tilesAddDetail = (page: Page, id: string) =>
  page.locator(`.pr-tiles [data-detail="${id}"]`).first();

/**
 * A block's own "add detail ▾". Blockly draws the blocks after a block inside its group, so of
 * the buttons in it, the one whose nearest block is this one.
 */
export async function blocksAddDetail(page: Page, id: string): Promise<Locator> {
  const buttons = block(page, id).getByRole('button', { name: 'add detail' });
  const own = await buttons.evaluateAll(
    (all, want) =>
      all.findIndex((b) => b.closest('.blocklyDraggable')?.getAttribute('data-id') === want),
    id,
  );
  expect(own, `${id} has its own add detail`).toBeGreaterThanOrEqual(0);
  return buttons.nth(own);
}

/** Blockly's keyboard move of a block in the method (M), then ↓ until `there` holds its marker. */
export async function blocksMoveByKeyboard(page: Page, id: string, there: () => Promise<boolean>) {
  await blocksFocusBlock(page, id);
  await blocklyKey(page, 'm');
  await pressUntil(page, 'ArrowDown', there, 12);
  await blocklyKey(page, 'Enter');
}

/**
 * Whether Blockly's insertion marker is inside a block: in a container's body, or in one of a
 * block's value inputs. The marker for "after the block" is drawn in the block's group too, so it
 * is told apart by where it sits (S5's review): one inside is indented, x > 0; one after it is at
 * x = 0, below it.
 */
export const blocksMarkerInside = (page: Page, block: string) =>
  page
    .locator(`.pr-workspace .blocklyBlock[data-id="${block}"] > .blocklyInsertionMarker`)
    .evaluateAll((markers) =>
      markers.some((m) => {
        const x = /translate\(\s*([-\d.]+)/.exec(m.getAttribute('transform') ?? '')?.[1];
        return x !== undefined && Number(x) > 0;
      }),
    );

/** The control bar's tile, by its words (Tiles' "Control blocks" toolbar). */
export const tilesControl = (page: Page, words: string) =>
  page
    .locator('.pr-tiles')
    .getByRole('toolbar', { name: 'Control blocks' })
    .getByRole('button', { name: words, exact: true });

/** Drags a Tiles row by its grip to (x, y), where the drop line shows, and lets go. */
export async function tilesDragRow(page: Page, id: string, to: { x: number; y: number }) {
  const grip = (await page.locator(`.pr-tiles [data-key="${id}"] [data-grip]`).boundingBox())!;
  await page.mouse.move(grip.x + 6, grip.y + 20);
  await page.mouse.down();
  await page.mouse.move(grip.x + 60, grip.y + 60, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(page.locator('.tl-drop-line')).toBeVisible();
  await page.mouse.up();
}

/** Tiles' keyboard move: Space picks up the row in focus, ↓ until `placed`, Space puts it down. */
export async function tilesMoveByKeyboard(page: Page, id: string, placed: () => Promise<boolean>) {
  await tilesRow(page, id).focus();
  await page.keyboard.press('Space');
  await pressUntil(page, 'ArrowDown', placed, 12);
  await page.keyboard.press('Space');
}

/** The drop line is inside `box` (a container's empty list), on screen. */
export async function dropLineIn(page: Page, box: Locator) {
  const line = await page.locator('.tl-drop-line').boundingBox();
  const b = await box.boundingBox();
  if (!line || !b) return false;
  const mid = line.y + line.height / 2;
  return mid >= b.y - 2 && mid <= b.y + b.height + 2;
}

/** The flyout scrolled with the mouse wheel, as a learner scrolls it, until `wanted` shows. */
export async function flyoutScrolledTo(page: Page, wanted: Locator) {
  const flyout = (await page.locator('.pr-workspace .blocklyFlyout').first().boundingBox())!;
  const bottom = Math.min(flyout.y + flyout.height, page.viewportSize()!.height);
  for (let i = 0; i < 40; i++) {
    const box = await wanted.boundingBox();
    if (box && box.y >= flyout.y && box.y + 24 <= bottom) return;
    await page.mouse.move(flyout.x + flyout.width / 2, (flyout.y + bottom) / 2);
    await page.mouse.wheel(0, box && box.y < flyout.y ? -120 : 120);
    await page.waitForTimeout(50);
  }
  throw new Error('The flyout block never came into view');
}

/**
 * Where a block made just now is drawn, once it stays put: Blocks rebuilds the method a moment
 * after a change from elsewhere (section 3i.8), so the first box seen can go.
 */
export async function settled(page: Page, selector: string) {
  let last = '';
  let box: { x: number; y: number; width: number; height: number } | null = null;
  await expect
    .poll(
      async () => {
        box = await page.locator(selector).first().boundingBox();
        const now = JSON.stringify(box);
        const same = box !== null && now === last;
        last = now;
        return same;
      },
      { intervals: [150] },
    )
    .toBe(true);
  return box!;
}

/** A block's own menu (right-click), then one of its items (section 3i.7). */
export async function blocksMenu(page: Page, id: string, item: string) {
  await inView(page);
  await block(page, id).click({ button: 'right', position: { x: 8, y: 8 } });
  const menu = page.locator('.blocklyContextMenu');
  await expect(menu).toBeVisible();
  await menu.getByText(item, { exact: true }).click();
  await expect(menu).toBeHidden();
}

/** The ids of the statements of a kind in the method, in Blocks or in Tiles, other than `known`. */
export async function madeIds(page: Page, editor: 'Blocks' | 'Tiles', known: readonly string[]) {
  const ids =
    editor === 'Blocks'
      ? await page
          .locator('.pr-workspace .blocklyDraggable[data-id]:not(.blocklyFlyout *)')
          .evaluateAll((els) => els.map((e) => e.getAttribute('data-id')!))
      : await page
          .locator('.pr-tiles [data-statement][data-key]')
          .evaluateAll((els) => els.map((e) => e.getAttribute('data-key')!));
  return [...new Set(ids)].filter((i) => !known.includes(i));
}

/**
 * The studio bar's Actions or Questions (section 2.1), a segmented control: by pointer on its
 * drawn side (the radio input is hidden), or by keyboard, the arrows choosing.
 */
export async function paletteTab(
  page: Page,
  tab: 'Actions' | 'Questions',
  by: 'pointer' | 'keyboard',
) {
  const bar = page.locator('.pr-palette-bar');
  const radio = bar.getByRole('radio', { name: tab, exact: true });
  if (by === 'pointer') await bar.locator('.ss-segment', { hasText: tab }).click();
  else {
    await bar
      .getByRole('radio', { checked: true })
      .filter({ hasText: /^(Actions|Questions)$/ })
      .or(bar.getByRole('radio', { name: 'Actions', exact: true, checked: true }))
      .first()
      .focus();
    await pressUntil(page, 'ArrowRight', () => radio.isChecked(), 3);
  }
  await expect(radio).toBeChecked();
}

/** Drags `from` by its top left to the top left of `onto` (a value's chip or pill). */
export async function dragOnto(page: Page, from: Locator, onto: Locator) {
  const source = (await from.boundingBox())!;
  const target = (await onto.boundingBox())!;
  // Grabbed half its height in from its left, at its middle: a question is drawn rounded, so its
  // corner is outside it (S5). Dropped the same way onto the value.
  const grab = source.height / 2;
  await page.mouse.move(source.x + grab, source.y + grab);
  await page.mouse.down();
  await page.mouse.move(source.x + grab + 30, source.y + grab + 20, { steps: 5 });
  await page.mouse.move(target.x + grab, target.y + target.height / 2, { steps: 10 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

/**
 * Blockly's keyboard move has a value in reach to replace: an occupied value slot gets no
 * insertion marker, its value is faded instead (`blocklyReplaceable`, S5).
 */
export const blocksReplacing = async (page: Page, valueId: string) =>
  (await page.locator(`.pr-workspace [data-id="${valueId}"].blocklyReplaceable`).count()) > 0;

/** A value's block in Blocks (its shadow or chip), by its node id. */
export const blocksValue = (page: Page, valueId: string) =>
  page.locator(`.pr-workspace [data-id="${valueId}"]`).first();

/**
 * Tiles' variable tile's question (section 2.5): its name, typed, and what it holds, by pointer
 * on its drawn choice or by keyboard (Tab, then ↓); Enter makes it.
 */
export async function tilesVariable(
  page: Page,
  name: string,
  holds: string,
  by: 'pointer' | 'keyboard',
) {
  const dialog = page.getByRole('dialog', { name: 'A new variable' });
  const field = dialog.getByRole('textbox', { name: 'Its name' });
  await expect(field).toBeFocused();
  await page.keyboard.type(name);
  const radio = dialog.getByRole('radio', { name: holds, exact: true });
  if (by === 'pointer') await dialog.getByText(holds, { exact: true }).click();
  else {
    await page.keyboard.press('Tab');
    await pressUntil(page, 'ArrowDown', () => radio.isChecked(), 6);
  }
  await expect(radio).toBeChecked();
  if (by === 'pointer') await field.click();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
}
