import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Settings › Class set-up in a real browser (docs/spec/07-ux.md section 9.4): reached from the
// name page's corner, pupils added and imported into the browser's own storage, a film moved to
// the bin and back, and axe on the page.

async function seriousIssues(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** A class of `names`, written on `?example`, which skips the start of a lesson (see lesson.e2e). */
async function startWithClass(page: Page, names: string[]) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/?example');
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
  await page.goto('/');
}

test('the teacher sets up the class from the name page', async ({ page }) => {
  await startWithClass(page, ['Sam']);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Class set-up' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);

  await page.getByRole('button', { name: 'Add pupil' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Name' }).fill('Ana');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('row', { name: 'Open Ana’s folder' })).toBeVisible();

  await page.getByRole('button', { name: 'Import class list' }).click();
  await page.getByRole('textbox', { name: 'Names, one a line' }).fill('Pip\nana\nLeila');
  await expect(page.getByRole('button', { name: 'Add 2 pupils' })).toBeEnabled();
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('button', { name: 'Add 2 pupils' }).click();
  await expect(page.getByText('4 pupils')).toBeVisible();

  await page.getByRole('button', { name: 'Back to the names' }).click();
  const names = page.getByRole('grid', { name: 'Names' });
  await expect(names.getByRole('row')).toHaveText(['Ana', 'Leila', 'Pip', 'Sam']);
});

test('a film goes to the bin and back, from Settings in the studio', async ({ page }) => {
  await startWithClass(page, ['Sam']);
  await page.getByRole('row', { name: 'Sam' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Kite');
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status')).toHaveText('Saved');
  // A second film, so the first can go to the bin: the open one can't.
  await page.getByRole('button', { name: 'Film: Kite · Sam' }).click();
  await page.getByRole('menuitem', { name: 'New film' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('row', { name: 'Open Sam’s folder' }).click();
  await page.getByRole('button', { name: 'Move to the bin: Kite' }).click();
  const bin = page.getByRole('region', { name: 'The bin' });
  await expect(bin.getByText('Kite')).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await bin.getByRole('button', { name: 'Restore Kite' }).click();
  await expect(bin.getByText('The bin is empty.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move to the bin: Kite' })).toBeVisible();
});
