import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';

// The M5 gate in the desktop app itself (workplan section 5; WP18.2): the studio inside the real
// Windows app, on the app's native layer (#391), not the browser version's. The rest of the M5
// gate is in ../gates/m5-prompter-speech.e2e.ts and the manual script, docs/test/M5-prompter-speech.md.
//
// The app is the test build (README.md here): the real studio and native layer, with a DevTools
// port added by this folder's tauri.conf.json, which only `--config` uses. Nothing here reaches a
// release: desktop.yml fails if the shipped config mentions the port.

const PORT = 9223;
const APP =
  process.env.STORYSTAGE_APP ??
  resolve(import.meta.dirname, '../../../desktop/src-tauri/target/debug/storystage-desktop.exe');

let app: ChildProcess | undefined;
let browser: Browser | undefined;
const problems: string[] = [];

/** The app's one page, once its WebView2 answers on the DevTools port. */
async function appPage(): Promise<Page> {
  for (let tries = 0; tries < 240; tries++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
      const page = browser.contexts()[0]?.pages()[0];
      if (page) {
        // WebView2 is up before the app has loaded the studio: wait for the app's own address.
        await expect.poll(() => page.url(), { timeout: 60_000 }).toMatch(/^https?:\/\//);
        return page;
      }
      await browser.close();
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The app's page never answered on port ${PORT}.`);
}

test.beforeAll(() => {
  if (!existsSync(APP)) throw new Error(`No test build of the app at ${APP}: see README.md here.`);
  app = spawn(APP, [], { stdio: 'inherit' });
});

test.afterAll(async () => {
  await browser?.close().catch(() => {});
  // The app and its WebView2 processes, so the next run's port is the next app's.
  if (app?.pid && process.platform === 'win32')
    spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
  else app?.kill();
});

test('M5: in the desktop app, the studio is on the native layer, with its version, the mic and the shipped Backstage', async () => {
  const page = await appPage();
  const origin = new URL(page.url()).origin;
  // Everything the page asks for, and anything it complains of, from a fresh start.
  const asked: string[] = [];
  page.on('request', (r) => asked.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  await page.goto(`${origin}/?example`);

  // On the native layer: Tauri's internals are there, and nothing says the studio fell back to
  // the browser version's host.
  expect(await page.evaluate(() => '__TAURI_INTERNALS__' in window)).toBe(true);
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);

  // The installed version, read from the native layer, in the report a teacher attaches.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Make the report' }).click();
  const report = page.getByLabel('Problem report');
  await expect(report).toContainText(/StoryStage: \d+\.\d+\.\d+/, { timeout: 180_000 });
  await expect(report).not.toContainText('the browser version');
  // The self-test inside the report ran on the app's own WebView2.
  await expect(report).toContainText('SELFTEST PASS');

  // Talk to type is offered, since the native layer gives the speech models, and once on, the
  // Logline has its mic. (CI has no microphone: the take itself is the owner's, script section 3.)
  await expect(page.getByRole('heading', { name: 'Talk to type' })).toBeVisible();
  // The switch's words, as a teacher taps them: the input itself lies under the drawn track.
  await page.getByText('Talk to type: a mic beside every place you write').click();
  await expect(page.getByRole('switch', { name: /^Talk to type/ })).toBeChecked();
  await page.getByRole('button', { name: /^Back to / }).click();
  await page.getByRole('tab', { name: /Storyboard/ }).click();
  await expect(page.getByRole('button', { name: /^Say it: Logline/ })).toBeVisible();

  // The shipped Backstage, from the app's own read-only `backstage` protocol.
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible({ timeout: 60_000 });
  await page
    .getByRole('navigation', { name: 'Backstage' })
    .getByRole('button', { name: 'Cast' })
    .click();
  await expect(page.getByText('Backstage’s models aren’t on this device yet.')).toHaveCount(0);
  const adds = page.getByRole('button', { name: /^Add .+ to the scene$/ });
  await expect(adds.first()).toBeVisible({ timeout: 30_000 });
  await adds.first().click();
  await expect(page.getByText(/is in the scene, in front of the camera\./)).toBeVisible();

  // Nothing leaves the device: every request is to the app itself, its IPC or its Backstage.
  const own = [origin, 'http://ipc.localhost', 'ipc:', 'http://backstage.localhost', 'backstage:'];
  const elsewhere = asked.filter(
    (u) => !own.some((o) => u.startsWith(o)) && !/^(data|blob):/.test(u),
  );
  expect(elsewhere).toEqual([]);
  expect(problems.filter((p) => /native layer/.test(p))).toEqual([]);
});

// The bundled voices and whisper.js (spec 06, sections 1.11 and 4.6): the studio asks for
// `speech/whisper.js`, `speech/kokoro/` and `speech/ort/` beside itself, and in the apps they are
// S8's to bundle (WP15.6). Make this a test when they are.
test.fixme('M5: in the desktop app, whisper.js and the speak line voices are bundled', async () => {
  const page = await appPage();
  for (const file of [
    'speech/whisper.js',
    'speech/kokoro/model_quantized.onnx',
    'speech/ort/ort-wasm-simd-threaded.wasm',
  ])
    expect(
      await page.evaluate(async (f) => (await fetch(f, { method: 'HEAD' })).ok, file),
      file,
    ).toBe(true);
});

// The Prompter in the app: the native transport over `prompter_send` with a Tauri channel (S7,
// 13.2). Until it's built the studio starts the Prompter off. With it, set-up against
// tools/fake-claude in a `test-endpoint` build, as the leak scan does.
test.fixme('M5: in the desktop app, the studio finds the Prompter', () => {});
