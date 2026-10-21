// Spike 1.6: once the page has reported, look inside the webview through DevTools (WebView2's
// remote debugging port, switched on only in the spike harness): save the live page and a full
// JavaScript heap snapshot, so CI can scan them for the key. If the key was ever in the webview's
// memory, it would be in the snapshot.
//
//   node cdp-check.mjs <done-file> <out-dir> [port]
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [doneFile, outDir, port = '9222'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; !existsSync(doneFile); i++) {
  if (i > 240) throw new Error(`The page never reported (${doneFile}).`);
  await sleep(500);
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('No page target on the DevTools port.');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let nextId = 1;
const pending = new Map();
const chunks = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') chunks.push(msg.params.chunk);
  else if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

const dom = await send('Runtime.evaluate', {
  expression:
    'JSON.stringify({ html: document.documentElement.outerHTML, local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie })',
  returnByValue: true,
});
writeFileSync(join(outDir, 'devtools-page.json'), dom.result?.result?.value ?? JSON.stringify(dom));

await send('HeapProfiler.enable');
await send('HeapProfiler.collectGarbage');
await send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
const snapshot = chunks.join('');
writeFileSync(join(outDir, 'devtools-heap.heapsnapshot'), snapshot);
console.log(
  `Saved the page and a ${(snapshot.length / 1e6).toFixed(1)} MB heap snapshot from ${page.url}.`,
);
ws.close();
