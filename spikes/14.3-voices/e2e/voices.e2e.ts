/**
 * Spike 14.3 in CI: Kokoro speaks every test line in every voice; with whisper present, each
 * voice is understood. Saves the numbers and every clip for the report and the owner.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

interface Spoken {
  voice: string;
  seconds: number;
  wordErrorRate: number | null;
}

test('Kokoro speaks the test lines, and whisper understands them', async ({ page }) => {
  test.setTimeout(1_800_000);
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('page error:', m.text());
  });
  await page.goto(
    `/?auto=1${process.env.SPIKE_VOICES ? `&voices=${process.env.SPIKE_VOICES}` : ''}`,
  );
  const handle = await page.waitForFunction(
    () => (window as unknown as { spikeResult?: unknown }).spikeResult,
    undefined,
    { timeout: 1_790_000, polling: 2000 },
  );
  const r = (await handle.jsonValue()) as {
    error?: string;
    whisper: boolean;
    spoken: Spoken[];
    byVoice: Record<string, { meanWordErrorRate: number | null }>;
  };
  mkdirSync('test-results/clips', { recursive: true });
  writeFileSync('test-results/spike-14.3.json', JSON.stringify(r, null, 2));
  const clips = (await page.evaluate(
    () => (window as unknown as { spikeClips: Record<string, string> }).spikeClips,
  )) as Record<string, string>;
  for (const [name, b64] of Object.entries(clips ?? {}))
    writeFileSync(`test-results/clips/${name}.wav`, Buffer.from(b64, 'base64'));
  console.log(JSON.stringify({ ...r, spoken: undefined }, null, 2));

  expect(r.error).toBeUndefined();
  // Every line came out as sound of a sensible length.
  for (const s of r.spoken) expect(s.seconds, `${s.voice}`).toBeGreaterThan(0.5);
  if (r.whisper)
    for (const [voice, v] of Object.entries(r.byVoice))
      expect(v.meanWordErrorRate!, voice).toBeLessThan(0.3);
});
