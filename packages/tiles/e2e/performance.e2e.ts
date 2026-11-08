import { expect, test, type Page } from '@playwright/test';

// Spec 14, 3h (7.10): a method of 500 statements stays responsive. A keystroke or a drop draws
// within 100 ms. Each input the learner makes (a key, a press or release, a click) is timed by
// the browser's Event Timing two ways: to the end of the editor's work on it, and to the next
// frame drawn after it, which is what the learner sees. The page is the production build:
// React's development build is several times slower, and isn't what learners get.
//
// On real hardware (here, and on the reference Chromebook) the time to the frame is held to the
// limit. CI's browser draws in software, on the CPU, so there the editor's work is held to it
// and the time to the frame is reported.
//
// TILES_CPU_SLOWDOWN=4 slows the CPU fourfold (Chromium only), as a stand-in for the Chromebook
// until the device run (7.10); then the timings are reported, not held to the limit.

const PAGE = 'http://localhost:4184/?statements=500';
const LIMIT = 100;
const SLOWDOWN = Number(process.env['TILES_CPU_SLOWDOWN'] ?? 1);
const SOFTWARE_DRAWING = !!process.env['CI'];
/** The learner's own inputs. Events such as `pointerover` only share their frame. */
const INPUTS = ['keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'];

interface Timing {
  readonly name: string;
  /** From the input to the next frame drawn. */
  readonly frame: number;
  /** From the input to the end of its handlers: the editor's work. */
  readonly work: number;
}

async function open(page: Page) {
  if (SLOWDOWN > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOWDOWN });
  }
  await page.goto(PAGE);
  await expect(page.getByRole('tree', { name: 'Scene1.myFirstMethod' })).toBeVisible();
  expect(await page.locator('[data-statement]').count()).toBe(500);
  await page.evaluate(() => {
    const w = window as unknown as { timings: Timing[] };
    w.timings = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceEventTiming[])
        w.timings.push({
          name: e.name,
          frame: e.duration,
          work: e.processingEnd - e.startTime,
        });
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
  });
}

type Slowest = Record<string, { frame: number; work: number }>;

/** The longest times for each kind of input since the last call. */
async function slowest(page: Page): Promise<Slowest> {
  // Event Timing reports an event once its frame is drawn; a couple of frames later, it's in.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForTimeout(100);
  const timings = await page.evaluate(() => {
    const w = window as unknown as { timings: Timing[] };
    const all = w.timings;
    w.timings = [];
    return all;
  });
  const out: Slowest = {};
  for (const t of timings) {
    if (!INPUTS.includes(t.name)) continue;
    const was = out[t.name] ?? { frame: 0, work: 0 };
    out[t.name] = {
      frame: Math.max(was.frame, Math.round(t.frame)),
      work: Math.max(was.work, Math.round(t.work)),
    };
  }
  return out;
}

function report(what: string, times: Slowest) {
  test.info().annotations.push({ type: what, description: JSON.stringify(times) });
  console.log(what, JSON.stringify(times));
  if (SLOWDOWN > 1) return;
  for (const [name, t] of Object.entries(times)) {
    const held = SOFTWARE_DRAWING ? t.work : t.frame;
    expect(held, `${what}: ${name}`).toBeLessThan(LIMIT);
  }
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
