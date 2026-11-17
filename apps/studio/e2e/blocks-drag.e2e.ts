import { expect, test, type Page } from '@playwright/test';
import { NODE_ID_PATTERN } from '@storystage/ast';
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

test('a drag begun straight after a drop from the palette never copies the block', async ({
  page,
}) => {
  // S6's find (parity task 4 by pointer): a learner drops a do together, then drags the say into
  // it at once. Read with the drop, before the drop was a step, the say was copied in with new ids.
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  await page.locator('.pr-workspace').scrollIntoViewIfNeeded();
  const sayBlock = page.locator(`.pr-workspace .blocklyBlock[data-id="${say}"]`);
  // The do together in the flyout, scrolled into view with the wheel as a learner would.
  const fromFlyout = page.locator('.blocklyFlyout [data-callee="control:doTogether"]').first();
  const flyoutInView = async () => {
    const flyout = (await page.locator('.pr-workspace .blocklyFlyout').first().boundingBox())!;
    const bottom = Math.min(flyout.y + flyout.height, 900);
    for (let i = 0; i < 40; i++) {
      const box = await fromFlyout.boundingBox();
      if (box && box.y >= flyout.y && box.y + 24 <= bottom) return;
      await page.mouse.move(flyout.x + flyout.width / 2, (flyout.y + bottom) / 2);
      await page.mouse.wheel(0, box && box.y < flyout.y ? -120 : 120);
      await page.waitForTimeout(50);
    }
  };
  const drag = async (
    from: { x: number; y: number },
    to: () => Promise<{ x: number; y: number }>,
  ) => {
    await page.mouse.move(from.x + 8, from.y + 8);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 40, { steps: 5 });
    const there = await to();
    await page.mouse.move(there.x, there.y, { steps: 10 });
    await page.mouse.up();
  };
  const row = (await sayBlock.boundingBox())!;
  const below = { x: row.x + 8, y: row.y + row.height + 6 };
  const together = page.locator(`.pr-workspace .blocklyBlock.ss_doTogether${inWorkspace}`);
  /** The do together's inside, as the test above finds it, before the say is lifted. */
  const inside = async () => {
    for (;;) {
      const into = await together.first().boundingBox();
      if (into) return { x: into.x + 30, y: into.y + 52 };
    }
  };
  const dropTogether = async () => {
    await flyoutInView();
    await drag((await fromFlyout.boundingBox())!, async () => below);
  };
  const programId = new RegExp(` ${NODE_ID_PATTERN.slice(1)}`);
  /** The outline once Blocks is still: the same twice running, with no palette ids left in it. */
  const still = async () => {
    let last = '';
    let now: string[] = [];
    await expect
      .poll(
        async () => {
          now = await outline(page);
          const same = JSON.stringify(now) === last;
          last = JSON.stringify(now);
          return same && now.every((l) => programId.test(l));
        },
        { intervals: [200] },
      )
      .toBe(true);
    return now.map((l) => l.replace(/ss_doTogether \S+/, 'ss_doTogether'));
  };
  const moved = [`ss_method ${main.id}`, '  ss_doTogether', `    ss_story_say ${say}`];
  const notMoved = [`ss_method ${main.id}`, `  ss_story_say ${say}`, '    ss_doTogether'];
  const neither = [`ss_method ${main.id}`, `  ss_story_say ${say}`];

  await dropTogether();
  // Straight after, quicker than a person (50 ms after letting go), before the drop may be a
  // step: the say into the do together's inside, as the test above drags it.
  await page.waitForTimeout(50);
  const quickly = await inside();
  await drag(row, async () => quickly);
  // Never a copy. The say went in; or its drag was missed; or, read with the drop, both went back.
  const quick = await still();
  expect([moved, notMoved, neither]).toContainEqual(quick);
  // At a person's pace, once Blocks is still, the say goes in as one step.
  if (JSON.stringify(quick) === JSON.stringify(neither)) {
    const now = (await sayBlock.boundingBox())!;
    await flyoutInView();
    await drag((await fromFlyout.boundingBox())!, async () => ({
      x: now.x + 8,
      y: now.y + row.height + 6,
    }));
    expect(await still()).toEqual(notMoved);
  }
  if (JSON.stringify(quick) !== JSON.stringify(moved)) {
    // Where the say and the do together are now: drawn again, the workspace may have moved.
    const there = await inside();
    await drag((await sayBlock.boundingBox())!, async () => there);
    expect(await still()).toEqual(moved);
  }
  await expect(undoButton(page)).toHaveText(/^Undo: Move penguin say /);
});
