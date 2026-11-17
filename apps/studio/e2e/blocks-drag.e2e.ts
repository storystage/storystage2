import { expect, test, type Page } from '@playwright/test';
import { exampleProduction } from '@storystage/production';

// What a drag moves in the Blocks editor, in a browser (docs/spec/14-editors.md section 3i.6;
// the owner's choice, 17 Nov 2026): the one statement grabbed, as in Tiles and Alice, not every
// block under it as Blockly's own drag does. So a statement goes into a container below it.

const example = exampleProduction();
const main = example.program.types
  .flatMap((t) => t.methods)
  .find((m) => m.id === example.scenes[0]!.method)!;
const say = main.body[0]!.id;
const inWorkspace = ':not(.blocklyFlyout *)';
const undoButton = (page: Page) =>
  page.getByRole('toolbar', { name: 'Undo and redo' }).getByRole('button', { name: /^Undo/ });

/** The workspace's blocks as an outline: each block's id and type, with what Blockly nests in it. */
const outline = (page: Page) =>
  page.evaluate(() => {
    const walk = (el: Element, depth: number): string[] =>
      [...el.children]
        .filter((c) => c.classList.contains('blocklyBlock'))
        .flatMap((c) => [
          `${'  '.repeat(depth)}${[...c.classList].find((x) => x.startsWith('ss_'))} ${c.getAttribute('data-id')}`,
          ...walk(c, depth + 1),
        ]);
    const canvas = document.querySelector(
      '.pr-workspace .blocklyBlockCanvas:not(.blocklyFlyout *)',
    );
    return canvas ? walk(canvas, 0).filter((l) => !/ss_(this|text|fieldRef) /.test(l)) : [];
  });

test('a drag moves the one statement grabbed, into a do together below it', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  await page.locator('.pr-workspace').scrollIntoViewIfNeeded();
  // An empty do together after the say, by keyboard (Blockly's move from the palette).
  await page.getByRole('button', { name: 'New in scene 1' }).focus();
  await page.keyboard.press('Tab');
  await expect
    .poll(
      async () => {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(60);
        return page.evaluate(() =>
          document.activeElement?.closest('[data-callee]')?.getAttribute('data-callee'),
        );
      },
      { timeout: 60_000 },
    )
    .toBe('control:doTogether');
  for (const key of ['Enter', 'ArrowDown', 'ArrowDown', 'Enter']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  const together = page.locator(`.pr-workspace .blocklyBlock.ss_doTogether${inWorkspace}`);
  await expect(together).toHaveCount(1);
  const id = (await together.getAttribute('data-id'))!;
  // Blockly draws the do together inside the say's group: it's joined on below it.
  await expect
    .poll(() => outline(page))
    .toEqual([`ss_method ${main.id}`, `  ss_story_say ${say}`, `    ss_doTogether ${id}`]);
  // A plain drag of the say, by its corner, into the do together's inside.
  const from = (await page.locator(`.pr-workspace .blocklyBlock[data-id="${say}"]`).boundingBox())!;
  const into = (await together.boundingBox())!;
  await page.mouse.move(from.x + 8, from.y + 8);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 40, { steps: 5 });
  await page.mouse.move(into.x + 30, into.y + 52, { steps: 10 });
  await page.mouse.up();
  // The say alone moved: the do together stayed, closed up behind it, with the say inside.
  await expect
    .poll(() => outline(page))
    .toEqual([`ss_method ${main.id}`, `  ss_doTogether ${id}`, `    ss_story_say ${say}`]);
  await expect(undoButton(page)).toHaveText(/^Undo: Move penguin say /);
  await undoButton(page).click();
  await expect
    .poll(() => outline(page))
    .toEqual([`ss_method ${main.id}`, `  ss_story_say ${say}`, `    ss_doTogether ${id}`]);
});
