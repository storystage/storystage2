// The Android job's check that bundled files are read in place (spec 05 sections 5.2, 7 and 7a;
// WP15c). With the app running on an emulator and its webview's DevTools forwarded to `port`, it
// asks the studio's page to fetch `backstage.json` and the smallest pinned speech file, and checks
// each arrives whole: status 200 and its size on disk. The cache is checked by the workflow.
//
//   node apps/desktop/scripts/android-assets-check.mjs <port> <repository root>
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [port, root] = process.argv.slice(2);
if (!port || !root) {
  console.error('usage: android-assets-check.mjs <port> <repository root>');
  process.exit(2);
}

const speech = JSON.parse(readFileSync(join(root, '.speech/kokoro/files.json'), 'utf8'))
  .filter((file) => file.bytes > 0)
  .sort((a, b) => a.bytes - b.bytes)[0];
const wanted = [
  {
    name: 'backstage.json',
    url: 'http://backstage.localhost/backstage.json',
    bytes: statSync(join(root, '.backstage/backstage.json')).size,
  },
  { name: `speech/${speech.path}`, url: `/speech/${speech.path}`, bytes: speech.bytes },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The studio's page, once it has loaded: the webview lists it before then.
async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find(
        (t) => t.type === 'page' && /^https?:\/\/tauri\.localhost\//.test(t.url),
      );
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Not forwarded yet.
    }
    await sleep(2000);
  }
  throw new Error("The studio's page never appeared in the webview's DevTools.");
}

function evaluate(socketUrl, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('No answer from the page in 120 s.'));
    }, 120_000);
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error("The page's DevTools socket failed."));
    };
    socket.onopen = () =>
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    socket.onmessage = (message) => {
      const reply = JSON.parse(message.data);
      if (reply.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (reply.error || reply.result?.exceptionDetails) reject(new Error(JSON.stringify(reply)));
      else resolve(reply.result.result.value);
    };
  });
}

const page = await findPage();
// Let the studio finish starting before asking it for anything.
await sleep(5000);
const expression = `(async () => {
  const out = [];
  for (const w of ${JSON.stringify(wanted)}) {
    try {
      const r = await fetch(w.url, { cache: 'no-store' });
      const body = await r.arrayBuffer();
      out.push({ name: w.name, status: r.status, bytes: body.byteLength });
    } catch (e) {
      out.push({ name: w.name, error: String(e) });
    }
  }
  return JSON.stringify(out);
})()`;
const results = JSON.parse(await evaluate(page.webSocketDebuggerUrl, expression));

let failed = 0;
for (const want of wanted) {
  const got = results.find((r) => r.name === want.name) ?? {};
  const ok = got.status === 200 && got.bytes === want.bytes;
  if (!ok) failed++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${want.name}: ${got.error ?? `status ${got.status}, ${got.bytes} bytes`} (on disk ${want.bytes})`,
  );
}
process.exit(failed ? 1 : 0);
