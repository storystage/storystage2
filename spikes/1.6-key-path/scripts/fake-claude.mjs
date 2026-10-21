// Spike 1.6: a minimal stand-in for tools/fake-claude (S7, WP13.7). It checks that the request
// carries the stored test key (by comparing SHA-256 hashes, so the key is never printed), logs
// what it saw without the key, and streams a short Messages API reply.
//
//   node fake-claude.mjs <port> <expected-key-sha256-file> <log-file>
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const [port = '8787', hashFile, logFile = 'fake-claude.log'] = process.argv.slice(2);
const expected = readFileSync(hashFile, 'utf8').trim();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const reply = [
  {
    type: 'message_start',
    message: {
      id: 'msg_spike',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [],
    },
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The move block ' } },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'moves an object ' },
  },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'in a direction.' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } },
  { type: 'message_stop' },
];

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return res.end('ok');
  if (req.method !== 'POST' || req.url !== '/v1/messages') {
    res.statusCode = 404;
    return res.end();
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  const key = req.headers['x-api-key'];
  const entry = {
    at: new Date().toISOString(),
    keyPresent: typeof key === 'string' && key.length > 0,
    keyMatched: typeof key === 'string' && sha256(key) === expected,
    anthropicVersion: req.headers['anthropic-version'] ?? null,
    model: (() => {
      try {
        return JSON.parse(body).model;
      } catch {
        return null;
      }
    })(),
  };
  appendFileSync(logFile, JSON.stringify(entry) + '\n');
  if (!entry.keyMatched) {
    res.writeHead(401, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error' } }));
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const event of reply) {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    await sleep(30);
  }
  res.end();
}).listen(Number(port), '127.0.0.1', () => console.log(`fake Claude on http://127.0.0.1:${port}`));
