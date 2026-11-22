/**
 * Spike 23.1 in Chromium with software rendering: bakes the box and the building front, checks
 * the illusion holds from the sweet spot and breaks off to one side, and saves every picture
 * for the report.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

interface Compared {
  litShare: number;
  meanError: number;
  badShare: number;
}
interface Surface {
  surface: string;
  bakedShare: Record<string, number>;
  sweetSpot: Compared;
  offAxis: Compared;
  images: Record<string, string>;
}

test('bake a box and a building front, and check the illusion', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  const handle = await page.waitForFunction(
    () => (window as unknown as { spikeResult?: unknown }).spikeResult,
    undefined,
    { timeout: 290_000 },
  );
  const result = (await handle.jsonValue()) as { error?: string; surfaces?: Surface[] };
  expect(result.error).toBeUndefined();
  mkdirSync('test-results', { recursive: true });
  for (const s of result.surfaces!) {
    for (const [name, url] of Object.entries(s.images))
      writeFileSync(
        `test-results/${s.surface}-${name}.png`,
        Buffer.from(url.split(',')[1]!, 'base64'),
      );
  }
  const report = { ...result, surfaces: result.surfaces!.map(({ images: _, ...s }) => s) };
  writeFileSync('test-results/spike-23.1.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  for (const s of result.surfaces!) {
    // The projector lights a good part of the picture, and from the sweet spot it matches.
    expect(s.sweetSpot.litShare, s.surface).toBeGreaterThan(0.1);
    expect(s.sweetSpot.meanError, s.surface).toBeLessThan(12);
    expect(s.sweetSpot.badShare, s.surface).toBeLessThan(0.03);
    // Off to one side, the things floating in front of the surface no longer line up.
    expect(s.offAxis.badShare, s.surface).toBeGreaterThan(s.sweetSpot.badShare * 2);
  }
  const building = result.surfaces!.find((s) => s.surface === 'building')!;
  // The porch hides part of the wall from the audience: that part isn't baked.
  expect(building.bakedShare.wall).toBeLessThan(0.95);
  expect(building.bakedShare['porch front']).toBeGreaterThan(0.95);
});
