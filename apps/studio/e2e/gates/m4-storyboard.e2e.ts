import { expect, test, type Page } from '@playwright/test';
import { expectSameSceneState } from './scene-state.ts';

// The M4 gate, "Storyboard" (workplan section 5; WP18.2): a production is planned in the
// Storyboard, frames link to code, and the cast is placed from frames, as one path. The manual
// script is docs/test/M4-storyboard.md; this is the part CI can check on every pull request.
// Each part's own tests are in storyboard.e2e.ts and production.e2e.ts; this one checks they join
// up: planning in the Storyboard is what opens the Code editor (the storyboard rule, 10.8).

const rule = (page: Page) => page.locator('.pr-checklist li');
/** Go to the Storyboard, from the closed Code editor. */
async function goToStoryboard(page: Page) {
  await page.getByRole('button', { name: 'Go to the Storyboard' }).click();
  await expect(page.getByRole('tab', { name: /Storyboard/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}
/** Chooses in a segmented control, by its label, as a person would: the label covers the radio. */
const choose = (page: Page, group: string, label: string) =>
  page
    .getByRole('radiogroup', { name: group, exact: true })
    .locator('label')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();

test('M4: a film planned in the Storyboard by keyboard opens its Code editor', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  // A new film in the device's own folder: nothing planned yet.
  await page.goto('/');
  const production = page.getByRole('tab', { name: /Production stage/ });
  const storyboard = page.getByRole('tab', { name: /Storyboard/ });

  // Nothing to code before a scene is planned, and the way back is offered.
  await production.click();
  await expect(page.getByText('Add a scene in the Storyboard to start coding it.')).toBeVisible();
  await goToStoryboard(page);

  // The header: a title, a logline and a synopsis, which scenes need first.
  await page.getByRole('textbox', { name: 'Title' }).fill('The Lost Key');
  const addScene = page.getByRole('button', { name: 'Add a scene' });
  await expect(addScene).toBeDisabled();
  await page.getByRole('textbox', { name: 'Logline' }).fill('A shy owl must find a lost key.');
  await page.getByRole('textbox', { name: 'Synopsis' }).fill('The owl finds the key, and home.');
  await choose(page, 'Arc', '5-part');
  await expect(page.getByRole('radio', { name: '5-part' })).toBeChecked();
  await addScene.click();

  // A scene with no heading and no frame: the Code editor stays closed, and says why.
  await production.click();
  await expect(page.getByRole('heading', { name: 'Storyboard scene 1 first' })).toBeVisible();
  await expect(rule(page).filter({ hasText: 'Logline and synopsis' })).toContainText('Done');
  await expect(rule(page).filter({ hasText: 'A heading for scene 1' })).toContainText('To do');
  await expect(rule(page).filter({ hasText: 'At least one frame' })).toContainText('To do');
  await goToStoryboard(page);

  // The scene card: heading, its part of the arc, and how it ends.
  await page.getByRole('textbox', { name: 'Heading' }).fill('Forest, night');
  await page.getByRole('radiogroup', { name: 'Part of the arc' }).locator('label').nth(1).click();
  await expect(
    page.getByRole('radiogroup', { name: 'Part of the arc' }).getByRole('radio').nth(1),
  ).toBeChecked();
  await choose(page, 'Ends with', 'Fade to black');
  await expect(page.getByRole('radio', { name: 'Fade to black' })).toBeChecked();

  // A frame: its shot, its caption, a backdrop sketch put on by keyboard, and a pinned line.
  await page.getByRole('button', { name: 'Add a frame' }).click();
  await choose(page, 'Shot', 'Wide');
  await expect(page.getByRole('radio', { name: 'Wide', exact: true })).toBeChecked();
  await page.getByRole('textbox', { name: 'Caption' }).fill('The owl lands by the gate.');
  await page.getByRole('row', { name: 'Add Trees to frame 1.1' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Sketches on frame 1.1' })).toContainText('Trees');
  const script = page.getByRole('complementary', { name: 'Script' });
  const who = script.getByRole('combobox', { name: 'Who says it' });
  await who.fill('Owl');
  await who.press('Tab');
  const newLine = script.getByRole('textbox', { name: 'New line' });
  await newLine.fill('Here is the key.');
  await newLine.press('Enter');
  await script.getByRole('button', { name: 'Pin line 1' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Pin to frame 1.1, this frame' }).press('Enter');
  await expect(page.getByRole('list', { name: 'Lines pinned to frame 1.1' })).toContainText(
    'Owl: Here is the key.',
  );

  // Planned: the Code editor opens on the scene's method, and the strip shows the frame planned.
  await production.click();
  await expect(page.getByRole('tablist', { name: 'Methods in scene 1' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('heading', { name: 'Storyboard scene 1 first' })).toHaveCount(0);
  await expect(
    page.getByRole('listbox', { name: 'Frames' }).getByRole('option', { name: /Frame 1\.1/ }),
  ).toContainText('Planned');

  // The plan survives the trip: back in the Storyboard, the frame is as it was left.
  await storyboard.click();
  await expect(page.getByRole('textbox', { name: 'Caption' })).toHaveValue(
    'The owl lands by the gate.',
  );
  // The planned film has the same scene state on every renderer (18.2).
  await expectSameSceneState(page);
});

test('M4: a frame linked to code is Coded, and its check leads between the tabs', async ({
  page,
}) => {
  test.setTimeout(90_000);
  // The example production's frames are linked to their blocks; the learner can't link them
  // yet (below).
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  const strip = page.getByRole('listbox', { name: 'Frames' });
  await expect(strip.getByRole('option', { name: /Frame 1\.1/ })).toContainText('Coded');
  // A planted difference: the demo now matches its frames (#415), so Pip is turned away first.
  const objects = page.getByRole('region', { name: 'Objects in this scene' });
  await objects.getByRole('option', { name: /penguin/ }).click();
  const turn = objects.getByRole('textbox', { name: 'Turn (turns)' });
  await turn.fill('0');
  await turn.press('Tab');
  // The frame's check compares its blocks with its storyboard, and an item leads to either.
  const card = page.getByRole('region', { name: /^Automatic check: frame 1\.1/ });
  await card.getByRole('button', { name: 'Check this frame' }).click();
  const flag = 'Penguin faces away; your sketch has it facing the camera';
  await expect(card.getByText(flag)).toBeVisible({ timeout: 30_000 });
  const toSketch = card.getByRole('button', { name: `Go to the sketch: ${flag}` });
  await expect(toSketch).toBeVisible();
  await toSketch.click();
  await expect(page.getByRole('tab', { name: /Storyboard/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('M4: frame 1.1 is unlinked from its block and linked again, and shows when the block is gone', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  const frame = page
    .getByRole('listbox', { name: 'Frames' })
    .getByRole('option', { name: /Frame 1\.1/ });
  await frame.click();
  const links = page.getByRole('region', { name: 'When frame 1.1 starts' });
  await expect(links).toContainText('One block plays this frame.');
  // The demo's frame 1.1 plays scene 1's say, which is marked in the code.
  const marked = page.locator('.pr-workspace .ss-highlight-link');
  await expect(marked).toHaveCount(1);
  const chooseSay = () =>
    page
      .locator('.pr-workspace .blocklyDraggable.ss_story_say')
      .first()
      .locator('text', { hasText: /^say$/ })
      .first()
      .click();

  // Unlink it, then link it again: the mark and the frame's status follow.
  await chooseSay();
  await links.getByRole('button', { name: 'Unlink from frame 1.1' }).click();
  await expect(links).toContainText('No blocks are linked to this frame yet.');
  await expect(marked).toHaveCount(0);
  await expect(frame).not.toContainText('Coded');
  await chooseSay();
  await links.getByRole('button', { name: 'Link to frame 1.1' }).click();
  await expect(links).toContainText('One block plays this frame.');
  await expect(marked).toHaveCount(1);
  await expect(frame).toContainText('Coded');

  // The block deleted: the frame isn't linked, and says so, with no error.
  await chooseSay();
  await page.keyboard.press('Delete');
  await expect(links).toContainText(
    'This frame isn’t linked: the blocks it was linked to have been removed.',
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
});

// Set the stage from the storyboard (10.10): first-frame sketches become models, by side, size,
// facing, backdrop and shot, in one undo step; cast in later frames waits off stage. WP10c (S5),
// after the Storyboard's Backstage (10.9).
test.fixme('M4: the cast is placed from frame 1.1’s sketches in one undo step', () => {});
