import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ALLOWED_BETAS,
  type JsonObject,
  type PrompterEvent,
  type PrompterMode,
} from '@storystage/prompter';
import { codeForStatus, httpTransport, splitEvents } from './http-transport.ts';
import { checkAppendOnly, checkRequest, echoOf } from './protocol.ts';
import { assemble, reply } from './recording.ts';
import { RECORDINGS, recording } from './recordings.ts';
import { startFakeClaude, type FakeClaude } from './server.ts';

const BETA = ALLOWED_BETAS[0];
const tools = [{ name: 'explain' }];
const system = [{ type: 'text', text: 'You are the Prompter.' }];

let server: FakeClaude;
beforeAll(async () => {
  server = await startFakeClaude();
});
afterAll(() => server.close());

const user = (text: string) => ({ role: 'user', content: [{ type: 'text', text }] });

const bodyOf = (messages: readonly JsonObject[], extra: JsonObject = {}): JsonObject => ({
  model: 'claude-opus-5-5',
  max_tokens: 1000,
  stream: true,
  fallbacks: 'default',
  system,
  tools,
  messages,
  ...extra,
});

async function send(
  messages: readonly JsonObject[],
  extra: JsonObject = {},
  mode: PrompterMode = 'explain',
  signal?: AbortSignal,
) {
  const out: PrompterEvent[] = [];
  const request = {
    id: 'r1',
    mode,
    betas: [BETA],
    body: bodyOf(messages, extra) as never,
  };
  for await (const e of httpTransport(server.url).send(request, signal)) out.push(e);
  return out;
}

const eventsOf = (out: readonly PrompterEvent[]) =>
  out.flatMap((e) => (e.type === 'event' ? [e.event] : []));

describe('replaying a recording', () => {
  beforeEach(() => server.use(recording('text')));

  it('streams the turn in order and ends cleanly', async () => {
    const out = await send([user('What does move do?')]);
    expect(out.at(-1)).toEqual({ type: 'end' });
    const { content, stopReason } = assemble(eventsOf(out));
    expect(stopReason).toBe('end_turn');
    expect(content).toEqual([
      { type: 'thinking', thinking: '', signature: 'sig-0' },
      { type: 'text', text: 'The move block makes something move.' },
    ]);
  });

  it('logs what it saw, and whether a key came with it, but never the key', async () => {
    await send([user('hello')]);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.beta).toBe(BETA);
    expect(server.requests[0]?.hadKey).toBe(false);
    expect(Object.keys(server.requests[0] ?? {})).toEqual(['body', 'beta', 'hadKey']);
  });

  it('fails loudly when a recording runs out', async () => {
    const first = user('one');
    await send([first]);
    const { content } = assemble(recording('text').turns[0]?.events ?? []);
    const out = await send([first, { role: 'assistant', content }, user('two')]);
    expect(out).toEqual([{ type: 'error', code: 'overloaded' }]);
  });
});

describe('errors reach the client as one code each', () => {
  it.each([
    ['bad-key', 'key_revoked'],
    ['no-credit', 'no_credit'],
    ['overloaded', 'overloaded'],
  ])('%s gives %s', async (id, code) => {
    server.use(recording(id));
    expect(await send([user('hi')])).toEqual([{ type: 'error', code }]);
  });

  it('passes on how long to wait after a rate limit, then succeeds', async () => {
    server.use(recording('rate-limited'));
    const messages = [user('hi')];
    expect(await send(messages)).toEqual([
      { type: 'error', code: 'rate_limited', retryAfterSeconds: 7 },
    ]);
    expect((await send(messages)).at(-1)).toEqual({ type: 'end' });
  });

  it('reports a dropped connection as offline, with no end', async () => {
    server.use(recording('dropped-connection'));
    const out = await send([user('hi')]);
    expect(out.at(-1)).toEqual({ type: 'error', code: 'offline' });
    expect(out.some((e) => e.type === 'end')).toBe(false);
  });

  it('reports no server as offline', async () => {
    const closed = await startFakeClaude();
    await closed.close();
    const request = { id: 'r', mode: 'explain', body: bodyOf([user('hi')]) } as never;
    const out: PrompterEvent[] = [];
    for await (const e of httpTransport(closed.url).send(request)) out.push(e);
    expect(out).toEqual([{ type: 'error', code: 'offline' }]);
  });

  it('cancels when aborted', async () => {
    server.use(recording('text'));
    const abort = new AbortController();
    abort.abort();
    expect(await send([user('hi')], {}, 'explain', abort.signal)).toEqual([
      { type: 'error', code: 'cancelled' },
    ]);
  });

  it.each([
    [400, 'internal'],
    [401, 'key_revoked'],
    [402, 'no_credit'],
    [403, 'key_revoked'],
    [429, 'rate_limited'],
    [500, 'overloaded'],
    [529, 'overloaded'],
  ])('maps HTTP %i to %s', (status, code) => {
    expect(codeForStatus(status)).toBe(code);
  });
});

describe('stop reasons', () => {
  it('cuts a tool input part way, so it does not parse', async () => {
    server.use(recording('cut-tool-input'));
    const events = eventsOf(await send([user('add a cat')]));
    const partial = events
      .flatMap((e) => (e.type === 'content_block_delta' ? [e.delta as JsonObject] : []))
      .map((d) => String(d.partial_json))
      .join('');
    expect(() => JSON.parse(partial) as unknown).toThrow();
    expect(assemble(events).stopReason).toBe('max_tokens');
  });

  it('says refusal, with nothing to read', async () => {
    server.use(recording('refusal'));
    const { content, stopReason } = assemble(eventsOf(await send([user('hi')])));
    expect(stopReason).toBe('refusal');
    expect(content).toEqual([]);
  });

  it('marks a fallback as an ordinary block, and serves the rest', async () => {
    server.use(recording('fallback'));
    const { content } = assemble(eventsOf(await send([user('hi')])));
    expect(content.map((b) => b.type)).toEqual(['thinking', 'text', 'fallback', 'text']);
  });

  it('reports token use, so a client can see the conversation limit', async () => {
    server.use(recording('over-the-limit'));
    const [start] = eventsOf(await send([user('hi')]));
    const message = start?.message as { usage: { input_tokens: number } };
    expect(message.usage.input_tokens).toBe(100_001);
  });
});

describe('the append-only rule (spec 04, section 1.5)', () => {
  const opening = user('add a cat');
  const assistant = (id: string, turn: number) => ({
    role: 'assistant',
    content: echoOf(assemble(recording(id).turns[turn]?.events ?? []).content),
  });
  const answer = (id: string) => ({
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: id, content: '{"ok":true}' }],
  });

  beforeEach(() => server.use(recording('tool-loop')));

  it('accepts a history sent back exactly', async () => {
    await send([opening]);
    const out = await send([opening, assistant('tool-loop', 0), answer('toolu_1')]);
    expect(out.at(-1)).toEqual({ type: 'end' });
  });

  it('refuses a history with its empty thinking block dropped', async () => {
    await send([opening]);
    const stripped = assistant('tool-loop', 0);
    const toolOnly = {
      ...stripped,
      content: (stripped.content as JsonObject[]).filter((b) => b.type !== 'thinking'),
    };
    const out = await send([opening, toolOnly, answer('toolu_1')]);
    expect(out).toEqual([{ type: 'error', code: 'internal' }]);
  });

  it('refuses a changed system prompt, as it would a changed tool list', async () => {
    await send([opening]);
    const out = await send([opening, assistant('tool-loop', 0), answer('toolu_1')], {
      system: [{ type: 'text', text: 'Different.' }],
    });
    expect(out).toEqual([{ type: 'error', code: 'internal' }]);
  });

  it('treats a different first message as a new conversation', async () => {
    await send([opening]);
    expect((await send([user('a fresh start')])).at(-1)).toEqual({ type: 'end' });
  });

  it('leaves a refused reply out of the history', async () => {
    server.use(recording('refusal-mid-stream'));
    await send([opening]);
    const out = await send([opening, user('try something else')]);
    expect(out.at(-1)).toEqual({ type: 'end' });
  });

  it('leaves a cut-off reply out of the history', async () => {
    server.use(recording('cut-tool-input'));
    await send([opening]);
    const out = await send([opening, user('carry on')]);
    expect(out.at(-1)).toEqual({ type: 'end' });
  });

  it('drops what came before a fallback from the echo, keeping its text', async () => {
    server.use(recording('fallback'));
    await send([opening]);
    const out = await send([opening, assistant('fallback', 0), user('and next?')]);
    expect(out.at(-1)).toEqual({ type: 'end' });
    expect(assistant('fallback', 0).content).toEqual([
      { type: 'text', text: 'Let me ' },
      { type: 'text', text: 'help with that.' },
    ]);
  });

  it('checks nothing on a first request', () => {
    expect(checkAppendOnly(bodyOf([opening]), null)).toBeNull();
  });
});

describe('what the server refuses', () => {
  const refused = (body: JsonObject, beta: string | undefined = BETA) =>
    checkRequest(body, beta)?.message ?? null;

  it('accepts a good request', () => {
    expect(refused(bodyOf([user('hi')]))).toBeNull();
  });

  it.each([
    ['a sampling setting', { temperature: 0.5 }],
    ['thinking turned off', { thinking: { type: 'disabled' } }],
    ['a thinking budget', { thinking: { type: 'enabled', budget_tokens: 2000 } }],
    ['forced tool use', { tool_choice: { type: 'any' } }],
    ['an unknown model', { model: 'claude-opus-4-1' }],
  ])('refuses %s', (_name, extra) => {
    expect(refused(bodyOf([user('hi')], extra))).not.toBeNull();
  });

  it('refuses fallbacks without their beta', () => {
    expect(refused(bodyOf([user('hi')]), 'something-else')).toMatch(/requires the/);
  });

  it('refuses fallbacks on Haiku 5.5, which has none', () => {
    expect(refused(bodyOf([user('hi')], { model: 'claude-haiku-5-5' }))).toMatch(/not supported/);
    const haiku = bodyOf([user('hi')], { model: 'claude-haiku-5-5' });
    const plain = Object.entries(haiku).filter(([key]) => key !== 'fallbacks');
    expect(refused(Object.fromEntries(plain))).toBeNull();
  });

  it('refuses a request ending on an assistant turn', () => {
    const body = bodyOf([user('hi'), { role: 'assistant', content: 'Sure' }]);
    expect(refused(body)).toMatch(/prefill/);
  });

  it('refuses a tool_use left unanswered', () => {
    const body = bodyOf([
      user('hi'),
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'explain', input: {} }] },
      user('and now?'),
    ]);
    expect(refused(body)).toMatch(/no tool_result/);
  });

  it('allows a mode message after the learner, and nowhere else', () => {
    const mode = { role: 'system', content: 'Mode: Build it.' };
    expect(refused(bodyOf([user('hi'), mode]))).toBeNull();
    expect(refused(bodyOf([mode, user('hi')]))).not.toBeNull();
    expect(refused(bodyOf([user('a'), mode, user('b')]))).toMatch(/must be last/);
  });

  it('refuses pictures, keys and a request that does not stream (rules 1 and 3)', () => {
    const picture = { type: 'image', source: { type: 'base64', data: 'x' } };
    expect(refused(bodyOf([{ role: 'user', content: [picture] }]))).toMatch(/rule 3/);
    expect(refused(bodyOf([user('hi')], { api_key: 'x' }))).toMatch(/rule 1/);
    expect(refused(bodyOf([user('hi')], { stream: false }))).toMatch(/streams/);
  });
});

describe('recordings', () => {
  it('each have a matcher and a note, and none claims to be real', () => {
    for (const r of RECORDINGS) {
      expect(r.match).toBe(`recording:${r.id}`);
      expect(r.note.length).toBeGreaterThan(5);
      expect(r.source).toBe('synthetic');
      expect(r.turns.length).toBeGreaterThan(0);
    }
  });

  it('are found by their match when a server holds several', async () => {
    server.use(...RECORDINGS);
    const { content } = assemble(eventsOf(await send([user('recording:text')])));
    expect(content.at(-1)).toEqual({ type: 'text', text: 'The move block makes something move.' });
  });

  it('answer 500 when nothing matches', async () => {
    server.use(...RECORDINGS);
    expect(await send([user('unknown')])).toEqual([{ type: 'error', code: 'overloaded' }]);
  });
});

describe('requireKey', () => {
  it('answers 401 without a key, as the native layer will see', async () => {
    const keyed = await startFakeClaude({ requireKey: true });
    keyed.use(recording('text'));
    const request = { id: 'r', mode: 'explain', body: bodyOf([user('hi')]) } as never;
    const out: PrompterEvent[] = [];
    for await (const e of httpTransport(keyed.url).send(request)) out.push(e);
    expect(out).toEqual([{ type: 'error', code: 'key_revoked' }]);
    await keyed.close();
  });
});

describe('splitEvents', () => {
  it('keeps a part-sent event for the next chunk', () => {
    const { events, rest } = splitEvents('event: a\ndata: {"type":"a"}\n\nevent: b\ndata: {"ty');
    expect(events).toEqual([{ type: 'a' }]);
    expect(rest).toBe('event: b\ndata: {"ty');
  });
});

describe('reply', () => {
  it('stops for tool use when a reply has a tool call', () => {
    const events = reply([{ type: 'tool_use', id: 't', name: 'explain', input: {} }]);
    expect(assemble(events).stopReason).toBe('tool_use');
  });
});
