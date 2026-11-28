import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { exampleProduction } from '@storystage/production';
import { LOADING } from './parity/film.ts';

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
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible(LOADING);
  await page
    .getByRole('radiogroup', { name: 'Code or Sound' })
    .getByText('Sound', { exact: true })
    .click();
  // Sound is loaded on demand, the first time it's shown.
  const sound = page.getByRole('region', { name: 'Sound' });
  await expect(sound).toBeVisible(LOADING);
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

test('the tracks’ volumes change by a drag and by keys, each one undo step', async ({ page }) => {
  // 07-ux 7.7: Speech, Music and Sound FX for the whole film, 100%, 70% and 90% until changed.
  const sound = await openSound(page);
  const volumes = sound.getByRole('region', { name: 'Volumes' });
  const music = volumes.getByRole('slider', { name: 'Music' });
  await expect(music).toHaveAttribute('aria-valuetext', '70%');
  const { violations } = await new AxeBuilder({ page }).include('.sd-volumes').analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // A drag to about 40% along is one step, written as it's let go.
  await volumes.scrollIntoViewIfNeeded();
  const track = (await volumes.locator('[data-track="music"] .sd-volume-track').boundingBox())!;
  const thumb = (await volumes.locator('[data-track="music"] .sd-volume-thumb').boundingBox())!;
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.4, track.y + track.height / 2, { steps: 10 });
  await page.mouse.up();
  const dragged = Number(await music.inputValue());
  expect(dragged).toBeGreaterThan(30);
  expect(dragged).toBeLessThan(50);
  await expect(undoButton(page)).toHaveText(`Undo: Set Music to ${dragged}%`);
  await expect(volumes.getByRole('textbox', { name: 'Music as a percentage' })).toHaveValue(
    `${dragged}%`,
  );

  // Three presses on Speech are one more step, named where they stopped.
  await volumes.getByRole('slider', { name: 'Speech' }).focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  await expect(undoButton(page)).toHaveText('Undo: Set Speech to 97%');
  await undoButton(page).click();
  await expect(volumes.getByRole('slider', { name: 'Speech' })).toHaveAttribute(
    'aria-valuetext',
    '100%',
  );
  await expect(undoButton(page)).toHaveText(`Undo: Set Music to ${dragged}%`);
  await undoButton(page).click();
  await expect(music).toHaveAttribute('aria-valuetext', '70%');
});

test('music is added at the playhead, drawn on the timeline and changed by its controls', async ({
  page,
}) => {
  // 07-ux 7.7: Add music…, the music bar, Zoom, the cue's controls and its keys, each one step.
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

  const timeline = sound.getByRole('region', { name: 'Scene 1’s music' });
  await expect(
    timeline.getByText(
      /^About \d+ seconds?, from your storyboard\. Rehearse to see the real timing\.$/,
    ),
  ).toBeVisible();
  await timeline.getByRole('textbox', { name: 'Time' }).fill('1');
  await timeline.getByRole('textbox', { name: 'Time' }).press('Enter');
  await timeline.getByRole('button', { name: 'Add music…' }).click();
  const add = page.getByRole('dialog', { name: 'Add music' });
  await expect(add.getByText('It starts at 1 second, where the playhead is.')).toBeVisible();
  await add.getByRole('button', { name: 'Add rain' }).click();
  await expect(add).toBeHidden();
  await expect(undoButton(page)).toHaveText('Undo: Add music rain');

  const track = timeline.getByRole('list', { name: 'Music', exact: true });
  const bar = track.getByRole('button', { name: /^rain, 1 to 3 seconds/ });
  await expect(bar).toBeVisible();
  const before = (await bar.boundingBox())!;
  await timeline.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeLessThan(before.width);
  await timeline.getByRole('button', { name: 'Zoom in' }).click();
  await timeline.getByRole('button', { name: 'Fit' }).click();
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(before.width, 0);

  // Chosen, its controls: a fade and a loop, each a step, drawn on the bar.
  await bar.click();
  const controls = sound.getByRole('region', { name: 'rain' });
  await controls.getByRole('textbox', { name: 'Fade in' }).fill('0.5');
  await controls.getByRole('textbox', { name: 'Fade in' }).press('Enter');
  await expect(undoButton(page)).toHaveText('Undo: Fade rain in over 0.5 seconds');
  await controls.getByText('Loop', { exact: true }).click();
  await expect(undoButton(page)).toHaveText('Undo: Loop rain');
  await expect(track.getByRole('button', { name: /loops, fades in$/ })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('.sd-music').analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Keys on the bar move it, as one step.
  await track.getByRole('button').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(undoButton(page)).toHaveText('Undo: Move rain to 1.3 seconds');
  await expect(
    sound.getByRole('list', { name: 'Music in this scene' }).getByRole('button'),
  ).toHaveText('rain, from 1.3 seconds');
  await undoButton(page).click();
  await expect(undoButton(page)).toHaveText('Undo: Loop rain');
});

test('a cue is dragged by its bar, its handles and its corners, and Esc puts one back', async ({
  page,
}) => {
  // 07-ux 7.7: a drag is drawn as it goes, one step when let go; Esc during one puts it back.
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
  const timeline = sound.getByRole('region', { name: 'Scene 1’s music' });
  await timeline.getByRole('textbox', { name: 'Time' }).fill('1');
  await timeline.getByRole('textbox', { name: 'Time' }).press('Enter');
  await timeline.getByRole('button', { name: 'Add music…' }).click();
  await page
    .getByRole('dialog', { name: 'Add music' })
    .getByRole('button', { name: 'Add rain' })
    .click();

  const track = timeline.getByRole('list', { name: 'Music', exact: true });
  const bar = track.getByRole('button', { name: /^rain, / });
  const box = (await bar.boundingBox())!;
  const perSecond = box.width / 2;
  /** A mouse drag of `seconds` from the middle of `target`, let go unless Esc comes first. */
  const drag = async (target: Locator, seconds: number, escape = false) => {
    await target.scrollIntoViewIfNeeded();
    const b = (await target.boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) await page.mouse.move(x + (seconds * perSecond * i) / 5, y);
    if (escape) await page.keyboard.press('Escape');
    await page.mouse.up();
  };

  await drag(bar, 1);
  await expect(undoButton(page)).toHaveText('Undo: Move rain to 2 seconds');
  await expect(bar).toHaveAccessibleName(/^rain, 2 to 4 seconds/);
  await expect(bar).toHaveAttribute('aria-pressed', 'true');

  // The chosen bar's handles: Play to, back half a second.
  const to = track.getByRole('slider', { name: 'Play to' });
  await expect(to).toHaveAttribute('aria-valuetext', '2 seconds');
  expect((await to.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await drag(to, -0.5);
  await expect(undoButton(page)).toHaveText('Undo: Trim rain in scene 1');
  await expect(to).toHaveAttribute('aria-valuetext', '1.5 seconds');
  const controls = sound.getByRole('region', { name: 'rain' });
  await expect(controls.getByRole('textbox', { name: 'Play to' })).toHaveValue('1.5 seconds');

  // A fade's corner, and keys on it.
  await drag(track.getByRole('slider', { name: 'Fade in' }), 0.5);
  await expect(undoButton(page)).toHaveText('Undo: Fade rain in over 0.5 seconds');
  await track.getByRole('slider', { name: 'Fade in' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(undoButton(page)).toHaveText('Undo: Fade rain in over 0.6 seconds');
  const { violations } = await new AxeBuilder({ page }).include('.sd-music').analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Esc during a drag puts it back.
  await drag(bar, 1, true);
  await expect(bar).toHaveAccessibleName(/^rain, 2 to 3\.5 seconds/);
  await expect(undoButton(page)).toHaveText('Undo: Fade rain in over 0.6 seconds');
});

test('a whole Rehearse run gives the timeline its length and its Speech and Sound FX', async ({
  page,
}) => {
  // 07-ux 7.7: the scene's length comes from its last whole run, kept while the studio is open.
  const sound = await openSound(page);
  const timeline = sound.getByRole('region', { name: 'Scene 1’s music' });
  await expect(timeline.getByText('Rehearse to see these.')).toHaveCount(2);
  const view = page.getByRole('region', { name: 'Scene view' });
  await view.getByRole('button', { name: 'Rehearse', exact: true }).click();
  // The example scene is short: it ends, and its last picture stays until Stop.
  await expect(view.getByRole('button', { name: 'Restart' })).toBeVisible({ timeout: 30_000 });
  await expect(
    timeline.getByText(/^\d+(\.\d)? seconds?, from your last Rehearse\.$/),
  ).toBeVisible();
  await expect(timeline.getByText('Rehearse to see these.')).toHaveCount(0);
  // Stop puts the set-up back, and the run's timing stays.
  await view.getByRole('button', { name: 'Stop' }).click();
  await expect(
    timeline.getByText(/^\d+(\.\d)? seconds?, from your last Rehearse\.$/),
  ).toBeVisible();
});

test('Rehearse plays the scene’s music from its file, through its gain and the Music track', async ({
  page,
}) => {
  // Decision 0076 (S3's LiveSounds): each sound the page starts, by its length, how many gains it
  // goes through to the speakers (a cue's own, the music's lowering under speech, then its
  // track's), and whether its audio is running.
  await page.addInitScript(() => {
    type Heard = { seconds: number; hops: number; context: BaseAudioContext };
    const started: Heard[] = [];
    (window as unknown as { started: Heard[] }).started = started;
    const next = new WeakMap<AudioNode, AudioNode>();
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
      if (args[0] instanceof AudioNode) next.set(this, args[0]);
      return (connect as (...a: unknown[]) => AudioNode).apply(this, args);
    } as typeof AudioNode.prototype.connect;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args) {
      let hops = 0;
      for (let n = next.get(this); n && n !== this.context.destination; n = next.get(n)) hops++;
      started.push({ seconds: this.buffer?.duration ?? 0, hops, context: this.context });
      return start.apply(this, args);
    };
  });
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
  const timeline = sound.getByRole('region', { name: 'Scene 1’s music' });
  await timeline.getByRole('button', { name: 'Add music…' }).click();
  await page
    .getByRole('dialog', { name: 'Add music' })
    .getByRole('button', { name: 'Add rain' })
    .click();
  await expect(undoButton(page)).toHaveText('Undo: Add music rain');

  const view = page.getByRole('region', { name: 'Scene view' });
  await view.getByRole('button', { name: 'Rehearse', exact: true }).click();
  // The cue's 2 s tone starts, through its own gain, the lowering under speech and the Music
  // track's, on running audio.
  const rain = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          started: { seconds: number; hops: number; context: BaseAudioContext }[];
        }
      ).started
        .filter((s) => Math.abs(s.seconds - 2) < 0.01)
        .map((s) => ({ hops: s.hops, state: s.context.state })),
    );
  await expect.poll(rain, { timeout: 15_000 }).toContainEqual({ hops: 3, state: 'running' });
  await view.getByRole('button', { name: 'Stop' }).click();
});
