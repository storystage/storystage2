/** Spike 1.3 in CI: both tiny models transcribe both clips in Chromium; numbers are a floor. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('whisper transcribes the test clips with both tiny models', async ({ page }) => {
  test.setTimeout(600_000);
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('page error:', m.text());
  });
  await page.goto('/?auto=1');
  const handle = await page.waitForFunction(
    () => (window as unknown as { spikeResult?: unknown }).spikeResult,
    undefined,
    { timeout: 590_000 },
  );
  const r = (await handle.jsonValue()) as {
    error?: string;
    models: { model: string; clips: { clip: string; heard: string; wordErrorRate: number }[] }[];
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/spike-1.3-ci.json', JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r, null, 2));
  expect(r.error).toBeUndefined();
  expect(r.models).toHaveLength(2);
  for (const m of r.models) for (const c of m.clips) expect(c.heard.length).toBeGreaterThan(0);
  // The clear recording must come out nearly right with either model.
  for (const m of r.models)
    expect(m.clips.find((c) => c.clip === 'jfk')!.wordErrorRate).toBeLessThan(0.25);
});
