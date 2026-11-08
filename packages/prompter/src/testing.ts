/**
 * Builds Messages API stream events for this package's tests. Tests of the whole loop over HTTP
 * use `tools/fake-claude`, which has its own builder.
 */
import type { JsonObject, PrompterEvent } from './transport.ts';

export type TestBlock =
  | { readonly type: 'thinking'; readonly signature?: string }
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'fallback'; readonly from: string; readonly to: string }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
      readonly raw?: string;
    };

export interface TestReplyOptions {
  readonly stopReason?: string | null;
  readonly inputTokens?: number;
  readonly model?: string;
}

function* eventsFor(block: TestBlock, index: number): Generator<JsonObject> {
  if (block.type === 'thinking') {
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
  } else if (block.type === 'text') {
    yield { type: 'content_block_start', index, content_block: { type: 'text', text: '' } };
    // Two pieces, so tests see text arrive in parts.
    const half = Math.ceil(block.text.length / 2);
    yield {
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text: block.text.slice(0, half) },
    };
    yield {
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text: block.text.slice(half) },
    };
  } else if (block.type === 'fallback') {
    yield {
      type: 'content_block_start',
      index,
      content_block: { type: 'fallback', from: { model: block.from }, to: { model: block.to } },
    };
  } else {
    yield {
      type: 'content_block_start',
      index,
      content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
    };
    const json = block.raw ?? JSON.stringify(block.input);
    yield {
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json: json.slice(0, 5) },
    };
    yield {
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json: json.slice(5) },
    };
  }
  yield { type: 'content_block_stop', index };
}

/** One reply as transport events, ending with `end`. */
export function testReply(
  blocks: readonly TestBlock[],
  options: TestReplyOptions = {},
): PrompterEvent[] {
  const stopReason =
    options.stopReason === undefined
      ? blocks.some((b) => b.type === 'tool_use')
        ? 'tool_use'
        : 'end_turn'
      : options.stopReason;
  const events: JsonObject[] = [
    {
      type: 'message_start',
      message: {
        model: options.model ?? 'claude-opus-5-5',
        usage: { input_tokens: options.inputTokens ?? 1000, cache_read_input_tokens: 0 },
      },
    },
    ...blocks.flatMap((b, i) => [...eventsFor(b, i)]),
    ...(stopReason === null
      ? []
      : [
          {
            type: 'message_delta',
            delta: { stop_reason: stopReason },
            usage: { output_tokens: 20 },
          },
        ]),
    { type: 'message_stop' },
  ];
  return [...events.map((event) => ({ type: 'event' as const, event })), { type: 'end' }];
}
