import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { exampleProduction } from '@storystage/production';

// The Sound view's first part in a browser (07-ux 7.7; workplan 7.17): Code | Sound, a real WAV
// read and decoded by the browser, the trim dialog by keys and by pointer, Add sound as one undo
// step, and the Code editor still drawn when the learner comes back to it.

/** A WAV of `seconds` of a quiet tone, mono 16-bit at 8 kHz. */
function toneWav(seconds: number): Buffer {
  const rate = 8000;
  const samples = Math.round(rate * seconds);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write('WAVEfmt ', 8, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    // Louder towards the end, so the waveform has a shape.
    const level = (i / samples) * 0.8;
    wav.writeInt16LE(
      Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * level * 32767),
      44 + i * 2,
    );
  }
  return wav;
}

const example = exampleProduction();
const main = example.program.types
  .flatMap((t) => t.methods)
  .find((m) => m.id === example.scenes[0]!.method)!;

const undoButton = (page: Page) => page.getByRole('button', { name: /^Undo/ });
const redoButton = (page: Page) => page.getByRole('button', { name: /^Redo/ });

async function openSound(page: Page) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Code or Sound' })
    .getByText('Sound', { exact: true })
    .click();
  const sound = page.getByRole('region', { name: 'Sound' });
  await expect(sound).toBeVisible();
  return sound;
}

test('a picked sound is trimmed, added as one step, and the code is kept behind Sound', async ({
  page,
}) => {
  const sound = await openSound(page);
  await expect(sound.getByText('No sounds in this film yet.')).toBeVisible();
  await sound.locator('input[type="file"]').setInputFiles({
    name: 'rain.wav',
    mimeType: 'audio/wav',
    buffer: toneWav(2),
  });

  const dialog = page.getByRole('dialog', { name: 'Trim your sound' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('rain');
  // The browser decoded it: its length, and a waveform louder at the end than the start.
  const end = dialog.getByRole('slider', { name: 'End' });
  await expect(end).toHaveAttribute('aria-valuetext', 'End, 2 seconds');
  const heights = await dialog
    .locator('.sd-bar')
    .evaluateAll((bars) => bars.map((b) => Number(b.getAttribute('height'))));
  expect(heights).toHaveLength(240);
  expect(heights.at(-1)!).toBeGreaterThan(heights[10]! * 4);
  const { violations } = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Start by keys, End by dragging its handle three quarters of the way along.
  const start = dialog.getByRole('slider', { name: 'Start' });
  await start.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(start).toHaveAttribute('aria-valuetext', 'Start, 0.5 seconds');
  const wave = (await dialog.locator('.sd-wave-box').boundingBox())!;
  const handle = (await end.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(wave.x + wave.width * 0.75, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(end).toHaveAttribute('aria-valuenow', '1.5');
  await expect(dialog.getByText('1 second kept')).toBeVisible();

  // It plays only when asked, and stops by itself at the end of the part.
  await dialog.getByRole('button', { name: 'Play this part' }).click();
  await expect(dialog.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Play this part' })).toBeVisible({
    timeout: 5000,
  });

  await dialog.getByRole('button', { name: 'Add sound' }).click();
  await expect(dialog).toBeHidden();
  const list = sound.getByRole('list', { name: 'Sounds in this film' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByRole('listitem')).toContainText('rain');
  await expect(list.getByRole('listitem')).toContainText('1 second');
  await expect(undoButton(page)).toHaveText('Undo: Add sound rain');
  const axe = await new AxeBuilder({ page }).include('.sd-view').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await undoButton(page).click();
  await expect(sound.getByText('No sounds in this film yet.')).toBeVisible();
  await redoButton(page).click();
  await expect(list.getByRole('listitem')).toContainText('rain');
  await expect(list.getByRole('button', { name: 'Play rain' })).toBeVisible();

  // Back to Code: the blocks are where they were, drawn at their size.
  await page
    .getByRole('radiogroup', { name: 'Code or Sound' })
    .getByText('Code', { exact: true })
    .click();
  await expect(sound).toBeHidden();
  const workspace = page.locator('.pr-workspace');
  await expect(workspace).toBeVisible();
  const box = (await workspace.locator('svg.blocklySvg').first().boundingBox())!;
  expect(box.width).toBeGreaterThan(300);
  expect(box.height).toBeGreaterThan(150);
  await expect(
    page.locator('.pr-workspace .blocklyBlock:not(.blocklyFlyout *)').first(),
  ).toBeVisible();
});

test('a file that is no sound is refused beside the button', async ({ page }) => {
  const sound = await openSound(page);
  await sound.locator('input[type="file"]').setInputFiles({
    name: 'notes.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('These are only words.'),
  });
  await expect(sound.getByText("That file isn't an MP3, WAV or M4A sound.")).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('a block plays a sound chosen by its name, which the Sound view then keeps', async ({
  page,
}) => {
  // Workplan 7.17, spec 14 section 3a: the film's sounds in the shared cascade and on the block.
  const sound = await openSound(page);
  await sound.locator('input[type="file"]').setInputFiles({
    name: 'rain.wav',
    mimeType: 'audio/wav',
    buffer: toneWav(2),
  });
  await page
    .getByRole('dialog', { name: 'Trim your sound' })
    .getByRole('button', { name: 'Add sound' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Code or Sound' })
    .getByText('Code', { exact: true })
    .click();
  await expect(sound).toBeHidden();
  await page.locator('.pr-workspace').scrollIntoViewIfNeeded();

  // Blocks for the penguin, whose Sound blocks include "play".
  await page.getByRole('button', { name: /Blocks for/ }).click();
  await page.locator('.sb-menu-item', { hasText: 'penguin' }).click();
  const play = page
    .locator('.blocklyFlyout')
    .getByRole('option', { name: /^this, penguin, play, / });
  await expect(play).toBeAttached();
  // The palette scrolls inside Blockly: wheel over it until "play" is in the window.
  const flyout = (await page.locator('.blocklyFlyout').first().boundingBox())!;
  await page.mouse.move(flyout.x + flyout.width / 2, flyout.y + 100);
  for (let i = 0; i < 40; i++) {
    const at = (await play.boundingBox())!;
    if (at.y > flyout.y + 40 && at.y + 40 < page.viewportSize()!.height) break;
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(50);
  }
  // Below the scene script's last statement, as production.e2e drops one.
  const lastId = main.body.at(-1)!.id;
  const last = (await page
    .locator(`.blocklyDraggable[data-id="${lastId}"]`)
    .first()
    .boundingBox())!;
  const from = (await play.boundingBox())!;
  expect(from.y + 8, 'the play block is in the window').toBeLessThan(page.viewportSize()!.height);
  expect(last.y + last.height + 6, 'the drop is in the window').toBeLessThan(
    page.viewportSize()!.height,
  );
  await page.mouse.move(from.x + 8, from.y + 8);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 40, { steps: 5 });
  await page.mouse.move(last.x + 8, last.y + last.height + 6, { steps: 10 });
  await page.mouse.up();

  // The cascade offers the film's sound by its name; the block shows the name, not its id.
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'rain' }).click();
  await expect(undoButton(page)).toHaveText(/^Undo: .*play rain/);
  const workspace = page.locator('.pr-workspace');
  await expect(workspace).toContainText('rain');
  await expect(workspace).not.toContainText('sn1');

  // The Sound view won't remove a sound the code plays.
  await page
    .getByRole('radiogroup', { name: 'Code or Sound' })
    .getByText('Sound', { exact: true })
    .click();
  await sound.getByRole('button', { name: 'Remove rain…' }).click();
  await expect(
    sound.getByText('rain is played in scene 1’s code. Change that block first.'),
  ).toBeVisible();
});
