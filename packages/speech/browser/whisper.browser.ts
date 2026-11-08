/**
 * Dictation in a real browser (spec 06, section 5): whisper.cpp built from pinned sources, in
 * the real worker, hearing a recorded clip; and the browser's microphone through the real
 * worklet. Run by `.github/workflows/speech.yml`, which builds whisper first.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** Word error rate: how many words were wrong, as a share of what was said. */
function wordErrorRate(said: string, heard: string): number {
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  const a = words(said);
  const b = words(heard);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length]![b.length]! / Math.max(1, a.length);
}

const KENNEDY =
  'And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.';

async function resultOf(page: Page, run: string) {
  page.on('console', (m) => console.log(`page ${m.type()}: ${m.text()}`));
  page.on('worker', (worker) =>
    worker.on('console', (m) => console.log(`worker ${m.type()}: ${m.text()}`)),
  );
  page.on('pageerror', (error) => console.log('page error:', error.message));
  await page.goto(`/?run=${run}`);
  try {
    const handle = await page.waitForFunction(
      () => (window as unknown as { harnessResult?: unknown }).harnessResult,
      undefined,
      { timeout: 240_000 },
    );
    return (await handle.jsonValue()) as Record<string, unknown>;
  } finally {
    // How far it got, for a run that hangs.
    console.log(
      'stages:',
      JSON.stringify(
        await page.evaluate(
          () => (window as unknown as { harnessStages?: string[] }).harnessStages,
        ),
        null,
        2,
      ),
    );
  }
}

test('dictation hears a recorded clip through the real whisper worker', async ({ page }) => {
  test.setTimeout(300_000);
  const r = await resultOf(page, 'clip');
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/dictation-clip.json', JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r));
  expect(r.error).toBeUndefined();
  expect(wordErrorRate(KENNEDY, String(r.text))).toBeLessThan(0.25);
});

test('the browser microphone passes on samples, and stops when closed', async ({ page }) => {
  test.setTimeout(60_000);
  const r = await resultOf(page, 'microphone');
  console.log(JSON.stringify(r));
  expect(r.error).toBeUndefined();
  expect(r.blocks).toBeGreaterThan(10);
  expect(r.rate).toBeGreaterThan(0);
  expect(r.afterClose).toBe(0);
});
