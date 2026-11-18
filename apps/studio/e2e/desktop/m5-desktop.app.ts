import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { startFakeClaude, type FakeClaude } from '@storystage/fake-claude';
import { exampleProduction } from '@storystage/production';
import type { JsonObject, PlanStep } from '@storystage/prompter';
import { testReply, type TestBlock } from '@storystage/prompter/testing';

// The M5 gate in the desktop app itself (workplan section 5; WP18.2): the studio inside the real
// Windows app, on the app's native layer (#391), not the browser version's. The rest of the M5
// gate is in ../gates/m5-prompter-speech.e2e.ts and the manual script, docs/test/M5-prompter-speech.md.
//
// The app is the test build (README.md here): the real studio and native layer, with a DevTools
// port added by this folder's tauri.conf.json, which only `--config` uses. Nothing here reaches a
// release: desktop.yml fails if the shipped config mentions the port.
//
// The Prompter talks to tools/fake-claude, never to Claude: the build has the `test-endpoint`
// feature, as the leak scan's does, and `STORYSTAGE_TEST_ENDPOINT` points it at the fake. Its key
// is a random test key that the leak scan's helper, `test-key`, puts in the system's own store, as
// the system dialog does for an adult (a test can't type into that dialog). Nothing prints the key.

const PORT = 9223;
const CLAUDE_PORT = 8787;
const BUILD = resolve(import.meta.dirname, '../../../desktop/src-tauri/target/debug');
const APP = process.env.STORYSTAGE_APP ?? join(BUILD, 'storystage-desktop.exe');
const TEST_KEY = join(BUILD, 'test-key.exe');

let app: ChildProcess | undefined;
let browser: Browser | undefined;
let shared: Page | undefined;
let claude: FakeClaude | undefined;
const problems: string[] = [];

/** Runs the leak scan's key helper, which never prints the key. */
function testKey(...args: string[]) {
  const run = spawnSync(TEST_KEY, args, { encoding: 'utf8' });
  if (run.status !== 0 && args[0] !== 'delete')
    throw new Error(`test-key ${args[0]} failed: ${run.stderr}`);
}

/** The app's one page, once its WebView2 answers on the DevTools port. */
async function appPage(): Promise<Page> {
  if (shared && !shared.isClosed()) return shared;
  for (let tries = 0; tries < 240; tries++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
      const page = browser.contexts()[0]?.pages()[0];
      if (page) {
        // WebView2 is up before the app has loaded the studio: wait for the app's own address.
        await expect.poll(() => page.url(), { timeout: 60_000 }).toMatch(/^https?:\/\//);
        shared = page;
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

test.beforeAll(async () => {
  for (const file of [APP, TEST_KEY])
    if (!existsSync(file)) throw new Error(`No test build at ${file}: see README.md here.`);
  // A device with no key: the Prompter starts unset.
  testKey('delete');
  claude = await startFakeClaude({ port: CLAUDE_PORT, requireKey: true });
  app = spawn(APP, [], {
    stdio: 'inherit',
    env: { ...process.env, STORYSTAGE_TEST_ENDPOINT: claude.url },
  });
});

// Over DevTools Playwright can't snapshot the page, so a failure says what the Prompter's panel
// showed, what the fake was asked, and what the page complained of. No key is in any of these.
// eslint-disable-next-line no-empty-pattern -- Playwright needs its fixtures destructured.
test.afterEach(async ({}, info) => {
  if (info.status === info.expectedStatus || !shared || shared.isClosed()) return;
  const panel = await shared
    .getByRole('complementary', { name: 'The Prompter' })
    .innerText({ timeout: 2_000 })
    .catch(() => '(no panel)');
  const asked = (claude?.requests ?? []).map((r) => ({
    hadKey: r.hadKey,
    model: r.body.model,
    messages: (r.body.messages as unknown[] | undefined)?.length,
  }));
  const said = [
    `The Prompter's panel:\n${panel}`,
    `Requests the fake had: ${JSON.stringify(asked)}`,
    `The page's errors:\n${problems.join('\n')}`,
  ].join('\n\n');
  console.log(said);
  await info.attach('diagnosis', { body: said, contentType: 'text/plain' });
});

test.afterAll(async () => {
  await browser?.close().catch(() => {});
  await claude?.close();
  testKey('delete');
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
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
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

// The bundled voices and whisper.js (spec 06, sections 1.11 and 4.6; S8's #426 and #433): the
// studio asks for `speech/whisper.js`, `speech/kokoro/` and `speech/ort/` beside itself.
test('M5: in the desktop app, whisper.js and the speak line voices are bundled', async () => {
  const page = await appPage();
  for (const file of [
    'speech/whisper.js',
    'speech/kokoro/model_quantized.onnx',
    'speech/kokoro/tokenizer.json',
    'speech/ort/ort-wasm-simd-threaded.mjs',
    'speech/ort/ort-wasm-simd-threaded.wasm',
  ])
    expect(
      await page.evaluate(async (f) => {
        const reply = await fetch(new URL(f, location.origin));
        await reply.body?.cancel();
        return reply.ok;
      }, file),
      file,
    ).toBe(true);
});

// The Prompter in the app (spec 04; spec 05 sections 1 and 2; S7's #465 and #530): the key in the
// system's store, the panel ready, and a plan shown, built as one step and undone, every request
// through the native layer's transport and gate, with the key added there and never in the page.
const example = exampleProduction();
const main = example.program.types
  .flatMap((t) => t.methods)
  .find((m) => m.id === example.scenes[0]!.method)!;
const walks: PlanStep = {
  words: 'The penguin waddles forward.',
  kind: 'do',
  actor: 'penguin',
  action: 'move',
  target: '',
  details: [
    { name: 'direction', value: 'forward' },
    { name: 'amount', value: '1' },
  ],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  why: 'So she can reach the fox.',
};
const toolUse = (id: string, name: string, input: unknown): TestBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const say = (text: string) => testReply([{ type: 'text', text }]);
const REPLIES = [
  testReply([toolUse('t1', 'propose_plan', { steps: [walks] })]),
  say('Here is a plan. Change it if you like, then build it.'),
  testReply([
    toolUse('t2', 'insert_statement', {
      method: main.name,
      position: 'end',
      target: 'penguin',
      procedure: 'move',
      arguments: walks.details,
      narration: 'The penguin waddles forward.',
      plan_step: 1,
    }),
  ]),
  say('Built. The penguin now waddles forward.'),
];

test('M5: in the desktop app, the Prompter plans, builds and undoes through the native layer', async () => {
  const page = await appPage();
  const origin = new URL(page.url()).origin;
  claude!.use({
    id: 'm5-app',
    source: 'synthetic',
    note: 'The M5 gate in the app: a plan, then its build.',
    turns: REPLIES.map((events) => ({ events: events as unknown as readonly JsonObject[] })),
  });
  const asked: string[] = [];
  page.on('request', (r) => asked.push(r.url()));
  await page.goto(`${origin}/?example`);

  // No key on this device yet: Settings says so, and the panel asks for an adult.
  await page.getByRole('button', { name: 'Settings' }).click();
  const card = page.getByRole('region', { name: 'The Prompter' });
  await expect(card.getByText(/Not set up on this device/)).toBeVisible();
  await page.getByRole('button', { name: /^Back to / }).click();
  await page.getByRole('tab', { name: /Production stage/ }).click();
  const prompter = page.getByRole('complementary', { name: 'The Prompter' });
  await expect(prompter.getByText('Ask an adult to set up the Prompter.')).toBeVisible({
    timeout: 60_000,
  });

  // An adult's key goes into the system's store, as Add key's system dialog would put it.
  testKey('set', join(mkdtempSync(join(tmpdir(), 'storystage-m5-')), 'key.hash'));
  await page.goto(`${origin}/?example`);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(card.getByText(/a Claude key is in its secure store/)).toBeVisible();
  await page.getByRole('button', { name: /^Back to / }).click();
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible({ timeout: 60_000 });

  // A plan, with nothing built.
  await prompter.getByRole('radio', { name: 'Show me how' }).check();
  const field = prompter.getByRole('textbox', { name: 'Ask the Prompter' });
  await field.fill('Make the penguin walk to the fox.');
  await field.press('Enter');
  const plan = prompter.getByRole('grid', { name: 'Plan before change' });
  await expect(plan.getByRole('row')).toHaveCount(1, { timeout: 30_000 });
  await expect(prompter.getByText('Nothing built yet')).toBeVisible();

  // Built as one step, marked as the Prompter's, then undone.
  const blocks = page.locator('.pr-workspace .blocklyBlock:not(.blocklyFlyout *)');
  const marked = page.locator(
    '.pr-workspace .blocklyBlock.ss-highlight-prompter:not(.blocklyFlyout *)',
  );
  const before = await blocks.count();
  await prompter.getByRole('button', { name: 'Build these steps' }).click();
  await expect(prompter.getByText('Built. The penguin now waddles forward.')).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(() => blocks.count()).toBeGreaterThan(before);
  await expect(marked.first()).toBeVisible();
  await prompter.getByRole('button', { name: 'Undo this request' }).click();
  await expect.poll(() => blocks.count()).toBe(before);
  await expect(marked).toHaveCount(0);

  // Four requests, each through the native layer, which added the key; the page sent none itself.
  expect(claude!.requests.map((r) => r.hadKey)).toEqual([true, true, true, true]);
  expect(asked.filter((u) => u.includes(`:${CLAUDE_PORT}`) || /anthropic/.test(u))).toEqual([]);
});
