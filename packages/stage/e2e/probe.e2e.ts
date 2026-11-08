// Local only, not committed: real humanoids in the shared clips, to look at.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const DIR = 'C:/Users/andre/Dropbox/6 - IT/dev/backstage-assets/models/';
const OUT =
  'C:/Users/andre/AppData/Local/Temp/claude/a23cb72c0bd66888/996044da-6616-4050-a430-d75e3203488f/scratchpad/frames/';
const MODELS = (
  process.env.PROBE_MODELS ??
  'tiny,kaykit/Biped/knight.glb,osa/Biped/david.vrm,osa/Biped/olivia.vrm'
).split(',');
const CLIPS = (
  process.env.PROBE_CLIPS ?? 'idle:0,walk:0.25,walk:0.75,run:0.2,sitting:1,lying:1,pickUp:0.6'
).split(',');

test('humanoids in the shared clips', async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  await page.goto('http://localhost:4181/');
  await expect(page).toHaveTitle('Stage harness ready');
  for (const model of MODELS) {
    const url =
      model === 'tiny'
        ? undefined
        : `data:model/gltf-binary;base64,${readFileSync(DIR + model).toString('base64')}`;
    for (const c of CLIPS) {
      const [clip, at] = c.split(':');
      const pngs = await page.evaluate(
        ([clip, at, url]) =>
          (
            window as unknown as {
              stageHarness: { humanPicture: (...a: unknown[]) => Promise<string[]> };
            }
          ).stageHarness.humanPicture(clip, [Number(at)], url ?? undefined),
        [clip, at, url ?? null] as const,
      );
      const name = `${model.split('/').pop()!.split('.')[0]}-${clip}-${at}.png`;
      writeFileSync(OUT + name, Buffer.from(pngs[0]!.split(',')[1]!, 'base64'));
    }
  }
});
