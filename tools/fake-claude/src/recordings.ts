/**
 * Hand-written recordings, one for each path through the protocol (spec 04, sections 1 and 7).
 * They prove the client handles what the API can do. They say nothing about how good the
 * Prompter's answers are: that takes real recordings, made with a live key (WP13.7).
 */
import { reply, type Block, type Recording } from './recording.ts';

const thought: Block = { type: 'thinking' };
const synthetic = (id: string, note: string, turns: Recording['turns']): Recording => ({
  id,
  source: 'synthetic',
  note,
  match: `recording:${id}`,
  turns,
});

const addCat = {
  backstage_item: 'Quadruped/Cat/AbyssinianCat',
  name: 'cat',
  position: { x: 0, y: 0, z: 0 },
  narration: 'A cat appears in the middle of your scene.',
  plan_step: 1,
};

export const RECORDINGS: readonly Recording[] = [
  synthetic('text', 'A plain answer, with an empty thinking block to keep.', [
    {
      events: reply([thought, { type: 'text', text: 'The move block makes something move.' }]),
    },
  ]),
  synthetic('tool-loop', 'A tool call, its result, then the summing up.', [
    {
      events: reply([
        thought,
        { type: 'tool_use', id: 'toolu_1', name: 'add_model', input: addCat },
      ]),
    },
    { events: reply([thought, { type: 'text', text: 'Your cat is in the scene.' }]) },
  ]),
  synthetic('parallel-tools', 'Two tool calls in one reply.', [
    {
      events: reply([
        thought,
        { type: 'tool_use', id: 'toolu_1', name: 'read_project', input: {} },
        { type: 'tool_use', id: 'toolu_2', name: 'add_model', input: addCat },
      ]),
    },
    { events: reply([{ type: 'text', text: 'Done.' }]) },
  ]),
  synthetic('cut-tool-input', 'max_tokens stops a tool input part way. No tool may run.', [
    {
      events: reply([{ type: 'tool_use', id: 'toolu_1', name: 'add_model', input: addCat }], {
        stopReason: 'max_tokens',
        cutToolInputAt: 40,
      }),
    },
    { events: reply([{ type: 'text', text: 'Carrying on.' }]) },
  ]),
  synthetic('refusal', 'Declined before any output, on every model.', [
    { events: reply([], { stopReason: 'refusal', stopDetails: { category: null } }) },
  ]),
  synthetic('refusal-mid-stream', 'Declined after a partial reply, which must be discarded.', [
    {
      events: reply([{ type: 'text', text: 'Here is a part of' }], {
        stopReason: 'refusal',
        stopDetails: { category: null },
      }),
    },
    { events: reply([{ type: 'text', text: 'Try a chase instead.' }]) },
  ]),
  synthetic('fallback', 'A fallback model takes over part way through a reply.', [
    {
      events: reply(
        [
          thought,
          { type: 'text', text: 'Let me ' },
          { type: 'fallback', from: 'claude-opus-5-5', to: 'claude-opus-5' },
          { type: 'text', text: 'help with that.' },
        ],
        { model: 'claude-opus-5' },
      ),
    },
    { events: reply([{ type: 'text', text: 'And the next part.' }]) },
  ]),
  synthetic('over-the-limit', 'A reply past the 100,000-token conversation limit.', [
    { events: reply([{ type: 'text', text: 'That was a long chat.' }], { inputTokens: 100_001 }) },
  ]),
  synthetic('bad-key', 'The key is invalid or revoked.', [
    {
      status: 401,
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    },
  ]),
  synthetic('no-credit', 'The account has run out of credit.', [
    {
      status: 402,
      error: { type: 'billing_error', message: 'credit balance too low' },
    },
  ]),
  synthetic('rate-limited', 'A rate limit, then success on the next try.', [
    {
      status: 429,
      retryAfter: 7,
      error: { type: 'rate_limit_error', message: 'rate limited' },
    },
    { events: reply([{ type: 'text', text: 'Thanks for waiting.' }]) },
  ]),
  synthetic('overloaded', 'The API is overloaded.', [
    { status: 529, error: { type: 'overloaded_error', message: 'overloaded' } },
  ]),
  synthetic('dropped-connection', 'The network goes during a reply.', [
    {
      events: reply([{ type: 'text', text: 'This reply never ends' }]),
      cutAfter: 3,
    },
  ]),
];

export const recording = (id: string): Recording => {
  const found = RECORDINGS.find((r) => r.id === id);
  if (!found) throw new Error(`No recording ${id}`);
  return found;
};
