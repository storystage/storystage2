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
  // The label's letters. An export's frame is smoothed by averaging (renderFrame), so fewer of
  // their pixels are fully dark than when it wasn't: 92 here, against none without a label.
  expect(await call<number>(page, 'darkPixels', 'room-camera', 3)).toBeGreaterThan(60);
});

test('labels a stand-in in a picture too (5.7)', async ({ page }) => {
  await open(page);
  // A picture drawn on a stage that hasn't drawn a frame left the label where it was made.
  expect(await call<number>(page, 'darkPixels', 'room-camera', 3, true)).toBeGreaterThan(60);
});

interface Rows {
  mean: number[];
  range: number;
  missing: { kind: string; id?: string }[];
}

test('tiles a ground texture from Backstage, matching the flat colour (spec 17 §2)', async ({
  page,
}) => {
  await open(page);
  const r = await call<Record<'plain' | 'own' | 'check' | 'broken', Rows>>(page, 'groundTextures');
  console.log(JSON.stringify(r));
  // A texture of the ground's own colour looks as the flat ground does.
  r.own.mean.forEach((c, i) => expect(Math.abs(c - r.plain.mean[i]!)).toBeLessThan(6));
  // A check shows, tiled: dark and light near the camera, where the flat ground is even.
  expect(r.plain.range).toBeLessThan(20);
  expect(r.check.range).toBeGreaterThan(120);
  // No item is normal; an item that can't be read falls back to the colour, and is reported.
  expect(r.plain.missing).toEqual([]);
  expect(r.own.missing).toEqual([]);
  r.broken.mean.forEach((c, i) => expect(Math.abs(c - r.plain.mean[i]!)).toBeLessThan(3));
  expect(r.broken.missing).toEqual([{ kind: 'backdrop', id: 'storystage/Ground/grass' }]);
});

test('draws a picture sky around the camera, the right way round, and tints it (spec 17 §2)', async ({
  page,
}) => {
  await open(page);
  const r = await call<{
    middleAbove: number[];
    middleBelow: number[];
    left: number[];
    right: number[];
    tinted: number[];
    missing: unknown[];
    without: { colour: number[]; missing: unknown[] };
  }>(page, 'pictureSky');
  console.log(JSON.stringify(r));
  // The picture's middle faces +Z, where the camera looks: red, bright above and dim below.
  const [red, , blue] = r.middleAbove;
  expect(red).toBeGreaterThan(220);
  expect(blue).toBeLessThan(30);
  expect(r.middleBelow[0]).toBeGreaterThan(70);
  expect(r.middleBelow[0]).toBeLessThan(140);
  // +X is on the picture's left (blue there), -X on its right (green).
  expect(r.left[2]).toBeGreaterThan(200);
  expect(r.right[1]).toBeGreaterThan(200);
  // Half its own atmosphere colour halves it.
  expect(Math.abs(r.tinted[0]! - red! / 2)).toBeLessThan(12);
  expect(r.missing).toEqual([]);
  // With no item, its atmosphere colour, reported.
  expect(Math.abs(r.without.colour[0]! - 0xae)).toBeLessThan(4);
  expect(r.without.missing).toEqual([{ kind: 'backdrop', id: 'storystage/Sky/clearDay' }]);
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

interface Rendering {
  renderer: string;
  gpu: boolean;
  width: number;
  height: number;
  lit: number;
}

test('draws with WebGPU where the browser has it, and WebGL2 otherwise', async ({ page }) => {
  const problems = await open(page);
  const r = await call<Rendering>(page, 'rendering', 'auto', 'standard');
  console.log(JSON.stringify(r));
  // Which one this browser gives is its own business; what matters is a picture either way.
  expect(r.renderer).toBe(r.gpu ? r.renderer : 'webgl2');
  expect(['webgpu', 'webgl2']).toContain(r.renderer);
  expect(r.width).toBe(640);
  expect(r.lit).toBeGreaterThan(0.5);
  expect(problems).toEqual([]);
});

test('draws at two thirds of the size at low quality, for the reference devices', async ({
  page,
}) => {
  await open(page);
  const low = await call<Rendering>(page, 'rendering', 'webgl2', 'low');
  // Whole pixels, rounded down.
  expect(low.width).toBe(Math.floor(640 / 1.5));
  expect(low.height).toBe(Math.floor(360 / 1.5));
  expect(low.lit).toBeGreaterThan(0.5);
});

test('takes a picture of another moment without moving the scene (5.7)', async ({ page }) => {
  const problems = await open(page);
  const r = await call<{ time: number; differ: number; top: number[]; bottom: number[] }>(
    page,
    'pictureCheck',
  );
  console.log(JSON.stringify(r));
  expect(r.time).toBe(500_000);
  // The same moment drawn twice: only the smoothing at edges may differ.
  expect(r.differ).toBeLessThan(0.02);
  // The right way up: the grass template's sky above and its ground below.
  expect(r.top[2]).toBeGreaterThan(200);
  expect(r.bottom[1]).toBeGreaterThan(r.bottom[2]!);
  expect(problems).toEqual([]);
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

test('draws the scene view on the live canvas, and moves things with the mouse (07-ux 7.2)', async ({
  page,
}, info) => {
  const problems = await open(page);
  await call(page, 'sceneView');
  const view = <T>(name: string, ...args: unknown[]) =>
    page.evaluate(
      ([name, args]) => {
        type Calls = Record<string, (...args: unknown[]) => unknown>;
        const { sceneView } = window as unknown as { sceneView: Calls };
        return sceneView[name as string]!(...(args as unknown[]));
      },
      [name, args] as const,
    ) as Promise<T>;
  await expect.poll(() => view<number>('frames')).toBeGreaterThan(5);
  const canvas = page.locator('#stage');
  const box = (await canvas.boundingBox())!;
  const amberOnPage = async (name: string) => {
    const shot = await canvas.screenshot({ path: info.outputPath(name) });
    return page.evaluate(
      async (png) => {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(png)], { type: 'image/png' }),
        );
        const c = new OffscreenCanvas(bitmap.width, bitmap.height);
        const g = c.getContext('2d')!;
        g.drawImage(bitmap, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (d[i]! > 200 && d[i + 1]! > 150 && d[i + 1]! < 210 && d[i + 2]! < 110) n++;
        return n;
      },
      [...shot],
    );
  };
  // The outline, ring and knob are on the page, and never in a frame read back.
  expect(await amberOnPage('scene-view.png')).toBeGreaterThan(300);
  expect(await view<number>('amberInFrame')).toBe(0);

  // Drag the robot by its body, 100 pixels to the left: it goes to +X along the ground.
  const body = (await view<{ x: number; y: number }>('onView', 1, 0.6, 0))!;
  await page.mouse.move(box.x + body.x, box.y + body.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(box.x + body.x - i * 20, box.y + body.y);
  await page.mouse.up();
  const edits =
    await view<{ final: boolean; transform: { position: { x: number; y: number } } }[]>('edits');
  expect(edits.at(-1)!.final).toBe(true);
  expect(edits.filter((e) => e.final)).toHaveLength(1);
  const moved = await view<{ position: { x: number; y: number } }>('transform', 'robot');
  expect(moved.position.x).toBeGreaterThan(1.5);
  expect(moved.position.y).toBe(0);
  await amberOnPage('scene-view-moved.png');

  // A click on the stand-in is a tap with it, which the studio would choose.
  const stand = (await view<{ x: number; y: number }>('onView', -1.5, 0.25, 1))!;
  await page.mouse.click(box.x + stand.x, box.y + stand.y);
  const taps = await view<{ target: unknown }[]>('taps');
  expect(taps.at(-1)!.target).toEqual({ object: 'box' });

  // Look around: a drag turns the view, and the scene's camera stays where it was.
  await view('lookAround', true);
  const before = await view<unknown>('view');
  await page.mouse.move(box.x + 320, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 60, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, -200);
  expect(await view<unknown>('view')).not.toEqual(before);
  await amberOnPage('scene-view-look-around.png');
  await view('stop');
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
  const backdrops = await call<Record<string, string>>(page, 'backdropPictures');
  for (const [name, png] of Object.entries(backdrops))
    await info.attach(`textured ${name}`, {
      body: Buffer.from(png.split(',')[1]!, 'base64'),
      contentType: 'image/png',
    });
});

test('crossfades from one scene to the next (8.3)', async ({ page }) => {
  await open(page);
  const [before, start, middle, end] = await call<number[][]>(page, 'crossfadeSky');
  // At the start, the old sky; half way, half of each; at the end, the new sky alone.
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(start![i]! - before![i]!)).toBeLessThan(6);
    expect(Math.abs(middle![i]! - (before![i]! + end![i]!) / 2)).toBeLessThan(12);
  }
  expect(end![2]!).toBeLessThan(80);
  expect(before![2]!).toBeGreaterThan(200);
});

test('measures what characters and crossfades cost each frame (WP4c, 8.3)', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  type Times = { seek: { mean: number; p95: number }; render: { mean: number }; frame: number };
  const r = await call<{
    count: number;
    loadMs: number;
    planMs: number;
    standing: Times;
    walking: Times;
    crossfade: Times;
  }>(page, 'characterCost', 5, 1);
  // This run is only a check that it works: the numbers that count are the reference devices'.
  console.log(JSON.stringify(r));
  expect(r.count).toBe(5);
  for (const t of [r.standing, r.walking, r.crossfade]) {
    expect(t.seek.mean).toBeGreaterThan(0);
    expect(t.frame).toBeGreaterThan(0);
  }
  // Walking poses more than standing does.
  expect(r.walking.seek.mean).toBeGreaterThan(r.standing.seek.mean * 0.5);
});

test('reads back the same picture from WebGPU as from WebGL2, top row first, red first', async ({
  page,
}) => {
  await open(page);
  const r = await call<{
    renderer: string;
    frame: number;
    picture: number;
    top: { auto: number[]; webgl2: number[] };
    bottom: { auto: number[]; webgl2: number[] };
  }>(page, 'renderersAgree');
  console.log(JSON.stringify(r));
  // The two renderers smooth edges a little differently; a flipped or blue-first picture is far off.
  expect(r.frame).toBeLessThan(6);
  expect(r.picture).toBeLessThan(6);
});

test('a part-faded glTF model is blended with what is behind it', async ({ page }) => {
  const problems = await open(page);
  const got = await call<{ covered: number; alpha: number; off: number }>(page, 'fadedModel');
  expect(got.covered).toBeGreaterThan(500);
  // Unblended, the frame is the solid model with a see-through alpha (#117 to 22 Nov).
  expect(got.alpha).toBe(255);
  expect(got.off).toBeLessThan(6);
  expect(problems).toEqual([]);
});

test('a part-faded model fades as one shape: its farther parts stay hidden', async ({ page }) => {
  const problems = await open(page);
  // A red panel in front of a green one. Faded, only the red is blended with what's behind it:
  // the green showed through it before (S3, 23 Nov).
  const got = await call<{ covered: number; alpha: number; off: number }>(page, 'fadedModel', true);
  expect(got.covered).toBeGreaterThan(500);
  expect(got.off).toBeLessThan(6);
  expect(problems).toEqual([]);
});

test("a part-faded object's see-through surfaces still show what's behind them", async ({
  page,
}) => {
  const problems = await open(page);
  // Faded, a hair card's clear stripes hid the panel behind it, so the backdrop showed through
  // the object (S4's review of #667, MakeHuman's hair).
  const got = await call<{ covered: number; holes: number }>(page, 'fadedHair');
  expect(got.covered).toBeGreaterThan(500);
  expect(got.holes).toBe(0);
  expect(problems).toEqual([]);
});

test("a cut-out's first faded draws in the live loop are already blended", async ({ page }) => {
  const problems = await open(page);
  // Pixels apart from the settled draw, in each of the first four (S4's review of #649). Only a
  // GPU shows the fault: SwiftShader, as CI has, compiles before it draws.
  expect(await call<number[]>(page, 'firstCutOutFade')).toEqual([0, 0, 0, 0]);
  expect(problems).toEqual([]);
});
