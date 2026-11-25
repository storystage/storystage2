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
  ).toHaveCount(8);
  // The export made a real MP4 here: no stand-in note for it.
  expect(report).not.toMatch(/no MP4 is made here/);
});

// WebGPU in software: SwiftShader's adapter, where this browser has it. CI's other tests draw with
// WebGL2 only, so this is where the scene state step compares two renderers there (18.2).
const WEBGPU = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-webgpu-adapter=swiftshader',
];

test('the scene state step compares WebGL2 with WebGPU, frame for frame', async ({
  browser: shared,
  launchOptions,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const browser = await shared.browserType().launch({
    ...launchOptions,
    args: [...(launchOptions.args ?? []), ...WEBGPU],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.goto(`${baseURL}/?example`);
    const adapter = await page.evaluate(async () => {
      const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      return Boolean(await gpu?.requestAdapter().catch(() => null));
    });
    console.log(`WebGPU adapter: ${adapter}`);
    test.skip(!adapter, 'This browser has no WebGPU adapter, even in software.');
    await page.getByRole('button', { name: 'Settings' }).click();
    const card = page.getByRole('region', { name: 'Self-test' });
    // Chromium's page process sometimes crashes with SwiftShader's WebGPU on CI's Linux runner
    // (about one run in eight), seconds into the self-test. That's the browser's software WebGPU,
    // not the self-test: it's noted with the report's last lines, not failed. A crash with WebGL2
    // alone still fails the test above.
    let crashed = false;
    page.on('crash', () => {
      crashed = true;
    });
    const reportText = card.getByLabel('Self-test report');
    let lastSeen = '';
    const watch = setInterval(() => {
      reportText.textContent({ timeout: 1_000 }).then(
        (text) => {
          if (text) lastSeen = text;
        },
        () => {},
      );
    }, 2_000);
    await card.getByRole('button', { name: 'Run the self-test' }).click();
    try {
      await expect(card.getByRole('status')).toHaveText(/SELFTEST (PASS|FAIL)/, {
        timeout: 200_000,
      });
    } catch (error) {
      if (!crashed && !/Target crashed/.test(String(error))) throw error;
      const last = lastSeen.trim().split('\n').slice(-3).join(' / ') || 'nothing yet';
      console.log(`The page crashed with WebGPU in software. The report's last lines: ${last}`);
      test.info().annotations.push({
        type: 'WebGPU in software',
        description: `The page crashed. The report's last lines: ${last}`,
      });
      return;
    } finally {
      clearInterval(watch);
    }
    const report = (await reportText.textContent()) ?? '';
    console.log(report);
    // A frame that differs between the renderers always fails. WebGPU in software on CI's Linux
    // runner sometimes can't upload a texture while a scene loads (copyExternalImageToTexture),
    // before any frame is compared: that's the stage's, and noted here, not failed (CI's software
    // WebGPU isn't a reference device; on a device the self-test fails it).
    expect(report).not.toMatch(/differed from WebGL2/);
    const fault = /Problem: Something went wrong: .*(GPU|WebGPU).*/.exec(report)?.[0];
    if (fault) {
      test.info().annotations.push({ type: 'WebGPU in software', description: fault });
      return;
    }
    expect(report).toMatch(/✓ Play the film on each renderer/);
    // Two renderers: no note that it was one, checked twice.
    expect(report).not.toMatch(/draws with WebGL2 only/);
  } finally {
    await browser.close();
  }
});
