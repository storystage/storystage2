/**
 * Spike 1.5: both editors in Chromium (software rendering). Checks what the workplan names:
 * a typed move with a direction and an amount, a nested do together, an object-typed slot,
 * invalid drops refused, arguments asked for on drop, keyboard navigation. Measures frame times
 * while dragging with a mouse and with touch. Numbers go to test-results/spike-1.5-results.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

type Point = { x: number; y: number };
type Stats = { frames: number; medianMs: number; p95Ms: number; maxMs: number; longFrames: number };
const results: Record<string, unknown> = {};

const text = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { spike: { programText(): string } }).spike.programText(),
  );

async function center(page: Page, selector: string): Promise<Point> {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function mouseDrag(page: Page, from: Point, to: Point, steps = 40) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

/** Touch drag through the DevTools protocol (Playwright has no touch-move helper). */
async function touchDrag(page: Page, from: Point, to: Point, steps = 40) {
  const cdp = await page.context().newCDPSession(page);
  const at = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: at(from.x, from.y),
  });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x, y) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Runs a drag with frame times recorded throughout. */
async function measured(page: Page, name: string, drag: () => Promise<void>) {
  await page.evaluate(() =>
    (window as unknown as { spike: { startFrames(): void } }).spike.startFrames(),
  );
  await drag();
  results[name] = await page.evaluate(() =>
    (window as unknown as { spike: { stopFrames(): Stats } }).spike.stopFrames(),
  );
}

/** Answers the cascade by keyboard: for each question, press ArrowDown n times, then Enter. */
async function answerCascade(page: Page, downs: number[]) {
  for (const n of downs) {
    await expect(page.locator('.cascade [role=menuitem]:focus')).toBeVisible();
    for (let i = 0; i < n; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('.cascade')).toHaveCount(0);
}

const tile = (label: string) => `.palette-tile:text-is("${label}")`;

test.describe.configure({ mode: 'serial' });

test.describe('option C: React tiles', () => {
  test('mouse: nested do together, typed move, arguments on drop, number refused in the object slot', async ({
    page,
  }) => {
    await page.goto('/?editor=tiles');
    const head = await center(page, '.program-head');
    await mouseDrag(page, await center(page, tile('do together')), { x: head.x, y: head.y + 22 });
    expect(await text(page)).toBe('do together:\n  (empty)');

    const inside = await center(page, '.tile.container .gap');
    const from = await center(page, tile('move'));
    await measured(page, 'tiles.mouseDrag', () => mouseDrag(page, from, inside));
    await answerCascade(page, [1, 0, 2]); // the dog, forward, 1 m
    expect(await text(page)).toBe('do together:\n  dog.move(forward, 1)');

    const objectSlot = await center(page, '.tile.move .slot');
    await mouseDrag(page, await center(page, tile('2')), objectSlot);
    expect(await text(page)).toBe('do together:\n  dog.move(forward, 1)');
    await expect(page.locator('.live')).toHaveText("2 can't go there");

    await mouseDrag(page, await center(page, tile('the cat')), objectSlot);
    expect(await text(page)).toBe('do together:\n  cat.move(forward, 1)');
  });

  test('keyboard only: add, ask for arguments, pick up and move into a block, delete', async ({
    page,
  }) => {
    await page.goto('/?editor=tiles');
    await page.locator(tile('do in order')).focus();
    await page.keyboard.press('Enter');
    expect(await text(page)).toBe('do in order:\n  (empty)');

    await page.locator(tile('move')).focus();
    await page.keyboard.press('Enter'); // goes after the tile that had focus
    await answerCascade(page, [0, 2, 3]); // the cat, left, 2 m
    expect(await text(page)).toBe('do in order:\n  (empty)\ncat.move(left, 2)');

    await expect(page.locator('.tile.move')).toBeFocused();
    await page.keyboard.press('Space'); // pick up
    await page.keyboard.press('ArrowUp'); // to the gap inside do in order
    await page.keyboard.press('Space'); // put down
    expect(await text(page)).toBe('do in order:\n  cat.move(left, 2)');

    await page.locator('.tile.move').focus();
    await page.keyboard.press('Delete');
    expect(await text(page)).toBe('do in order:\n  (empty)');
  });
});

test.describe('option C with touch', () => {
  test.use({ hasTouch: true });
  test('touch: drag a tile into the program', async ({ page }) => {
    await page.goto('/?editor=tiles');
    const head = await center(page, '.program-head');
    const from = await center(page, tile('do together'));
    await measured(page, 'tiles.touchDrag', () =>
      touchDrag(page, from, { x: head.x, y: head.y + 22 }),
    );
    expect(await text(page)).toBe('do together:\n  (empty)');
  });
});

const blockly = <T>(page: Page, fn: string) =>
  page.evaluate(
    (f) =>
      (window as unknown as { spikeBlockly: Record<string, () => unknown> }).spikeBlockly[f]!(),
    fn,
  ) as Promise<T>;
const flyoutBlock = (page: Page, label: string) =>
  page.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: label }).first();

async function grabPoint(page: Page, label: string): Promise<Point> {
  const box = (await flyoutBlock(page, label).boundingBox())!;
  return { x: box.x + 6, y: box.y + 6 };
}
const offset = (p: Point) => ({ x: p.x + 6, y: p.y + 6 });

test.describe('option B: Blockly', () => {
  test('mouse: typed move under the program, arguments on drop, wrong type and loose blocks refused', async ({
    page,
  }) => {
    await page.goto('/?editor=blockly');
    await expect(page.locator('.blocklyFlyout')).toBeVisible();
    const target = offset(await blockly<Point>(page, 'mainDo'));
    await measured(page, 'blockly.mouseDrag', async () =>
      mouseDrag(page, await grabPoint(page, 'move'), target),
    );
    await answerCascade(page, [0, 0, 0]); // the cat, forward, 0.25 m
    expect(await text(page)).toBe('cat.move(forward, 0.25)');
    const count = await blockly<number>(page, 'blockCount');

    // A number where the object goes: Blockly's type check won't connect it, so it's refused.
    const slot = offset((await blockly<Point>(page, 'firstMoveTarget'))!);
    await mouseDrag(page, await grabPoint(page, '1'), slot);
    expect(await text(page)).toBe('cat.move(forward, 0.25)');
    expect(await blockly<number>(page, 'blockCount')).toBe(count);

    // A block dropped on empty workspace is refused too.
    await mouseDrag(page, await grabPoint(page, 'do together'), { x: 700, y: 450 });
    expect(await blockly<number>(page, 'blockCount')).toBe(count);
  });

  test('keyboard: focus can enter the workspace and arrows move it', async ({ page }) => {
    await page.goto('/?editor=blockly');
    await expect(page.locator('.blocklyFlyout')).toBeVisible();
    const seen: (string | null)[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      seen.push(await blockly<string | null>(page, 'focused'));
    }
    for (const key of ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowUp']) {
      await page.keyboard.press(key);
      seen.push(await blockly<string | null>(page, 'focused'));
    }
    results['blockly.keyboardFocus'] = seen;
    const insideBlockly = await page.evaluate(
      () => !!document.activeElement?.closest('.blockly-host'),
    );
    expect(insideBlockly).toBe(true);
  });
});

test.describe('option B with touch', () => {
  test.use({ hasTouch: true });
  test('touch: drag a block under the program', async ({ page }) => {
    await page.goto('/?editor=blockly');
    await expect(page.locator('.blocklyFlyout')).toBeVisible();
    const target = offset(await blockly<Point>(page, 'mainDo'));
    const from = await grabPoint(page, 'move');
    await measured(page, 'blockly.touchDrag', () => touchDrag(page, from, target));
    await answerCascade(page, [2, 1, 4]); // the camera, backward, 5 m
    expect(await text(page)).toBe('camera.move(backward, 5)');
  });
});

test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/spike-1.5-results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
});
