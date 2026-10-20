/**
 * Spike 1.8 in each browser engine Playwright has: Google Chrome (with H.264), open-source
 * Chromium and WebKit. Records what each can encode, and saves the clip for ffprobe.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('encode a 10-second 720p clip to MP4', async ({ page, browserName }, info) => {
  test.setTimeout(300_000);
  await page.goto('/');
  const handle = await page.waitForFunction(
    () => (window as unknown as { spikeResult?: unknown }).spikeResult,
    undefined,
    { timeout: 290_000 },
  );
  const result = (await handle.jsonValue()) as {
    error?: string;
    encode?: { error?: string; codec?: string };
  };
  const name = info.project.name;
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/spike-1.8-${name}.json`, JSON.stringify(result, null, 2));
  console.log(name, browserName, JSON.stringify(result, null, 2));
  expect(result.error).toBeUndefined();
  if (result.encode && !result.encode.error) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
    await download.saveAs(`test-results/spike-1.8-${name}.mp4`);
  }
});
