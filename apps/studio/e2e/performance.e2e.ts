import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// WP18.3, performance budgets: the studio's start-up, a scene's load, Rehearse's frame rate,
// memory, and export speed, measured in the production build on every pull request and held to
// CI's budgets (docs/test/performance.md). CI draws in software on a two-core runner, so these
// budgets catch a change that makes the studio slower; the reference devices' budgets are set
// by the owner's runs. The numbers go in the log and in test-results/performance.json.
//
// STUDIO_CPU_SLOWDOWN=4 slows the CPU fourfold (Chromium only), as a stand-in for the Chromebook
// until its run; then the numbers are reported and not held.

/** CI's budgets: about three times what CI measured, so only a real slowdown fails. */
export const CI_BUDGETS = {
  /** From the page starting to load to the Storyboard taking input. */
  startupMs: 6_000,
  /** From choosing the Production stage to Rehearse being offered on the demo's scene 1. */
  sceneLoadMs: 8_000,
  /** Frames drawn a second while Rehearse plays (software drawing: low). */
  rehearseFpsAtLeast: 5,
  /** JavaScript memory in use after Rehearse, in MB. */
  heapMb: 400,
  /** Time to export five seconds, over five seconds. */
  exportRealTime: 28,
} as const;

const SLOWDOWN = Number(process.env['STUDIO_CPU_SLOWDOWN'] ?? 1);

test('the studio starts, loads a scene, rehearses and exports within its budgets', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  if (SLOWDOWN > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOWDOWN });
  }
  await page.setViewportSize({ width: 1366, height: 768 });

  // Start-up: from the page starting to load to the Storyboard taking input.
  await page.goto('/?example');
  await expect(page.getByRole('textbox', { name: 'Logline' })).toBeEditable();
  const startupMs = Math.round(await page.evaluate(() => performance.now()));

  // Scene load: the Production stage's scene view with the demo's scene 1, ready to rehearse.
  const t0 = await page.evaluate(() => performance.now());
  await page.getByRole('tab', { name: /Production stage/ }).click();
  const view = page.getByRole('region', { name: 'Scene view' });
  const rehearse = view.getByRole('button', { name: 'Rehearse', exact: true });
  await expect(rehearse).toBeEnabled({ timeout: 60_000 });
  const sceneLoadMs = Math.round((await page.evaluate(() => performance.now())) - t0);

  // Rehearse: frames drawn a second, and frames that took over 50 ms, for three seconds.
  await rehearse.click();
  const frames = await page.evaluate(
    () =>
      new Promise<{ fps: number; long: number; count: number }>((done) => {
        const times: number[] = [];
        const start = performance.now();
        const tick = (t: number) => {
          times.push(t);
          if (t - start < 3_000) requestAnimationFrame(tick);
          else {
            const gaps = times.slice(1).map((x, i) => x - times[i]!);
            done({
              fps: Math.round((gaps.length / ((t - times[0]!) / 1000)) * 10) / 10,
              long: gaps.filter((g) => g > 50).length,
              count: gaps.length,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  const stop = view.getByRole('button', { name: 'Stop' });
  if (await stop.isVisible()) await stop.click();

  // Memory: JavaScript's heap in use, where the browser says (Chromium).
  const heapMb = await page.evaluate(() => {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? Math.round(memory.usedJSHeapSize / 1e6) : null;
  });

  // Export speed: the self-test's five-second MP4, from Settings.
  await page.getByRole('button', { name: 'Settings' }).click();
  const card = page.getByRole('region', { name: 'Self-test' });
  await card.getByRole('button', { name: 'Run the self-test' }).click();
  await expect(card.getByRole('status')).toHaveText(/SELFTEST (PASS|FAIL)/, { timeout: 240_000 });
  const report = (await card.getByLabel('Self-test report').textContent()) ?? '';
  const exportMs = Number(/Export five seconds \((\d+) ms\)/.exec(report)?.[1] ?? NaN);
  const exportRealTime = Math.round((exportMs / 5000) * 100) / 100;

  const measured = {
    slowdown: SLOWDOWN,
    startupMs,
    sceneLoadMs,
    rehearseFps: frames.fps,
    rehearseLongFrames: frames.long,
    rehearseFrames: frames.count,
    heapMb,
    exportMs,
    exportRealTime,
  };
  console.log(`Performance: ${JSON.stringify(measured)}`);
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/performance.json', `${JSON.stringify(measured, null, 2)}\n`);
  await info.attach('performance.json', {
    body: JSON.stringify(measured, null, 2),
    contentType: 'application/json',
  });

  expect(report.trim().split('\n').at(-1), report).toBe('SELFTEST PASS');
  // Slowed down, the numbers stand in for a device's: reported, not held.
  if (SLOWDOWN > 1) return;
  expect.soft(startupMs, 'start-up').toBeLessThanOrEqual(CI_BUDGETS.startupMs);
  expect.soft(sceneLoadMs, 'scene load').toBeLessThanOrEqual(CI_BUDGETS.sceneLoadMs);
  expect
    .soft(frames.fps, 'Rehearse frames a second')
    .toBeGreaterThanOrEqual(CI_BUDGETS.rehearseFpsAtLeast);
  if (heapMb !== null) expect.soft(heapMb, 'memory').toBeLessThanOrEqual(CI_BUDGETS.heapMb);
  expect.soft(exportRealTime, 'export').toBeLessThanOrEqual(CI_BUDGETS.exportRealTime);
});
