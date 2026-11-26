// The Android job's check that bundled files are read in place (spec 05 sections 5.2, 7 and 7a;
// WP15c). With the app running on an emulator and its webview's DevTools forwarded to `port`, it
// asks the studio's page for three files through the native layer's three readers, and checks
// each arrives whole, at its size on disk:
//
// - `backstage.json` and one shipped model of a few MB, through the Backstage protocol;
// - the smallest pinned speech file, through the app's own `speech/...` files;
// - the bundled speech model, through `speech_model_load`, which checks it against its pin.
//
// The workflow checks the cache afterwards.
//
//   node apps/desktop/scripts/android-assets-check.mjs <port> <repository root>
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const [port, root] = process.argv.slice(2);
if (!port || !root) {
  console.error('usage: android-assets-check.mjs <port> <repository root>');
  process.exit(2);
}

// The paths the Backstage protocol serves (storystage_classes::backstage_files).
const SERVED = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;

function files(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.isFile() ? [path] : [];
  });
}

// A model of a few MB, so a read that stops part-way would show: the closest to 5 MB.
const backstage = join(root, '.backstage');
const model = files(backstage)
  .filter((path) => /\.(glb|vrm)$/.test(path))
  .map((path) => ({
    path: relative(backstage, path).split(sep).join('/'),
    bytes: statSync(path).size,
  }))
  .filter((file) => SERVED.test(file.path) && file.path.length <= 255 && file.bytes >= 1_000_000)
  .sort((a, b) => Math.abs(a.bytes - 5e6) - Math.abs(b.bytes - 5e6))[0];
if (!model) throw new Error('No shipped model of 1 MB or more in .backstage.');

const speech = JSON.parse(readFileSync(join(root, '.speech/kokoro/files.json'), 'utf8'))
  .filter((file) => file.bytes > 0)
  .sort((a, b) => a.bytes - b.bytes)[0];

const fetched = [
  {
    name: 'backstage.json',
    url: 'http://backstage.localhost/backstage.json',
    bytes: statSync(join(backstage, 'backstage.json')).size,
  },
  { name: model.path, url: `http://backstage.localhost/${model.path}`, bytes: model.bytes },
  { name: `speech/${speech.path}`, url: `/speech/${speech.path}`, bytes: speech.bytes },
];
// The bundled speech model, as fetch-models.mjs placed it for the build.
const tauri = join(root, 'apps/desktop/src-tauri');
const pinned = JSON.parse(readFileSync(join(tauri, 'speech-models.json'), 'utf8')).models.find(
  (m) => m.bundled,
);
const bundledModel = statSync(join(tauri, 'resources/speech', pinned.file)).size;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The studio's page: the webview lists it once it starts loading.
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

let nextId = 1;
function evaluate(socketUrl, expression) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
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
          id,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    socket.onmessage = (message) => {
      const reply = JSON.parse(message.data);
      if (reply.id !== id) return;
      clearTimeout(timer);
      socket.close();
      if (reply.error || reply.result?.exceptionDetails) reject(new Error(JSON.stringify(reply)));
      else resolve(reply.result.result.value);
    };
  });
}

const page = await findPage();
let ready = '';
for (let i = 0; i < 60 && ready !== 'complete'; i++) {
  ready = await evaluate(page.webSocketDebuggerUrl, 'document.readyState').catch(() => '');
  if (ready !== 'complete') await sleep(1000);
}
if (ready !== 'complete') throw new Error("The studio's page never finished loading.");

const expression = `(async () => {
  const out = [];
  for (const w of ${JSON.stringify(fetched)}) {
    try {
      const r = await fetch(w.url, { cache: 'no-store' });
      const body = await r.arrayBuffer();
      out.push({ name: w.name, status: r.status, bytes: body.byteLength });
    } catch (e) {
      out.push({ name: w.name, error: String(e) });
    }
  }
  try {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const models = await invoke('speech_models');
    const bundled = models.find((m) => m.bundled);
    const body = await invoke('speech_model_load', { name: bundled.name });
    out.push({ name: 'speech_model_load', status: 200, bytes: body.byteLength, pinned: bundled.bytes });
  } catch (e) {
    out.push({ name: 'speech_model_load', error: String(e) });
  }
  return JSON.stringify(out);
})()`;
const results = JSON.parse(await evaluate(page.webSocketDebuggerUrl, expression));

const wanted = [...fetched, { name: 'speech_model_load', bytes: bundledModel }];
let failed = 0;
for (const want of wanted) {
  const got = results.find((r) => r.name === want.name) ?? {};
  const ok =
    got.status === 200 && got.bytes === want.bytes && (got.pinned ?? want.bytes) === want.bytes;
  if (!ok) failed++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${want.name}: ${got.error ?? `status ${got.status}, ${got.bytes} bytes`} (on disk ${want.bytes})`,
  );
}
process.exit(failed ? 1 : 0);
