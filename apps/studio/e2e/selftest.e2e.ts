import { expect, test } from '@playwright/test';

// The built-in self-test (WP18.1) from Settings, in a real browser: the real stage (WebGL2 with
// software rendering here), the runtime in its worker, and five seconds exported to MP4. Every
// manual script and device run ends with it, recording its last line.

test('Settings › Self-test runs every step on the real stage and ends with SELFTEST PASS', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('button', { name: 'Settings' }).click();
  const card = page.getByRole('region', { name: 'Self-test' });
  await card.getByRole('button', { name: 'Run the self-test' }).click();
  const result = card.getByRole('status');
  await expect(result).toHaveText(/SELFTEST (PASS|FAIL)/, { timeout: 200_000 });
  const report = (await card.getByLabel('Self-test report').textContent()) ?? '';
  console.log(report);
  expect(report.trim().split('\n').at(-1), report).toBe('SELFTEST PASS');
  await expect(
    card.getByRole('list', { name: 'Self-test steps' }).getByRole('listitem'),
  ).toHaveCount(7);
  // The export made a real MP4 here: no stand-in note for it.
  expect(report).not.toMatch(/no MP4 is made here/);
});
