import { expect, type Locator, type Page } from '@playwright/test';
import { DEV_STUDIO } from './devStudio.ts';

// The steps the study's browser tests share (`study.e2e.ts` and the M7 gate), on the studio's
// development server, where a test can switch study mode on (`src/prompter/devPrompter.ts`).
// Each is done as a learner or a teacher would, by keyboard where the study asks for it.

export const STUDIO = `${DEV_STUDIO}/`;

/**
 * A class of `names` in the browser's own storage, and the name page open. `study` puts study
 * mode on, and a Prompter with no replies, so the test can see it held off and back. The
 * browser's save dialog is stood in for, keeping what's saved on the window, as the M3 gate does.
 */
export async function startWithClass(page: Page, names: readonly string[], study: boolean) {
  await page.setViewportSize({ width: 1366, height: 900 });
  if (study)
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__storystageStudy = true;
      w.__storystagePrompter = { level: 'full', replies: [] };
      w.showSaveFilePicker = async ({ suggestedName }: { suggestedName: string }) => ({
        async createWritable() {
          const parts: Uint8Array[] = [];
          return {
            write: async (b: Uint8Array) => void parts.push(new Uint8Array(b)),
            close: async () => {
              w.saved = { name: suggestedName, bytes: parts.flatMap((p) => [...p]) };
            },
            abort: async () => undefined,
          };
        },
      });
    });
  await page.goto(`${STUDIO}?example`);
  await page.evaluate(async (pupils) => {
    window.localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys())
      await root.removeEntry(name, { recursive: true });
    const classes = await root.getDirectoryHandle('classes', { create: true });
    const file = await classes.getFileHandle('class.json', { create: true });
    const writable = await file.createWritable();
    await writable.write(
      JSON.stringify({
        version: 1,
        pupils: pupils.map((name) => ({ id: name.toLowerCase(), name, picture: null })),
      }),
    );
    await writable.close();
  }, names);
  await page.goto(STUDIO);
  await expect(page.getByRole('grid', { name: 'Names' })).toBeVisible();
}

export const studyBar = (page: Page) => page.getByRole('region', { name: 'Study' });
export const prompter = (page: Page) => page.getByRole('complementary', { name: 'The Prompter' });

/** Presses `key` until the element in focus is `wanted`, as a keyboard user would. */
export async function pressUntil(page: Page, key: string, wanted: (label: string) => boolean) {
  await expect
    .poll(
      async () => {
        const label = await page.evaluate(
          () =>
            document.activeElement?.getAttribute('aria-label') ??
            document.activeElement?.textContent ??
            '',
        );
        if (wanted(label)) return true;
        await page.keyboard.press(key);
        return false;
      },
      { timeout: 20_000, intervals: [100] },
    )
    .toBe(true);
}

/** Opens a pupil's folder from the name page, and the session's code if one starts. */
export async function openFolder(page: Page, name: string) {
  await page.getByRole('row', { name }).click();
  await expect(page.getByRole('tab', { name: /Storyboard/ })).toBeVisible();
}

export async function switchPupil(page: Page) {
  await page.getByRole('button', { name: /^Film: / }).click();
  await page.getByRole('menuitem', { name: 'Switch pupil' }).click();
  await expect(page.getByRole('grid', { name: 'Names' })).toBeVisible();
}

/** From the study bar, by keyboard: Study tasks, then Start on the task. */
export async function startTask(page: Page, title: string) {
  await studyBar(page).getByRole('button', { name: 'Study tasks' }).focus();
  await page.keyboard.press('Enter');
  const list = page.getByRole('dialog', { name: 'Study tasks' });
  await list.getByRole('button', { name: `Start ${title}` }).focus();
  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
  const card = page.getByRole('region', { name: `Study task: ${title}` });
  await expect(card).toBeVisible();
  await page.getByRole('tab', { name: /Production stage/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.pr-workspace[data-ready], .pr-tiles').first()).toBeVisible({
    timeout: 60_000,
  });
  return card;
}

/** Check my step, by keyboard. */
export async function checkStep(page: Page, card: Locator) {
  await card.getByRole('button', { name: 'Check my step' }).focus();
  await page.keyboard.press('Enter');
}

/** T5 fixed in Blocks by keyboard: Tab into the method, along to the turn's way, left. */
export async function fixInBlocks(page: Page) {
  await page.getByRole('button', { name: /^New in scene/ }).focus();
  await pressUntil(page, 'Tab', (l) => / stacks? of blocks$/.test(l));
  await pressUntil(page, 'ArrowDown', (l) => l.includes('turn, right'));
  await pressUntil(page, 'ArrowRight', (l) => l === 'dropdown: right');
  await page.keyboard.press('Enter');
  const left = page.locator('.blocklyDropDownDiv .blocklyMenuItem', { hasText: 'left' });
  await expect(left).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(left).toHaveClass(/blocklyMenuItemHighlight/);
  await page.keyboard.press('Enter');
  await expect(undo(page)).toHaveText('Undo: Change right to left in redRidingHood turn');
}

/** T5 fixed in Tiles by keyboard: to the turn's row, along to its way, left. */
export async function fixInTiles(page: Page) {
  await page.getByRole('treeitem', { name: /^redRidingHood turn right/ }).focus();
  await pressUntil(page, 'ArrowRight', (l) => l.startsWith('right'));
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'direction' });
  await expect(menu).toBeVisible();
  await pressUntil(page, 'ArrowUp', (l) => l.trim().startsWith('left'));
  await page.keyboard.press('Enter');
  await expect(undo(page)).toHaveText(/^Undo: Change right to left/);
}

export const undo = (page: Page) =>
  page.getByRole('toolbar', { name: 'Undo and redo' }).getByRole('button', { name: /^Undo/ });

/**
 * The two questions, by keyboard: focus starts on the first; Space chooses the option in focus,
 * an arrow the next, and Tab goes on. `ease` and `choice` are each option's place in its row;
 * `null` leaves that question unanswered, so it's logged as skipped.
 */
export async function answer(
  page: Page,
  ease: number | null,
  choice: number | null,
  intro?: string,
) {
  const dialog = page.getByRole('dialog', { name: 'Two quick questions' });
  await expect(dialog).toBeVisible();
  if (intro) await expect(dialog.getByText(intro)).toBeVisible();
  const ease1 = dialog.getByRole('radiogroup', { name: 'How easy was that?' });
  await expect(ease1.getByRole('radio').first()).toBeFocused();
  const choose = async (n: number | null) => {
    if (n === null) return;
    await page.keyboard.press('Space');
    for (let i = 0; i < n; i++) await page.keyboard.press('ArrowRight');
  };
  await choose(ease);
  await page.keyboard.press('Tab');
  await choose(choice);
  await dialog.getByRole('button', { name: 'Done' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
}

/** The teacher ticks a pupil as taking part, in Settings' class list (spec 14 section 6.2). */
export async function tick(page: Page, name: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const box = page.getByRole('checkbox', { name: `Taking part in the study: ${name}` });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await page.getByRole('button', { name: 'Back to the names' }).click();
}

/** The session code on the study bar, as shown ("K7P3-QX2M") and as kept ("K7P3QX2M"). */
export async function sessionCode(page: Page) {
  await expect(studyBar(page)).toHaveText(/Study session [2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}/);
  const shown = (await studyBar(page).textContent())!.match(/([2-9A-Z]{4})-([2-9A-Z]{4})/)!;
  return { shown: shown[0], code: shown[1]! + shown[2]! };
}

/** The Study card in Settings (6.8), from the name page. */
export async function studyCard(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  return page.locator('section', {
    has: page.getByRole('heading', { name: 'Study', exact: true }),
  });
}

/** Export study logs, and the file the stand-in save dialog was given. */
export async function exportLogs(page: Page, card: Locator) {
  await card.getByRole('button', { name: 'Export study logs' }).click();
  type Saved = { name: string; bytes: number[] } | undefined;
  const savedFile = () => page.evaluate(() => (window as { saved?: Saved }).saved);
  await expect.poll(savedFile).toBeTruthy();
  const saved = (await savedFile())!;
  return { name: saved.name, bytes: new Uint8Array(saved.bytes) };
}
