/**
 * What the fake server refuses, so a client bug fails here rather than in a lesson. API rules
 * answer as the Messages API does. Rules that come from `CLAUDE.md` rather than the API answer
 * with the `fake_claude_rule` type, so a test can tell them apart.
 */
import { containsSecret, type JsonObject } from '@storystage/prompter';

export interface Refusal {
  readonly status: number;
  readonly type: string;
  readonly message: string;
}

const invalid = (message: string): Refusal => ({
  status: 400,
  type: 'invalid_request_error',
  message,
});
const rule = (message: string): Refusal => ({ status: 400, type: 'fake_claude_rule', message });

const MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
const NO_FORCED_TOOLS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
const DEFAULT_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

type Message = { readonly role?: unknown; readonly content?: unknown };
type Block = { readonly type?: unknown; readonly id?: unknown; readonly tool_use_id?: unknown };

const blocksOf = (m: Message): readonly Block[] =>
  Array.isArray(m.content) ? (m.content as Block[]) : [];

/** JSON with sorted keys, so two copies of a message compare by value. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

function checkMessages(messages: readonly Message[]): Refusal | null {
  if (messages.length === 0) return invalid('messages: at least one message is required');
  if (messages[0]?.role !== 'user') return invalid('messages: the first message must be user');
  if (messages.at(-1)?.role === 'assistant')
    return invalid('This model does not support assistant message prefill.');

  for (const [i, message] of messages.entries()) {
    if (message.role === 'system') {
      if (messages[i - 1]?.role !== 'user')
        return invalid(`messages.${i}: a system message must follow a user message`);
      const next = messages[i + 1];
      if (next && next.role !== 'assistant')
        return invalid(`messages.${i}: a system message must be last or precede an assistant turn`);
    }
    if (message.role === 'assistant') {
      const uses = blocksOf(message).filter((b) => b.type === 'tool_use');
      if (uses.length === 0) continue;
      const reply = messages.slice(i + 1).find((m) => m.role === 'user');
      const answered = new Set(reply ? blocksOf(reply).map((b) => b.tool_use_id) : []);
      const missing = uses.find((u) => !answered.has(u.id));
      if (missing)
        return invalid(`messages.${i}: tool_use ${String(missing.id)} has no tool_result after it`);
    }
    for (const block of blocksOf(message))
      if (block.type === 'image') return rule('Pictures never go to the Prompter (rule 3).');
  }
  return null;
}

/** Refuses a request as the API would, or returns null if it would be accepted. */
export function checkRequest(body: JsonObject, betaHeader: string | undefined): Refusal | null {
  if (containsSecret(body)) return rule('A key must never be in a request body (rule 1).');
  if (body.stream !== true) return rule('Every Prompter request streams (spec 04, section 1.2).');

  const model = body.model;
  if (typeof model !== 'string' || !MODELS.has(model))
    return { status: 404, type: 'not_found_error', message: `model: ${String(model)}` };
  if (typeof body.max_tokens !== 'number' || body.max_tokens < 1)
    return invalid('max_tokens: a positive number is required');

  for (const sampling of ['temperature', 'top_p', 'top_k'])
    if (sampling in body) return invalid(`${sampling}: not supported for this model`);

  const thinking = body.thinking as { type?: string } | undefined;
  if (thinking && thinking.type !== 'adaptive')
    return invalid(`"thinking.type.${thinking.type}" is not supported for this model.`);

  const toolChoice = body.tool_choice as { type?: string } | undefined;
  if (NO_FORCED_TOOLS.has(model) && (toolChoice?.type === 'any' || toolChoice?.type === 'tool'))
    return invalid(`tool_choice: type "${toolChoice.type}" is not supported for this model.`);

  if ('fallbacks' in body) {
    if (!FALLBACK_MODELS.has(model)) return invalid('fallbacks: not supported for this model');
    const betas = (betaHeader ?? '').split(',').map((b) => b.trim());
    if (body.fallbacks === 'default' && !betas.includes(DEFAULT_FALLBACK_BETA))
      return invalid(`fallbacks: requires the ${DEFAULT_FALLBACK_BETA} beta`);
  }

  return checkMessages(body.messages as readonly Message[]);
}

/** The blocks of a reply a client must send back (spec 04, section 1.4). */
export function echoOf(content: readonly JsonObject[]): JsonObject[] {
  const boundary = content.map((b) => b.type).lastIndexOf('fallback');
  const dropped = new Set(['thinking', 'redacted_thinking', 'tool_use', 'fallback']);
  return content.filter(
    (b, i) => b.type !== 'fallback' && (i > boundary || !dropped.has(String(b.type))),
  );
}

export interface ConversationState {
  readonly system: string;
  readonly tools: string;
  /** Everything a following request must start with. */
  readonly prefix: readonly JsonObject[];
  readonly first: string;
}

const withoutFallbacks = (message: JsonObject): JsonObject =>
  Array.isArray(message.content)
    ? {
        ...message,
        content: (message.content as JsonObject[]).filter((b) => b.type !== 'fallback'),
      }
    : message;

/**
 * The preserved-thinking check (spec 04, section 1.5): within a conversation `system` and `tools`
 * are unchanged and `messages` only grows. The fake runs it on every request, on every account.
 */
export function checkAppendOnly(body: JsonObject, last: ConversationState | null): Refusal | null {
  const messages = body.messages as readonly JsonObject[];
  if (!last || canonical(messages[0]) !== last.first) return null;
  const bound = 'messages.0.content.0: Invalid `signature` in `thinking` block.';
  const different = 'The block is bound to a different conversation.';
  if (canonical(body.system) !== last.system || canonical(body.tools) !== last.tools)
    return invalid(`${bound} ${different} system or tools changed.`);
  for (const [i, expected] of last.prefix.entries()) {
    const sent = messages[i];
    if (!sent || canonical(withoutFallbacks(sent)) !== canonical(withoutFallbacks(expected)))
      return invalid(`${bound} ${different} The first message that changed is messages.${i}.`);
  }
  return null;
}
