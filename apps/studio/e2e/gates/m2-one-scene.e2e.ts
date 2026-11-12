import { expect, test, type Locator, type Page } from '@playwright/test';
import { exampleProduction } from '@storystage/production';

// The M2 gate, "One scene, coded" (workplan section 3; WP18.2): in the browser, add models to a
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
}

// Adding models on the Production stage waits on the stage's editing contract (S3) and the scene
// view's Cast (S5; 07-ux section 7.2). Until then the example production's cast stands in.
test.fixme('M2: a model is added to the scene from Cast, by pointer and by keyboard', async () => {
  // M2-one-scene.md section 1, steps 2 and 3: drag a character from Cast onto the stage; then
  // focus one in Cast and press Enter. Each lands on the ground, is one undo step named
  // "Add …", and is named under "In this shot:".
});

test('M2: a scene is coded with a block from the palette, and Rehearse runs it', async ({
  page,
}) => {
  test.setTimeout(90_000);
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
});
