/**
 * WP5a end to end, on Chromium with software rendering: the offscreen render is deterministic
 * (WP5's done-when), the picture is the right way round, and live input works. Frame rate on the
 * reference devices is an owner check (`tests/scenes/README.md`).
 */
import { expect, test, type Page } from '@playwright/test';

const URL = 'http://localhost:4181/';

async function open(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.goto(URL);
  await expect(page).toHaveTitle('Stage harness ready');
  return problems;
}

/** Calls a function on `window.stageHarness`. */
function call<T>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([name, args]) => {
      type Calls = Record<string, (...args: unknown[]) => unknown>;
      const { stageHarness } = window as unknown as { stageHarness: Calls };
      return stageHarness[name as string]!(...(args as unknown[]));
    },
    [name, args] as const,
  ) as Promise<T>;
}

interface Determinism {
  frames: number;
  distinctFrames: number;
  pixelsIdentical: boolean;
  firstDifferentFrame: number;
  statesIdentical: boolean;
  rewindIdentical: boolean;
}

for (const scene of ['grass-cast', 'snow-fog', 'room-camera', 'fade-out', 'shots']) {
  test(`renders ${scene} the same twice, frame for frame`, async ({ page }) => {
    test.setTimeout(120_000);
    const problems = await open(page);
    const r = await call<Determinism>(page, 'determinism', scene);
    console.log(scene, JSON.stringify(r));
    expect(r.pixelsIdentical).toBe(true);
    expect(r.statesIdentical).toBe(true);
    expect(r.rewindIdentical).toBe(true);
    expect(r.frames).toBe(20);
    // The scene really moves: a test of 20 identical frames would prove nothing.
    expect(r.distinctFrames).toBeGreaterThan(10);
    expect(problems).toEqual([]);
  });
}

test('puts +X on the left of the picture, the right way up', async ({ page }) => {
  await open(page);
  const r = await call<{ count: number; meanX: number; meanY: number; width: number }>(
    page,
    'direction',
  );
  expect(r.count).toBeGreaterThan(100);
  expect(r.meanX).toBeLessThan(r.width / 2);
  // A block standing on nothing, with the camera level with its middle.
  expect(r.meanY).toBeGreaterThan(100);
});

test("shows every template's sky", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  const skies = await call<{ id: string; got: number[]; want: number[] }[]>(page, 'skies');
  expect(skies).toHaveLength(19);
  for (const { id, got, want } of skies)
    got.forEach((value, i) => expect(Math.abs(value - want[i]!), id).toBeLessThanOrEqual(2));
});

// Each of these was wrong once while every other test passed: they look at what was drawn.
test('draws a glTF model that faces the camera', async ({ page }) => {
  await open(page);
  // The robot is 16 m from the camera, so 44 pixels to the metre: 2 m left, and 1 m tall here.
  const [r, g, b] = await call<number[]>(page, 'sample', 'grass-cast', 0, 232, 224);
  expect(r).toBeLessThan(110);
  expect(b).toBeGreaterThan(r!);
  expect(b).toBeGreaterThanOrEqual(g!);
});

test("gives a room a floor, not the walls' colour", async ({ page }) => {
  await open(page);
  const [r, g] = await call<number[]>(page, 'sample', 'room-camera', 0, 600, 340);
  expect(g).toBeLessThan(r! * 0.8);
});

test('shows a ground in the colour its table says', async ({ page }) => {
  await open(page);
  const got = await call<number[]>(page, 'sample', 'grass', 0, 320, 340);
  [0x5f, 0x9e, 0x3a].forEach((want, i) => expect(Math.abs(got[i]! - want)).toBeLessThan(8));
});

test('labels a stand-in, so a learner can tell what it stands for', async ({ page }) => {
  await open(page);
  expect(await call<number>(page, 'darkPixels', 'room-camera', 3)).toBeGreaterThan(100);
});

test('fades the whole picture to black, the sky included', async ({ page }) => {
  await open(page);
  const sky = (t: number) => call<number[]>(page, 'sample', 'fade-out', t, 320, 20);
  const ground = (t: number) => call<number[]>(page, 'sample', 'fade-out', t, 320, 340);
  expect(Math.max(...(await sky(0)))).toBeGreaterThan(150);
  const half = Math.max(...(await sky(2)));
  expect(half).toBeGreaterThan(20);
  expect(half).toBeLessThan(150);
  expect(Math.max(...(await sky(3)))).toBeLessThanOrEqual(2);
  expect(Math.max(...(await ground(3)))).toBeLessThanOrEqual(2);
});

test('fills more of the picture with its subject, the closer the shot', async ({ page }) => {
  await open(page);
  const share = (t: number) => call<number>(page, 'subjectShare', 'shots', t);
  const [wide, medium, closeUp] = [await share(0.9), await share(1.9), await share(2.9)];
  console.log(JSON.stringify({ wide, medium, closeUp }));
  expect(wide).toBeGreaterThan(0.02);
  expect(medium).toBeGreaterThan(wide * 2);
  expect(closeUp).toBeGreaterThan(medium);
});

test('measures what view and occlusion events would cost (decision 0051)', async ({ page }) => {
  await open(page);
  const r = await call<{ objects: number; pairs: number; view: number; occlusion: number }>(
    page,
    'eventCost',
    30,
  );
  // This run is only a check that it works: the numbers that count are the reference devices'.
  console.log(JSON.stringify(r));
  expect(r.pairs).toBe(435);
  expect(r.view).toBeGreaterThan(0);
  expect(r.occlusion).toBeGreaterThan(0);
});

test('takes clicks and keys on the live canvas, and lets Tab move on', async ({ page }) => {
  const problems = await open(page);
  await call(page, 'goLive');
  const live = <T>(name: string) =>
    page.evaluate(
      (name) =>
        (window as unknown as { stageLive: Record<string, () => unknown> }).stageLive[name]!(),
      name,
    ) as Promise<T>;
  await expect.poll(() => live<number>('frames')).toBeGreaterThan(3);
  const canvas = page.locator('#stage');
  await canvas.click({ position: { x: 320, y: 170 } });
  await canvas.click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('a');
  await page.keyboard.press('F1');
  await page.keyboard.press('Tab');
  await expect(page.locator('#after')).toBeFocused();
  const heard = await live<{ kind: string; object?: string; key?: string }[]>('heard');
  expect(heard.filter((e) => e.kind === 'click').map((e) => e.object)).toEqual(['cat', null]);
  // Tab is in the Story API's list too: a program can hear it, and focus still moves on.
  expect(heard.filter((e) => e.kind === 'key').map((e) => e.key)).toEqual(['left', 'a', 'tab']);
  expect(await live<number>('time')).toBeGreaterThan(0);
  await live('stop');
  expect(problems).toEqual([]);
});

test('imports Babylon.js by module, and loads the glTF loader only when it needs it', async ({
  page,
}) => {
  await open(page);
  const before = await call<{ name: string; bytes: number }[]>(page, 'scripts');
  console.log(JSON.stringify(before));
  const total = before.reduce((sum, s) => sum + s.bytes, 0);
  // The spike's import from the package root gave 6.8 MB (spike 1.4, rule 6).
  expect(total).toBeLessThan(3_500_000);
  await call(page, 'direction');
});

test('keeps pictures of the scenes for people to look at', async ({ page }, info) => {
  test.setTimeout(120_000);
  await open(page);
  for (const [scene, seconds] of [
    ['grass-cast', 2],
    ['snow-fog', 1],
    ['room-camera', 3],
  ] as const) {
    const png = await call<string>(page, 'picture', scene, seconds);
    expect(png).toMatch(/^data:image\/png/);
    await info.attach(scene, {
      body: Buffer.from(png.split(',')[1]!, 'base64'),
      contentType: 'image/png',
    });
  }
});
