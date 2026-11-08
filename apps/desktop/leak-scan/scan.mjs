// Looks inside the webview through DevTools once the page has finished: saves its report, the live
// page and a full JavaScript heap snapshot for the key to be searched for, and checks the results.
// If the key was ever in the webview's memory, it would be in the snapshot.
//
//   node scan.mjs <out folder> <fake server's log> [port]

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, logFile, port = '9222'] = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pins = JSON.parse(
  readFileSync(new URL('../src-tauri/speech-models.json', import.meta.url), 'utf8'),
);
const bundled = pins.models.find((model) => model.bundled);

async function findPage() {
  for (let tries = 0; tries < 240; tries++) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((reply) => reply.json())
      .catch(() => []);
    const page = targets.find((target) => target.type === 'page');
    if (page) return page;
    await sleep(500);
  }
  throw new Error('No page on the DevTools port.');
}

const page = await findPage();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let nextId = 0;
const waiting = new Map();
let snapshot = '';
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'HeapProfiler.addHeapSnapshotChunk') snapshot += message.params.chunk;
  // Only answers to requests this script sent: the id is checked before anything is called.
  if (Number.isInteger(message.id) && waiting.has(message.id)) {
    const resolve = waiting.get(message.id);
    waiting.delete(message.id);
    resolve(message.result);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    waiting.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

let report;
for (let tries = 0; tries < 240 && !report; tries++) {
  report = await evaluate('window.__report');
  if (!report) await sleep(500);
}
if (!report) throw new Error('The page never finished.');

const html = await evaluate('document.documentElement.outerHTML');
await send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report));
writeFileSync(join(outDir, 'page.html'), html);
writeFileSync(join(outDir, 'heap.heapsnapshot'), snapshot);
socket.close();

const requests = readFileSync(logFile, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const refusedBy = (name, code) => report[name]?.code === code;
const checks = [
  ['the page ran without an error', !report.error],
  ['status says the Prompter is available', report.status?.available === true],
  ['the key shows only as present', report.keyStatus === 'present'],
  ['the reply streamed and ended', report.streamed?.last?.type === 'end'],
  ['the text arrived whole', report.streamed?.text === 'The move block moves an object.'],
  ['a key-shaped request was refused', refusedBy('keyShaped', 'refused_by_policy')],
  ['the wrong model was refused', refusedBy('wrongModel', 'refused_by_allowlist')],
  ['an unpinned system prompt was refused', refusedBy('wrongSystem', 'refused_by_allowlist')],
  ['a picture was refused', refusedBy('picture', 'refused_by_allowlist')],
  ['a plugin no capability grants is refused', /not allowed/i.test(report.ungrantedPlugin)],
  [
    'the bundled speech model arrived whole',
    report.speechModel?.bytes === bundled.bytes && report.speechModel?.sha256 === bundled.sha256,
  ],
  ['a path instead of a model name is refused', report.speechByPath === 'internal'],
  ['the page is cross-origin isolated, for whisper', report.crossOriginIsolated === true],
  ['a film went through the pupil folders whole, as raw bytes', report.classes?.whole === true],
  [
    'a pupil folder lists only what was written',
    JSON.stringify(report.classes?.listed) === '["v-1.storystage"]',
  ],
  ['a path out of the pupil folders is refused', report.classes?.escape === 'internal'],
  ['a file that isn’t there reads as not found', report.classes?.missing === 'not_found'],
  ['only one request reached the network', requests.length === 1],
  ['the fake server received the stored key', requests.every((line) => line.keyMatched)],
];
let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`);
  if (!passed) failed += 1;
}
console.log(`Heap snapshot: ${(snapshot.length / 1e6).toFixed(1)} MB.`);
process.exit(failed ? 1 : 0);
