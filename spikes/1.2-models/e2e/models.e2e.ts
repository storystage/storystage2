/**
 * Spike 1.2 in CI: the sweep runs to the end in Chromium with software rendering. The frame
 * numbers here say little about real devices (no GPU); the device runs (M1) give the budgets.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('the budget sweep runs every preset', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?auto=1');
  const handle = await page.waitForFunction(
    () => (window as unknown as { spikeResult?: unknown }).spikeResult,
    undefined,
    { timeout: 290_000 },
  );
  const result = (await handle.jsonValue()) as {
    results: { preset: { id: string }; fps: number; triangles: number }[];
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/spike-1.2-ci.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  expect(result.results.map((r) => r.preset.id)).toEqual(['small', 'medium', 'large', 'crowd']);
  for (const r of result.results) expect(r.fps).toBeGreaterThan(0);
});
