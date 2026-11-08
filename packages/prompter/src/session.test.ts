import { describe, expect, it } from 'vitest';
import { FRESH_CONVERSATION, outcomeMessage } from './outcomes.ts';
import {
  CONVERSATION_LIMIT,
  MAX_STEP_FAILURES,
  MAX_TOOL_CALLS,
  PrompterSession,
  type AskOptions,
  type SessionEvent,
  type ToolRunner,
} from './session.ts';
import { buildSystem, modeMessage } from './system-prompt.ts';
import { testReply, type TestBlock } from './testing.ts';
import { TOOLS, type ToolOutcome } from './tools.ts';
import {
  scriptedTransport,
  type JsonObject,
  type PrompterEvent,
  type PrompterRequest,
} from './transport.ts';

const system = buildSystem({ storyApi: 'class Scene', backstage: 'Cast: cat' });
const ok: ToolOutcome = { ok: true, ids: {}, summary: 'Done.' };

const addCat = (step = 1) => ({
  backstage_item: 'Quadruped/Cat/AbyssinianCat',
  name: 'cat',
  position: { x: 0, y: 0, z: 0 },
  narration: 'A cat appears.',
  plan_step: step,
});
const use = (id: string, name: string, input: unknown): TestBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const thought: TestBlock = { type: 'thinking' };

/** A session whose replies come from a list, one per request, with a recording runner. */
function setUp(
  replies: PrompterEvent[][],
  run: (name: string, input: JsonObject) => ToolOutcome = () => ok,
) {
  let next = 0;
  const transport = scriptedTransport(
    () => replies[next++] ?? testReply([{ type: 'text', text: 'No more.' }]),
  );
  const calls: { name: string; input: JsonObject }[] = [];
  const log: string[] = [];
  const runner: ToolRunner = {
    begin: (request) => log.push(`begin ${request}`),
    run: (name, input) => {
      calls.push({ name, input });
      return run(name, input);
    },
    end: () => log.push('end'),
  };
  let id = 0;
  const session = new PrompterSession({
    transport,
    system,
    tools: TOOLS as never,
    runner,
    newId: () => `r${++id}`,
  });
  const events: SessionEvent[] = [];
  return { session, transport, calls, log, events };
}

const build: AskOptions = { mode: 'buildIt', level: 'full', agreedPlan: { steps: [] } };
const messagesOf = (r: PrompterRequest) => r.body.messages as JsonObject[];
const roles = (r: PrompterRequest) => messagesOf(r).map((m) => m.role);

describe('PrompterSession: one request', () => {
  it('sends the learner turn, then the mode message, and keeps the reply', async () => {
    const { session, transport } = setUp([testReply([thought, { type: 'text', text: 'Hello.' }])]);
    const outcome = await session.ask('hi', { mode: 'explain', level: 'full' });
    expect(outcome).toEqual({ status: 'done', toolCalls: 0, changes: 0, fresh: false });
    const [request] = transport.sent;
    expect(roles(request!)).toEqual(['user', 'system']);
    expect(messagesOf(request!)[1]).toEqual({ role: 'system', content: modeMessage('explain') });
    expect(session.messages.at(-1)).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '', signature: 'sig-0' },
        { type: 'text', text: 'Hello.' },
      ],
    });
  });

  it('streams text to the panel', async () => {
    const { session, events } = setUp([testReply([{ type: 'text', text: 'The cat walks.' }])]);
    await session.ask('hi', { mode: 'explain', level: 'full', onEvent: (e) => events.push(e) });
    expect(events.map((e) => (e.type === 'text' ? e.text : '')).join('')).toBe('The cat walks.');
  });

  it("refuses a mode the level doesn't offer, sending nothing", async () => {
    const { session, transport } = setUp([]);
    expect(await session.ask('build', { mode: 'buildIt', level: 'explainOnly' })).toMatchObject({
      status: 'error',
      code: 'refused_by_policy',
    });
    expect(transport.sent).toEqual([]);
  });

  it('allows one request at a time', async () => {
    const { session } = setUp([testReply([{ type: 'text', text: 'a' }])]);
    const first = session.ask('one', { mode: 'explain', level: 'full' });
    await expect(session.ask('two', { mode: 'explain', level: 'full' })).rejects.toThrow();
    await first;
  });
});

describe('the conversation stays append-only (spec 04, section 1.5)', () => {
  it('keeps system and tools the same object, and each request starts with the last', async () => {
    const { session, transport } = setUp([
      testReply([{ type: 'text', text: 'one' }]),
      testReply([{ type: 'text', text: 'two' }]),
      testReply([{ type: 'text', text: 'three' }]),
    ]);
    await session.ask('a', { mode: 'explain', level: 'full' });
    await session.ask('b', { mode: 'explain', level: 'full' });
    await session.ask('c', { mode: 'storyCoach', level: 'full' });
    const [r1, r2, r3] = transport.sent;
    for (const r of [r1, r2, r3]) {
      expect(r!.body.system).toBe(system);
      expect(r!.body.tools).toBe(TOOLS);
    }
    expect(messagesOf(r2!).slice(0, messagesOf(r1!).length)).toEqual(messagesOf(r1!));
    expect(messagesOf(r3!).slice(0, messagesOf(r2!).length)).toEqual(messagesOf(r2!));
  });

  it('sends the mode message only when the mode or level changes', async () => {
    const { session, transport } = setUp(
      [[], [], [], []].map(() => testReply([{ type: 'text', text: 'ok' }])),
    );
    await session.ask('a', { mode: 'explain', level: 'full' });
    await session.ask('b', { mode: 'explain', level: 'full' });
    await session.ask('c', { mode: 'showMeHow', level: 'full' });
    await session.ask('d', { mode: 'showMeHow', level: 'planOnly' });
    const systems = messagesOf(transport.sent[3]!).filter((m) => m.role === 'system');
    expect(systems.map((m) => m.content)).toEqual([
      modeMessage('explain'),
      modeMessage('showMeHow'),
      modeMessage('showMeHow', { planOnly: true }),
    ]);
  });

  it('sends the production and storyboard only when they change', async () => {
    const { session, transport } = setUp(
      [[], [], []].map(() => testReply([{ type: 'text', text: 'ok' }])),
    );
    const production = { scene: 's1' };
    await session.ask('a', {
      mode: 'explain',
      level: 'full',
      production,
      storyboard: { logline: 'x' },
    });
    await session.ask('b', {
      mode: 'explain',
      level: 'full',
      production,
      storyboard: { logline: 'x' },
    });
    await session.ask('c', { mode: 'explain', level: 'full', production: { scene: 's2' } });
    const userTexts = (r: PrompterRequest) =>
      messagesOf(r)
        .filter((m) => m.role === 'user')
        .map((m) =>
          (m.content as JsonObject[]).map((b) =>
            String(b.text).slice(1, String(b.text).indexOf('>')),
          ),
        );
    expect(userTexts(transport.sent[2]!)).toEqual([
      ['production_data', 'storyboard_data', 'learner_request'],
      ['learner_request'],
      ['production_data', 'learner_request'],
    ]);
  });

  it('takes back what a refused request added, so the next one follows the last kept reply', async () => {
    const { session, transport } = setUp([
      testReply([{ type: 'text', text: 'one' }]),
      testReply([{ type: 'text', text: 'Here is part' }], { stopReason: 'refusal' }),
      testReply([{ type: 'text', text: 'three' }]),
    ]);
    await session.ask('a', { mode: 'explain', level: 'full' });
    expect(await session.ask('b', { mode: 'storyCoach', level: 'full' })).toMatchObject({
      status: 'refused',
    });
    await session.ask('c', { mode: 'explain', level: 'full' });
    const [r1, , r3] = transport.sent;
    const kept = messagesOf(r1!).length + 1;
    expect(messagesOf(r3!).slice(0, kept - 1)).toEqual(messagesOf(r1!));
    // No mode message is left hanging before a user turn, and the refused text is gone.
    expect(roles(r3!)).toEqual(['user', 'system', 'assistant', 'user']);
    expect(JSON.stringify(messagesOf(r3!))).not.toContain('Here is part');
  });

  it('starts a fresh conversation once a reply has read past the limit, and says so', async () => {
    const { session, transport, events } = setUp([
      testReply([{ type: 'text', text: 'long' }], { inputTokens: CONVERSATION_LIMIT + 1 }),
      testReply([{ type: 'text', text: 'fresh' }]),
    ]);
    const production = { scene: 's1' };
    await session.ask('a', { mode: 'explain', level: 'full', production });
    const outcome = await session.ask('b', {
      mode: 'explain',
      level: 'full',
      production,
      onEvent: (e) => events.push(e),
    });
    expect(outcome.fresh).toBe(true);
    expect(events).toContainEqual({ type: 'fresh' });
    // The new conversation has the production again, and nothing of the old chat.
    const second = transport.sent[1]!;
    expect(roles(second)).toEqual(['user', 'system']);
    expect(JSON.stringify(messagesOf(second))).toContain('production_data');
    expect(FRESH_CONVERSATION).toMatch(/whole production/);
  });

  it('starts again on New conversation', async () => {
    const { session, transport } = setUp(
      [[], []].map(() => testReply([{ type: 'text', text: 'ok' }])),
    );
    await session.ask('a', { mode: 'explain', level: 'full' });
    session.reset();
    await session.ask('b', { mode: 'explain', level: 'full' });
    expect(roles(transport.sent[1]!)).toEqual(['user', 'system']);
  });
});

describe('the tool loop (spec 04, section 1.6)', () => {
  it('runs each tool in order, answers all of them in one message, and asks again', async () => {
    const { session, transport, calls, log } = setUp([
      testReply([thought, use('t1', 'read_project', {}), use('t2', 'add_model', addCat())]),
      testReply([{ type: 'text', text: 'Your cat is here.' }]),
    ]);
    const events: SessionEvent[] = [];
    const outcome = await session.ask('add a cat', { ...build, onEvent: (e) => events.push(e) });
    expect(outcome).toEqual({ status: 'done', toolCalls: 2, changes: 1, fresh: false });
    expect(calls.map((c) => c.name)).toEqual(['read_project', 'add_model']);
    expect(log).toEqual(['begin add a cat', 'end']);
    const second = messagesOf(transport.sent[1]!);
    expect(second.at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 't1',
          content: '{"ok":true,"ids":{},"summary":"Done."}',
        },
        {
          type: 'tool_result',
          tool_use_id: 't2',
          content: '{"ok":true,"ids":{},"summary":"Done."}',
        },
      ],
    });
    expect(events).toContainEqual({ type: 'narration', text: 'A cat appears.', step: 1 });
  });

  it('runs no tool when the reply is cut off by max_tokens, and keeps nothing', async () => {
    const { session, calls } = setUp([
      testReply([use('t1', 'add_model', addCat())], { stopReason: 'max_tokens' }),
    ]);
    const outcome = await session.ask('add a cat', build);
    expect(outcome).toMatchObject({ status: 'cut_short', stopReason: 'max_tokens', toolCalls: 0 });
    expect(calls).toEqual([]);
    expect(session.messages).toEqual([]);
  });

  it('runs no tool on a refusal, or a stream that ends without saying why', async () => {
    for (const stopReason of ['refusal', null]) {
      const { session, calls } = setUp([
        testReply([use('t1', 'add_model', addCat())], { stopReason }),
      ]);
      await session.ask('add a cat', build);
      expect(calls).toEqual([]);
    }
  });

  it("answers input that isn't valid JSON, or doesn't fit the tool, without running it", async () => {
    const { session, transport, calls } = setUp([
      testReply([
        { type: 'tool_use', id: 't1', name: 'explain', input: null, raw: '{"text": "half' },
        use('t2', 'add_model', { ...addCat(), scale: 99 }),
        use('t3', 'write_logline', {}),
      ]),
      testReply([{ type: 'text', text: 'Sorry.' }]),
    ]);
    await session.ask('go', build);
    expect(calls).toEqual([]);
    const results = (messagesOf(transport.sent[1]!).at(-1)!.content as JsonObject[]).map((r) =>
      JSON.parse(String(r.content)),
    );
    expect(results.map((r) => r.error)).toEqual(['bad_argument', 'bad_argument', 'bad_argument']);
    expect(results[1].message).toMatch(/scale/);
  });

  it('refuses a change before a plan is agreed, and at Plan only', async () => {
    for (const options of [
      { mode: 'buildIt', level: 'full' },
      { mode: 'buildIt', level: 'planOnly', agreedPlan: {} },
      { mode: 'explain', level: 'full', agreedPlan: {} },
    ] as const) {
      const { session, transport, calls } = setUp([
        testReply([use('t1', 'add_model', addCat())]),
        testReply([{ type: 'text', text: 'ok' }]),
      ]);
      const outcome = await session.ask('add a cat', options);
      expect(calls).toEqual([]);
      expect(outcome.changes).toBe(0);
      const [result] = messagesOf(transport.sent[1]!).at(-1)!.content as JsonObject[];
      expect(JSON.parse(String(result!.content))).toMatchObject({ error: 'not_allowed_here' });
    }
  });

  it(`stops at ${MAX_TOOL_CALLS} tool calls, answering every call it was given`, async () => {
    const round = (n: number) =>
      testReply(Array.from({ length: 10 }, (_, i) => use(`t${n}-${i}`, 'read_project', {})));
    const { session, transport, calls } = setUp([round(1), round(2), round(3), round(4)]);
    const outcome = await session.ask('go', build);
    expect(outcome).toMatchObject({ status: 'limit', toolCalls: MAX_TOOL_CALLS });
    expect(calls).toHaveLength(MAX_TOOL_CALLS);
    expect(transport.sent).toHaveLength(3);
    const last = session.messages.at(-1) as JsonObject;
    expect(last.role).toBe('user');
    expect(last.content as JsonObject[]).toHaveLength(10);
    expect(outcomeMessage(outcome)?.text).toMatch(/stopped after 25 steps/);
  });

  it(`ends the request when the same step fails ${MAX_STEP_FAILURES} times`, async () => {
    const fail: ToolOutcome = { ok: false, error: 'unknown_object', message: 'There is no cat.' };
    const again = () => testReply([use(`t${Math.random()}`, 'add_model', addCat(2))]);
    const { session, transport } = setUp([again(), again(), again(), again()], () => fail);
    const outcome = await session.ask('go', build);
    expect(outcome).toMatchObject({ status: 'step_failed', failedStep: 2, toolCalls: 3 });
    expect(transport.sent).toHaveLength(3);
  });

  it('treats a runner that throws as a change that could not be made', async () => {
    const { session, transport } = setUp(
      [testReply([use('t1', 'add_model', addCat())]), testReply([{ type: 'text', text: 'ok' }])],
      () => {
        throw new Error('boom');
      },
    );
    await session.ask('go', build);
    const [result] = messagesOf(transport.sent[1]!).at(-1)!.content as JsonObject[];
    expect(result).toMatchObject({ is_error: true });
    expect(JSON.parse(String(result!.content))).toMatchObject({ error: 'would_break_program' });
  });

  it('runs only the tool calls after a fallback, and echoes as section 1.4 says', async () => {
    const { session, calls } = setUp([
      testReply([
        thought,
        use('t0', 'add_model', addCat()),
        { type: 'fallback', from: 'claude-opus-5-5', to: 'claude-opus-5' },
        use('t1', 'read_project', {}),
      ]),
      testReply([{ type: 'text', text: 'ok' }]),
    ]);
    await session.ask('go', build);
    expect(calls.map((c) => c.name)).toEqual(['read_project']);
    const assistant = session.messages.find(
      (m) => (m as JsonObject).role === 'assistant',
    ) as JsonObject;
    expect((assistant.content as JsonObject[]).map((b) => b.type)).toEqual(['tool_use']);
  });

  it('stops when the learner presses Stop, keeping what landed', async () => {
    const stop = new AbortController();
    const { session } = setUp(
      [testReply([use('t1', 'add_model', addCat())]), testReply([{ type: 'text', text: 'never' }])],
      () => {
        stop.abort();
        return ok;
      },
    );
    const outcome = await session.ask('go', { ...build, signal: stop.signal });
    expect(outcome).toMatchObject({ status: 'stopped', changes: 1 });
    expect(outcomeMessage(outcome)).toEqual({ text: 'Stopped.', action: 'undo' });
    expect((session.messages.at(-1) as JsonObject).role).toBe('user');
  });

  it('passes on a transport error with its code, and keeps nothing', async () => {
    const { session } = setUp([[{ type: 'error', code: 'rate_limited', retryAfterSeconds: 7 }]]);
    const outcome = await session.ask('go', { mode: 'explain', level: 'full' });
    expect(outcome).toMatchObject({ status: 'error', code: 'rate_limited', retryAfterSeconds: 7 });
    expect(session.messages).toEqual([]);
    expect(outcomeMessage(outcome)).toEqual({
      text: 'The Prompter is busy. Try again in 7 seconds.',
      action: 'tryAgain',
    });
  });

  it('ends the undo group however the request ends', async () => {
    const { session, log } = setUp([[{ type: 'error', code: 'offline' }]]);
    await session.ask('go', build);
    expect(log).toEqual(['begin go', 'end']);
  });
});

describe('outcomeMessage (spec 04, section 7)', () => {
  const base = { toolCalls: 0, changes: 0, fresh: false };

  it('says nothing when all went well, or the Prompter is off', () => {
    expect(outcomeMessage({ ...base, status: 'done' })).toBeNull();
    expect(outcomeMessage({ ...base, status: 'error', code: 'prompter_off' })).toBeNull();
  });

  it('offers set-up for a key problem, and Undo only when something changed', () => {
    expect(outcomeMessage({ ...base, status: 'error', code: 'key_revoked' })?.action).toBe(
      'openSetup',
    );
    expect(outcomeMessage({ ...base, status: 'cut_short' })).toEqual({
      text: "The Prompter couldn't finish this step.",
    });
    expect(outcomeMessage({ ...base, status: 'cut_short', changes: 2 })?.action).toBe('undo');
  });

  it('never apologises, and never uses the words rule 9 keeps from learners', () => {
    const statuses = ['refused', 'stopped', 'limit', 'cut_short', 'step_failed'] as const;
    const codes = [
      'no_key',
      'key_revoked',
      'no_credit',
      'rate_limited',
      'overloaded',
      'offline',
      'cap_reached',
      'refused_by_policy',
      'refused_by_allowlist',
      'cancelled',
      'internal',
    ] as const;
    const texts = [
      ...statuses.map((status) => outcomeMessage({ ...base, status })?.text ?? ''),
      ...codes.map((code) => outcomeMessage({ ...base, status: 'error', code })?.text ?? ''),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/sorry|apolog/i);
      expect(text).not.toMatch(/\b(AST|node|token|schema|API)\b/);
    }
  });
});
