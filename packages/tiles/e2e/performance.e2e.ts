import { expect, test, type Page } from '@playwright/test';

// Spec 14, 3h (7.10): a method of 500 statements stays responsive. A keystroke or a drop draws
// within 100 ms. Each is timed by the browser's Event Timing, from the input to the next frame
// drawn after it, which is what the learner sees. The page is the production build: React's
// development build is several times slower, and isn't what learners get.
//
// TILES_CPU_SLOWDOWN=4 slows the CPU fourfold (Chromium only), as a stand-in for the reference
// Chromebook until the device run (7.10); then the timings are reported, not held to the limit.

const PAGE = 'http://localhost:4184/?statements=500';
const LIMIT = 100;
const SLOWDOWN = Number(process.env['TILES_CPU_SLOWDOWN'] ?? 1);

async function open(page: Page) {
  if (SLOWDOWN > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOWDOWN });
  }
  await page.goto(PAGE);
  await expect(page.getByRole('tree', { name: 'Scene1.myFirstMethod' })).toBeVisible();
  expect(await page.locator('[data-statement]').count()).toBe(500);
  await page.evaluate(() => {
    const w = window as unknown as { timings: { name: string; duration: number }[] };
    w.timings = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.timings.push({ name: e.name, duration: e.duration });
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
  });
}

/** The longest input-to-frame time for each kind of event since the last call. */
async function slowest(page: Page): Promise<Record<string, number>> {
  // Event Timing reports an event once its frame is drawn; a couple of frames later, it's in.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const w = window as unknown as { timings: { name: string; duration: number }[] };
    const out: Record<string, number> = {};
    for (const t of w.timings) out[t.name] = Math.max(out[t.name] ?? 0, t.duration);
    w.timings = [];
    return out;
  });
}

function report(what: string, times: Record<string, number>) {
  test.info().annotations.push({ type: what, description: JSON.stringify(times) });
  console.log(what, JSON.stringify(times));
  if (SLOWDOWN > 1) return;
  for (const [name, ms] of Object.entries(times))
    expect(ms, `${what}: ${name}`).toBeLessThan(LIMIT);
}

const first = (page: Page) =>
  page.getByRole('treeitem', { name: 'cat say Hello add detail', exact: true });

test('moving focus with the arrow keys', async ({ page }) => {
  await open(page);
  await first(page).focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  report('arrows', await slowest(page));
});

test('choosing a value from its menu', async ({ page }) => {
  await open(page);
  await page.locator('[data-key="movest"] .tl-pill', { hasText: 'forward' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'forward' })).toBeFocused();
  await slowest(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-key="movest"] .tl-pill', { hasText: 'backward' })).toBeVisible();
  report('value', await slowest(page));
});

test('moving a statement by keyboard', async ({ page }) => {
  await open(page);
  await first(page).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  report('keyboard move', await slowest(page));
});

test('dragging a statement and dropping it', async ({ page }) => {
  await open(page);
  const grip = page.locator('[data-key="saystm"] [data-grip]');
  const from = (await grip.boundingBox())!;
  const to = (await page.locator('[data-key="notest"]').boundingBox())!;
  await page.mouse.move(from.x + 4, from.y + 4);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 30, { steps: 4 });
  await page.mouse.move(to.x + 60, to.y + to.height - 4, { steps: 8 });
  await expect(page.locator('.tl-drop-line')).toBeVisible();
  await slowest(page);
  await page.mouse.up();
  report('drop', await slowest(page));
});

test('putting a new block in from the palette', async ({ page }) => {
  await open(page);
  await first(page).focus();
  await page.getByRole('button', { name: /Blocks for/ }).click();
  await page.getByRole('option', { name: 'cat', exact: true }).click();
  await slowest(page);
  await page.getByRole('option', { name: 'cat move ??? ???' }).press('Enter');
  await expect(page.getByRole('menuitemradio', { name: 'forward' })).toBeFocused();
  await page.keyboard.press('Enter');
  const one = page.getByRole('menuitemradio', { name: '1', exact: true });
  await expect(one).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-statement]')).toHaveCount(501);
  report('palette', await slowest(page));
});
