/**
 * The fake Messages API: `POST /v1/messages` replays a recording's next turn as a real stream.
 * The Rust transport (WP15.2) and the TypeScript tests point at it instead of Anthropic. It logs
 * each request for tests to read, and it never keeps a key.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { JsonObject } from '@storystage/prompter';
import {
  canonical,
  checkAppendOnly,
  checkRequest,
  echoOf,
  type ConversationState,
  type Refusal,
} from './protocol.ts';
import { assemble, type Recording } from './recording.ts';

export interface LoggedRequest {
  readonly body: JsonObject;
  readonly beta: string | undefined;
  readonly hadKey: boolean;
}

export interface FakeClaude {
  /** The base URL, without `/v1/messages`. */
  readonly url: string;
  readonly requests: LoggedRequest[];
  /** Replace the recordings and start again from each one's first turn. */
  use(...recordings: readonly Recording[]): void;
  close(): Promise<void>;
}

export interface FakeClaudeOptions {
  readonly port?: number;
  /** Answer 401 to a request with no key, as the real API does. For the native layer's tests. */
  readonly requireKey?: boolean;
}

/** Turns are consumed in order, and a server holding several recordings picks by `match`. */
function pick(recordings: readonly Recording[], body: JsonObject): Recording | undefined {
  if (recordings.length === 1) return recordings[0];
  const first = JSON.stringify((body.messages as readonly JsonObject[])[0]);
  return recordings.find((r) => r.match !== undefined && first.includes(r.match));
}

const sendError = (res: ServerResponse, refusal: Refusal, retryAfter?: number) => {
  res.writeHead(refusal.status, {
    'content-type': 'application/json',
    ...(retryAfter === undefined ? {} : { 'retry-after': String(retryAfter) }),
  });
  res.end(
    JSON.stringify({ type: 'error', error: { type: refusal.type, message: refusal.message } }),
  );
};

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function stream(res: ServerResponse, events: readonly JsonObject[], cutAfter?: number) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const [i, event] of events.entries()) {
    if (i === cutAfter) {
      res.destroy();
      return;
    }
    res.write(`event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`);
    await new Promise((resolve) => setImmediate(resolve));
  }
  res.end();
}

const isHistory = (stopReason: string | null) =>
  stopReason === 'end_turn' || stopReason === 'tool_use';

export async function startFakeClaude(options: FakeClaudeOptions = {}): Promise<FakeClaude> {
  const requests: LoggedRequest[] = [];
  let recordings: readonly Recording[] = [];
  const next = new Map<string, number>();
  const conversations = new Map<string, ConversationState>();

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/v1/messages')
      return sendError(res, { status: 404, type: 'not_found_error', message: String(req.url) });

    const hadKey = Boolean(req.headers['x-api-key'] ?? req.headers.authorization);
    const beta = req.headers['anthropic-beta'];
    const betaHeader = Array.isArray(beta) ? beta.join(',') : beta;
    const body = JSON.parse(await readBody(req)) as JsonObject;
    requests.push({ body, beta: betaHeader, hadKey });

    if (options.requireKey && !hadKey)
      return sendError(res, {
        status: 401,
        type: 'authentication_error',
        message: 'invalid x-api-key',
      });

    const refusal = checkRequest(body, betaHeader);
    if (refusal) return sendError(res, refusal);

    const recording = pick(recordings, body);
    if (!recording)
      return sendError(res, {
        status: 500,
        type: 'fake_claude_error',
        message: 'No recording matches this request.',
      });

    const refused = checkAppendOnly(body, conversations.get(recording.id) ?? null);
    if (refused) return sendError(res, refused);

    const index = next.get(recording.id) ?? 0;
    next.set(recording.id, index + 1);
    const turn = recording.turns[index];
    if (!turn)
      return sendError(res, {
        status: 500,
        type: 'fake_claude_error',
        message: `Recording ${recording.id} has no turn ${index}.`,
      });

    if ((turn.status ?? 200) !== 200)
      return sendError(
        res,
        {
          status: turn.status ?? 500,
          type: turn.error?.type ?? 'api_error',
          message: turn.error?.message ?? '',
        },
        turn.retryAfter,
      );

    const events = turn.events ?? [];
    const messages = body.messages as readonly JsonObject[];
    const { content, stopReason } = assemble(events);
    conversations.set(recording.id, {
      system: canonical(body.system),
      tools: canonical(body.tools),
      first: canonical(messages[0]),
      // A reply that isn't kept binds nothing new, and nothing after the last kept reply is bound:
      // the client may take back the turns it sent after that (spec 04, section 1.6).
      prefix: isHistory(stopReason)
        ? [...messages, { role: 'assistant', content: echoOf(content) }]
        : messages.slice(0, messages.map((m) => m.role).lastIndexOf('assistant') + 1),
    });
    await stream(res, events, turn.cutAfter);
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent)
        sendError(res, { status: 500, type: 'fake_claude_error', message: String(error) });
      else res.destroy();
    });
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    use(...replacement) {
      recordings = replacement;
      next.clear();
      conversations.clear();
      requests.length = 0;
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
