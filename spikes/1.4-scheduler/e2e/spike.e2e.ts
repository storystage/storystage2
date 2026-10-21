import { expect, test } from '@playwright/test';

test('spike 1.4: worker drives Babylon.js on time, and fixed-step frames repeat exactly', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const handle = await page.waitForFunction(
    () => (window as unknown as { spikeResult?: unknown }).spikeResult,
    undefined,
    { timeout: 110_000 },
  );
  const result = (await handle.jsonValue()) as {
    error?: string;
    fixedStep: { pixelsIdentical: boolean; statesIdentical: boolean; distinctFrames: number };
    live: { lookahead100ms: { lateCommands: number } };
  };
  await info.attach('spike-1.4-result.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify(result, null, 2));
  expect(result.error).toBeUndefined();
  expect(result.fixedStep.statesIdentical).toBe(true);
  expect(result.fixedStep.pixelsIdentical).toBe(true);
  expect(result.fixedStep.distinctFrames).toBeGreaterThan(30);
  expect(result.live.lookahead100ms.lateCommands).toBe(0);
});
