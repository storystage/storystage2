import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The start of a lesson in a real browser (docs/spec/07-ux.md section 9): the name page, a film
// saved into the browser's own storage, and found again after a reload. The class list is written
// where the browser host keeps it (`classes/class.json` in the Origin Private File System), as
// Settings will once it is built.

async function seriousIssues(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function startWithClass(page: Page, names: string[]) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.evaluate(async (pupils) => {
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
  await page.reload();
}

test('a pupil finds their name, makes a film, and finds it again after a reload', async ({
  page,
}) => {
  await startWithClass(page, ['Sam', 'Ana', 'Pip']);
  await expect(page.getByRole('heading', { name: 'Who’s making films today?' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);

  await page.getByRole('row', { name: 'Sam' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('The Lost Kite');
  await expect(page.getByRole('status')).toHaveText('Saved', { timeout: 10_000 });
  await expect(page.getByText(/kept in this browser on this device/)).toBeVisible();

  await page.reload();
  await page.getByRole('row', { name: 'Sam' }).click();
  await expect(page.getByRole('heading', { name: 'Sam’s films' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('row', { name: /The Lost Kite/ }).click();
  await expect(page.getByRole('button', { name: 'Film: The Lost Kite' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('The Lost Kite');
  // The browser's note shows once only.
  await expect(page.getByText(/kept in this browser on this device/)).toHaveCount(0);
});

test('Ctrl+S saves at once, and the Film menu leads back to the names', async ({ page }) => {
  await startWithClass(page, ['Sam', 'Ana']);
  await page.getByRole('row', { name: 'Ana' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Moon Garden');
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Film: Moon Garden' }).click();
  await page.getByRole('menuitem', { name: 'Switch pupil' }).click();
  await expect(page.getByRole('heading', { name: 'Who’s making films today?' })).toBeVisible();
});
