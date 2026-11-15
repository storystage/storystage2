import { expect, test, type Page } from '@playwright/test';

// The M7 gate, "Pilot ready" (workplan section 5; WP18.2): curriculum mapping published; DPIA
// done; pilot schools recruited; a class can be set up (WP24). The manual script is
// docs/test/M7-pilot-ready.md, and most of this gate is the owner's: the documents signed off, the
// schools recruited, and the 30-device run. This is the part CI can check on every pull request:
// a teacher's class, from an empty device to work collected and handed back, in one browser.
//
// The teacher's folder for Collect and Hand back is stood in for by a folder in the browser's own
// storage, which the test can read: the studio's code, from the button to the files, runs as it
// does for a teacher.

/** Thirty pupils, as WP24's done-when has. */
const CLASS = [
  'Ana',
  'Ben',
  'Cara',
  'Dev',
  'Ella',
  'Finn',
  'Grace',
  'Hari',
  'Isla',
  'Jack',
  'Kai',
  'Leila',
  'Maya',
  'Noah',
  'Olu',
  'Pip',
  'Quinn',
  'Rosa',
  'Sam',
  'Tom',
  'Uma',
  'Vic',
  'Wren',
  'Xander',
  'Yusuf',
  'Zoe',
  'Amir',
  'Bea',
  'Cal',
  'Dara',
];
const TEACHER_FOLDER = 'teacher-chose-this';

/** An empty device, with the teacher's folder picker answered by a folder in its own storage. */
async function emptyDevice(page: Page) {
  await page.addInitScript((folder) => {
    (window as unknown as Record<string, unknown>).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(folder, { create: true });
  }, TEACHER_FOLDER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.evaluate(async () => {
    window.localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys())
      await root.removeEntry(name, { recursive: true });
  });
  await page.goto('/');
}

/** A pupil, from the names, makes a film with `title` and leaves it saved. */
async function makeFilm(page: Page, pupil: string, title: string) {
  await page.getByRole('grid', { name: 'Names' }).getByRole('row', { name: pupil }).first().click();
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await expect(page.getByRole('status')).toHaveText('Saved', { timeout: 10_000 });
  await page.getByRole('button', { name: `Film: ${title} · ${pupil}` }).click();
  await page.getByRole('menuitem', { name: 'Switch pupil' }).click();
}

/** The films a pupil finds, from the names. */
async function filmsOf(page: Page, pupil: string) {
  await page.getByRole('grid', { name: 'Names' }).getByRole('row', { name: pupil }).first().click();
  await expect(page.getByRole('heading', { name: `${pupil}’s films` })).toBeVisible();
  return page.getByRole('row', { name: /\S/ }).allInnerTexts();
}

/** How many pupils the class list on the device has. */
function savedPupils(page: Page) {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const classes = await root.getDirectoryHandle('classes');
    const file = await (await classes.getFileHandle('class.json')).getFile();
    return (JSON.parse(await file.text()) as { pupils: unknown[] }).pupils.length;
  });
}

/** The files in the teacher's folder, as `pupil/file`. */
function teacherFolder(page: Page) {
  return page.evaluate(async (folder) => {
    type Dir = FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };
    const root = await navigator.storage.getDirectory();
    const top = (await root.getDirectoryHandle(folder)) as Dir;
    const files: string[] = [];
    for await (const [pupil, handle] of top.entries())
      if (handle.kind === 'directory')
        for await (const [file] of (handle as Dir).entries()) files.push(`${pupil}/${file}`);
    return files.sort();
  }, TEACHER_FOLDER);
}

test('M7: a teacher sets up a class of 30, pupils find only their own films, and work is collected and handed back', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await emptyDevice(page);

  // The teacher: Settings › Class set-up › Import class list, thirty names pasted in.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Import class list' }).click();
  await page.getByRole('textbox', { name: 'Names, one a line' }).fill(CLASS.join('\n'));
  await page.getByRole('button', { name: /^Add \d+ pupils$/ }).click();
  await expect(page.getByText(`${CLASS.length} pupils`)).toBeVisible();
  // The studio opened on the device's own film, with no class yet; with a class, the next start
  // opens on the names.
  // The count shows before the list is saved: Import adds the pupils one at a time (S5 told).
  await expect.poll(() => savedPupils(page), { timeout: 30_000 }).toBe(CLASS.length);
  await page.reload();
  await expect(page.getByRole('grid', { name: 'Names' }).getByRole('row')).toHaveCount(
    CLASS.length,
  );

  // A lesson: two pupils each make a film on the same device.
  await makeFilm(page, 'Ana', 'Moon Garden');
  await makeFilm(page, 'Ben', 'The Lost Kite');

  // Next lesson: each finds their own film, and not the other's.
  await page.reload();
  const ana = await filmsOf(page, 'Ana');
  expect(ana.join(' / ')).toMatch(/Moon Garden/);
  expect(ana.join(' / ')).not.toMatch(/Lost Kite/);
  await page.getByRole('row', { name: /Moon Garden/ }).click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Moon Garden');
  await page.getByRole('button', { name: 'Film: Moon Garden · Ana' }).click();
  await page.getByRole('menuitem', { name: 'Switch pupil' }).click();
  const ben = await filmsOf(page, 'Ben');
  expect(ben.join(' / ')).toMatch(/The Lost Kite/);
  expect(ben.join(' / ')).not.toMatch(/Moon Garden/);

  // The end of a unit: Collect, one folder for each pupil, each film as saved. The teacher's
  // Settings are on the names page.
  await page.getByRole('button', { name: 'Switch pupil' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const collect = page.getByRole('region', { name: 'Collect and hand back' });
  await collect.getByRole('button', { name: 'Collect…' }).click();
  await expect(collect.getByText('Collected 2 films.')).toBeVisible({ timeout: 30_000 });
  expect(await teacherFolder(page)).toEqual([
    'Ana/Moon Garden.storystage',
    'Ben/The Lost Kite.storystage',
  ]);

  // Hand back: each film goes back to its own pupil, beside their own, never over it.
  await collect.getByRole('button', { name: 'Hand back…' }).click();
  await expect(collect.getByText('Handed back 2 films.')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Back to the names' }).click();
  const handedBack = await filmsOf(page, 'Ben');
  expect(handedBack.join(' / ')).toMatch(/The Lost Kite \(handed back\)/);
  expect(handedBack.join(' / ')).not.toMatch(/Moon Garden/);
});

test.fixme('M7: the chosen Prompter route works within its caps', () => {
  // Waits on the decision of how the Prompter reaches a group (WP24.3) and the class caps in the
  // native layer (24.5, S8). By hand: the script's section 4.
});

test.fixme('M7: the teacher exports the class’s study logs', () => {
  // Waits on the study log export (WP24.6, with 7.13). By hand: the script's section 5.
});
