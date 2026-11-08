// A small Claude for the leak scan. It compares the key by a PBKDF2 value that `test-key set`
// writes, so the server never holds the key and never prints it, and logs one line per request.
// `tools/fake-claude` is for the Prompter's own tests.
//
//   node fake-server.mjs <file with the key's PBKDF2 value> <log file> <port>

import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const [hashFile, logFile, port] = process.argv.slice(2);
const expected = Buffer.from(readFileSync(hashFile, 'utf8').trim(), 'hex');

// The same as `test-key`: PBKDF2-HMAC-SHA256, this salt, this many rounds, 32 bytes.
const derive = (key) => pbkdf2Sync(key, 'storystage-leak-scan', 100_000, 32, 'sha256');
const matches = (key) => typeof key === 'string' && timingSafeEqual(derive(key), expected);

const delta = (text) => ({
  type: 'content_block_delta',
  index: 0,
  delta: { type: 'text_delta', text },
});
const events = [
  { type: 'message_start', message: { id: 'leak-scan', role: 'assistant', content: [] } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  delta('The move block '),
  delta('moves an object.'),
  { type: 'content_block_stop', index: 0 },
  { type: 'message_stop' },
];

createServer((request, response) => {
  const line = { url: request.url, keyMatched: matches(request.headers['x-api-key']) };
  appendFileSync(logFile, `${JSON.stringify(line)}\n`);
  request.resume();
  if (!line.keyMatched) {
    response.writeHead(401).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
  response.end();
}).listen(Number(port), '127.0.0.1');
