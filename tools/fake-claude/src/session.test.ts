/**
 * The Prompter's conversation loop against the fake server, over HTTP (spec 04, section 8). The
 * server refuses a changed `system` or `tools`, or a history that edits a kept reply, so these
 * tests fail if the loop ever breaks the append-only rule.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PrompterSession,
  TOOLS,
  buildSystem,
  type AskOptions,
  type Json,
  type ToolRunner,
} from '@storystage/prompter';
import { httpTransport } from './http-transport.ts';
import { reply, type Recording } from './recording.ts';
import { recording } from './recordings.ts';
import { startFakeClaude, type FakeClaude } from './server.ts';

let server: FakeClaude;
beforeAll(async () => {
  server = await startFakeClaude();
});
afterAll(() => server.close());

const ran: string[] = [];
const runner: ToolRunner = {
  run: (name) => {
    ran.push(name);
    return { ok: true, ids: {}, summary: 'Done.' };
  },
};

function session() {
  ran.length = 0;
  let id = 0;
  return new PrompterSession({
    transport: httpTransport(server.url),
    system: buildSystem({ storyApi: 'class Scene', backstage: 'Cast: cat' }) as unknown as Json[],
    tools: TOOLS as unknown as Json[],
    runner,
    newId: () => `r${++id}`,
  });
}

const build: AskOptions = { mode: 'buildIt', level: 'full', agreedPlan: { steps: [] } };
const explain: AskOptions = { mode: 'explain', level: 'full' };
const text = (t: string) => ({ events: reply([{ type: 'text', text: t }]) });
const withTurns = (base: Recording, ...turns: Recording['turns']): Recording => ({
  ...base,
  turns: [...base.turns, ...turns],
});

describe('the conversation loop against the fake server', () => {
  it('runs a tool loop, and the server accepts every request', async () => {
    server.use(recording('tool-loop'));
    const prompter = session();
    expect(await prompter.ask('add a cat', build)).toMatchObject({
      status: 'done',
      toolCalls: 1,
      changes: 1,
    });
    expect(ran).toEqual(['add_model']);
    expect(server.requests).toHaveLength(2);
  });

  it('carries on after a refusal, taking back only what came after the last kept reply', async () => {
    server.use(
      withTurns(
        { ...recording('refusal-mid-stream'), turns: [text('Hello.')] },
        ...recording('refusal-mid-stream').turns,
      ),
    );
    const prompter = session();
    await prompter.ask('hi', explain);
    expect(await prompter.ask('a gory story', { mode: 'storyCoach', level: 'full' })).toMatchObject(
      {
        status: 'refused',
      },
    );
    expect(await prompter.ask('a chase instead', explain)).toMatchObject({ status: 'done' });
  });

  it('carries on after a reply cut off by max_tokens, having run nothing', async () => {
    server.use(recording('cut-tool-input'));
    const prompter = session();
    expect(await prompter.ask('add a cat', build)).toMatchObject({ status: 'cut_short' });
    expect(ran).toEqual([]);
    expect(await prompter.ask('carry on', build)).toMatchObject({ status: 'done' });
  });

  it('carries on after a fallback, echoing the reply as the server expects', async () => {
    server.use(recording('fallback'));
    const prompter = session();
    await prompter.ask('hi', explain);
    expect(await prompter.ask('and next?', explain)).toMatchObject({ status: 'done' });
  });

  it('starts a fresh conversation past the limit, which the server takes as a new one', async () => {
    server.use(withTurns(recording('over-the-limit'), text('A fresh start.')));
    const prompter = session();
    await prompter.ask('a long chat', explain);
    expect(await prompter.ask('next', explain)).toMatchObject({ status: 'done', fresh: true });
    const [, second] = server.requests;
    expect((second!.body.messages as Json[]).length).toBe(2);
  });

  it('sends the fallback beta, and never a key', async () => {
    server.use(recording('text'));
    await session().ask('hi', explain);
    expect(server.requests[0]).toMatchObject({
      beta: 'server-side-fallback-2026-07-01',
      hadKey: false,
    });
  });

  it('turns HTTP errors into outcomes the panel can show', async () => {
    for (const [id, code] of [
      ['bad-key', 'key_revoked'],
      ['no-credit', 'no_credit'],
      ['overloaded', 'overloaded'],
    ] as const) {
      server.use(recording(id));
      expect(await session().ask('hi', explain)).toMatchObject({ status: 'error', code });
    }
  });
});
