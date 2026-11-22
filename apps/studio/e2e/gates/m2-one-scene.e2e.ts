import { expect, test, type Locator, type Page } from '@playwright/test';
import { exampleProduction } from '@storystage/production';
import { expectSameSceneState } from './scene-state.ts';

// The M2 gate, "One scene, coded" (workplan section 5; WP18.2): in the browser, add models to a
// scene, code it with blocks, Rehearse it, as one path. The manual script is
// docs/test/M2-one-scene.md; this is the part CI can check on every pull request. Each part's
// own tests are in production.e2e.ts; this one checks they join up.

const example = exampleProduction();
const main = example.program.types
  .flatMap((t) => t.methods)
  .find((m) => m.id === example.scenes[0]!.method)!;
const block = (page: Page, id: string) =>
  page.locator(`.blocklyDraggable[data-id="${id}"]`).first();

/** Drags a block by a point near its top left to (x, y) on the page. */
async function drag(page: Page, from: Locator, to: { x: number; y: number }) {
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 40, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

async function productionStage(page: Page) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  // The code sits below the scene view; a drag by the mouse can't start or end outside the window.
  await page.locator('.pr-workspace').scrollIntoViewIfNeeded();
}

/**
 * A small shipped Backstage, served where the browser version looks for it (`backstage/`): CI
 * has none fetched. Two characters; their model and thumbnail files aren't there, so the stage
 * draws them as outlines, which is all adding them needs.
 */
async function smallBackstage(page: Page) {
  const item = (name: string) => ({
    id: `gate/Biped/${name.toLowerCase()}`,
    section: 'cast',
    class: 'Biped',
    displayName: name,
    themes: [],
    files: {
      model: `models/${name.toLowerCase()}.glb`,
      thumbnail: `thumbnails/${name.toLowerCase()}.webp`,
    },
    joints: 'prop-only',
    defaultSize: { height: 1 },
    budget: { triangles: 12, textureMaxPx: 0 },
    licence: 'CC0-1.0',
    credit: `${name}, for the gate test`,
    source: { url: 'https://example.org/gate' },
    origin: 'shipped',
    sketches: [],
  });
  // Only the Backstage folder the browser version reads, not a dev server's `packages/backstage`.
  await page.route(
    (url) => url.pathname.startsWith('/backstage/'),
    (route) =>
      route.request().url().endsWith('/backstage/backstage.json')
        ? route.fulfill({ json: { manifestVersion: '2.4.0', items: [item('Owl'), item('Hare')] } })
        : route.fulfill({ status: 404 }),
  );
}

/** The studio's undo label, which the Storyboard's toolbar shows. */
async function undoLabel(page: Page) {
  await page.getByRole('tab', { name: /Storyboard/ }).click();
  const label = await page.getByRole('button', { name: /^Undo/ }).textContent();
  await page.getByRole('tab', { name: /Production stage/ }).click();
  return label;
}

const openCast = (page: Page) =>
  page.getByRole('navigation', { name: 'Backstage' }).getByRole('button', { name: 'Cast' }).click();

test('M2: models are added to the scene from Cast, by pointer and by keyboard', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await smallBackstage(page);
  await productionStage(page);
  const objects = page.getByRole('region', { name: 'Objects in this scene' });
  const named = (name: string) => objects.getByText(name, { exact: true });
  await expect(named('Owl')).toHaveCount(0);

  // By pointer: Cast, then Add on Owl.
  await openCast(page);
  await page.getByRole('button', { name: 'Add Owl to the scene' }).click();
  await expect(named('Owl').first()).toBeVisible();
  await expect.poll(() => undoLabel(page)).toBe('Undo: Add owl');

  // By keyboard: focus Hare in Cast and press Enter.
  await openCast(page);
  await page.getByRole('row', { name: /Hare/ }).focus();
  await page.keyboard.press('Enter');
  await expect(named('Hare').first()).toBeVisible();
  await expect.poll(() => undoLabel(page)).toBe('Undo: Add hare');

  // Each was one undo step.
  await page.getByRole('tab', { name: /Storyboard/ }).click();
  await page.getByRole('button', { name: /^Undo/ }).click();
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(named('Hare')).toHaveCount(0);
  await expect(named('Owl').first()).toBeVisible();
});

test('M2: a scene is coded with a block from the palette, and Rehearse runs it', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await productionStage(page);

  // Code it: a say for the penguin, from the palette, after the method's last block.
  await page.getByRole('button', { name: /Blocks for/ }).click();
  await page.locator('.sb-menu-item', { hasText: 'penguin' }).click();
  const say = page.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: /say/ }).first();
  await expect(say).toBeVisible();
  const last = (await block(page, main.body.at(-1)!.id).boundingBox())!;
  await drag(page, say, { x: last.x + 8, y: last.y + last.height + 6 });
  await page
    .getByRole('menu')
    .getByRole('menuitem', { name: /Other words/ })
    .click();
  const field = page.getByRole('textbox').last();
  await field.fill('The gate is open');
  await field.press('Enter');
  await expect(page.locator('.pr-workspace')).toContainText('The gate is open');
  // Rehearse it: the scene plays in the scene view, and the new block is outlined as it runs.
  const view = page.getByRole('region', { name: 'Scene view' });
  await expect(view.locator('canvas')).toBeVisible();
  const rehearse = view.getByRole('button', { name: 'Rehearse', exact: true });
  await expect(rehearse).toBeEnabled();
  // Where each block outlined while it runs is, however briefly: its own outline, which doesn't
  // cover the blocks after it, though Blockly draws each next block inside the one before. (Its
  // id can't be used: the studio draws the block again, under a new id, as Rehearse starts.)
  type Box = { left: number; top: number; right: number; bottom: number };
  await page.evaluate(() => {
    const ran: Box[] = [];
    (window as unknown as { ran: Box[] }).ran = ran;
    new MutationObserver((changes) => {
      for (const c of changes) {
        const el = c.target as Element;
        const outline = el.classList.contains('ss-highlight-rehearse')
          ? el.querySelector(':scope > .blocklyPath')
          : null;
        if (outline) {
          const { left, top, right, bottom } = outline.getBoundingClientRect();
          ran.push({ left, top, right, bottom });
        }
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await rehearse.click();
  // It runs to the end of the scene, so frame 1.1 is Rehearsed.
  const strip = page.getByRole('listbox', { name: 'Frames' });
  await expect(strip.getByRole('option').first()).toContainText('Rehearsed', { timeout: 30_000 });
  // The studio says so in its live region.
  await expect(page.getByText('The scene finished.')).toBeAttached({ timeout: 30_000 });
  // The new block was one of them: an outline drawn round its words.
  const ran = await page.evaluate(() => (window as unknown as { ran: Box[] }).ran);
  const words = (await page
    .locator('.pr-workspace .blocklyBlockCanvas text', { hasText: 'The gate is open' })
    .last()
    .boundingBox())!;
  const [x, y] = [words.x + words.width / 2, words.y + words.height / 2];
  expect(
    ran.some((b) => b.left <= x && x <= b.right && b.top <= y && y <= b.bottom),
    JSON.stringify({ words: [x, y], ran }),
  ).toBe(true);

  // Stop puts the scene back as it was set, and Rehearse is offered again.
  const stop = view.getByRole('button', { name: 'Stop' });
  if (await stop.isVisible()) await stop.click();
  await expect(rehearse).toBeVisible();
  await expect(page.locator('.ss-highlight-rehearse')).toHaveCount(0);
  // The block the learner added is still there, as coded.
  await expect(page.locator('.pr-workspace')).toContainText('The gate is open');
  // And the coded scene plays with the same scene state on every renderer (18.2).
  await expectSameSceneState(page);
});
