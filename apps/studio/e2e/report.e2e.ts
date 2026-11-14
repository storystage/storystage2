import { expect, test } from '@playwright/test';

// Settings › Report a problem (WP18.5) in a real browser: the report is made on the device with
// the self-test on the real stage, shown in full, and saved as a text file. A problem the page
// logs, with a key-shaped string in it, shows in the report scrubbed.

// Key-shaped strings are made at run time, never written out (CLAUDE.md, the key rule).
const KEY = ['sk', 'ant', 'api03', 'x'.repeat(16) + '9Q'].join('-');

test('Settings › Report a problem makes the report here, scrubbed, and saves it as a file', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  // Something goes wrong after StoryStage starts, with a key-shaped string in its words.
  await page.evaluate((key) => console.error(`The request with ${key} failed`), KEY);
  await page.getByRole('button', { name: 'Settings' }).click();
  const card = page.getByRole('region', { name: 'Report a problem' });
  await card.getByRole('button', { name: 'Make the report' }).click();
  const report = card.getByLabel('Problem report');
  await expect(report).toBeVisible({ timeout: 200_000 });
  const text = (await report.textContent()) ?? '';
  expect(text).toMatch(/^StoryStage problem report, made /);
  expect(text).toContain('StoryStage: the browser version');
  expect(text).toContain('SELFTEST PASS');
  expect(text).toContain('error: The request with (hidden) failed');
  expect(text).not.toContain(KEY);

  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Save the report' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^StoryStage problem report \d{4}-\d{2}-\d{2}\.txt$/);
  await expect(card.getByText(/^Saved as “StoryStage problem report/)).toBeVisible();
});
