/**
 * A recording: what the server says, in order, for one conversation. Hand-written ones
 * (`source: 'synthetic'`) cover each protocol path. Real ones (`source: 'recorded'`) are made by
 * the owner with a live key, scrubbed and reviewed before commit (WP13.7).
 */
import type { JsonObject } from '@storystage/prompter';

export interface Turn {
  /** HTTP status. Default 200. */
  readonly status?: number;
  /** Server-sent events, each with its `type`, for a 200. */
  readonly events?: readonly JsonObject[];
  /** Close the connection after this many events, as a dropped network does. */
  readonly cutAfter?: number;
  /** The error body for a status other than 200. */
  readonly error?: { readonly type: string; readonly message: string };
  /** The `retry-after` header, in seconds. */
  readonly retryAfter?: number;
}

export interface Recording {
  readonly id: string;
  readonly source: 'synthetic' | 'recorded';
  /** What this recording is for. */
  readonly note: string;
  /** Text to find in the first message, when a server holds several recordings. */
  readonly match?: string;
  readonly turns: readonly Turn[];
}

export type Block =
  | { readonly type: 'thinking'; readonly signature?: string }
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'fallback'; readonly from: string; readonly to: string }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      readonly input: JsonObject;
    };

export interface ReplyOptions {
  readonly stopReason?: string;
  readonly model?: string;
  readonly inputTokens?: number;
  /** Stop a tool's input after this many characters, as `max_tokens` does mid-parameter. */
  readonly cutToolInputAt?: number;
  readonly stopDetails?: JsonObject;
}

function* blockEvents(block: Block, index: number, cutAt?: number): Generator<JsonObject> {
  switch (block.type) {
    case 'thinking':
      yield {
        type: 'content_block_start',
        index,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      };
      yield {
        type: 'content_block_delta',
        index,
        delta: { type: 'signature_delta', signature: block.signature ?? `sig-${index}` },
      };
      break;
    case 'text':
      yield { type: 'content_block_start', index, content_block: { type: 'text', text: '' } };
      yield { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } };
      break;
    case 'fallback':
      yield {
        type: 'content_block_start',
        index,
        content_block: {
          type: 'fallback',
          from: { model: block.from },
          to: { model: block.to },
        },
      };
      break;
    case 'tool_use': {
      const json = JSON.stringify(block.input);
      yield {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
      };
      yield {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: json.slice(0, cutAt) },
      };
      break;
    }
  }
  yield { type: 'content_block_stop', index };
}

/** The server-sent events for one reply, in the Messages API's order. */
export function reply(blocks: readonly Block[], options: ReplyOptions = {}): JsonObject[] {
  const {
    stopReason = blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
    model = 'claude-opus-5-5',
    inputTokens = 1200,
    cutToolInputAt,
    stopDetails,
  } = options;
  return [
    {
      type: 'message_start',
      message: {
        id: 'msg_fake',
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        usage: { input_tokens: inputTokens, output_tokens: 1 },
      },
    },
    ...blocks.flatMap((b, i) => [...blockEvents(b, i, cutToolInputAt)]),
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, ...(stopDetails ? { stop_details: stopDetails } : {}) },
      usage: { output_tokens: 40 },
    },
    { type: 'message_stop' },
  ];
}

/** Puts a reply's blocks back together from its events, as a client does. */
export function assemble(events: readonly JsonObject[]): {
  readonly content: JsonObject[];
  readonly stopReason: string | null;
} {
  const blocks: Record<string, unknown>[] = [];
  const partial = new Map<number, string>();
  let stopReason: string | null = null;
  for (const event of events) {
    const index = typeof event.index === 'number' ? event.index : -1;
    if (event.type === 'content_block_start') {
      blocks[index] = { ...(event.content_block as JsonObject) };
    } else if (event.type === 'content_block_delta') {
      const delta = event.delta as Record<string, string>;
      const block = blocks[index];
      if (!block) continue;
      if (delta.type === 'text_delta') block.text = `${String(block.text)}${delta.text}`;
      if (delta.type === 'signature_delta') block.signature = delta.signature;
      if (delta.type === 'input_json_delta')
        partial.set(index, (partial.get(index) ?? '') + delta.partial_json);
    } else if (event.type === 'message_delta') {
      stopReason = (event.delta as { stop_reason?: string }).stop_reason ?? null;
    }
  }
  for (const [index, json] of partial) {
    const block = blocks[index];
    if (!block) continue;
    try {
      block.input = JSON.parse(json);
    } catch {
      block.input = {};
    }
  }
  return { content: blocks as JsonObject[], stopReason };
}
