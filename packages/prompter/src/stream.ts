/**
 * Puts a streamed reply back together (`docs/spec/04-prompter.md` sections 1.2, 1.4 and 1.6).
 * Blocks are kept exactly as they came, including thinking blocks with empty text, because the
 * conversation sends them back unchanged.
 */
import type { JsonObject } from './transport.ts';

export interface AssembledReply {
  /** The reply's blocks, in order. */
  readonly content: readonly JsonObject[];
  /** `null` if the stream ended before saying why it stopped. */
  readonly stopReason: string | null;
  /** The model that produced the message, which a fallback can change. */
  readonly model: string | null;
  /** Everything the request read, cached or not: what the conversation limit counts. */
  readonly inputTokens: number;
  /** `tool_use` ids whose input wasn't valid JSON, with the text that came. */
  readonly badInputs: ReadonlyMap<string, string>;
}

type Block = Record<string, unknown>;
const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

function readInputTokens(usage: unknown): number | null {
  const u = asObject(usage);
  if (!('input_tokens' in u)) return null;
  return num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens);
}

export class ReplyAssembler {
  readonly #blocks: Block[] = [];
  readonly #partial = new Map<number, string>();
  readonly #badInputs = new Map<string, string>();
  readonly #onText: ((text: string) => void) | undefined;
  #stopReason: string | null = null;
  #model: string | null = null;
  #inputTokens = 0;

  /** `onText` hears reply text as it streams, for the panel. */
  constructor(onText?: (text: string) => void) {
    this.#onText = onText;
  }

  add(event: JsonObject): void {
    const index = typeof event.index === 'number' ? event.index : -1;
    switch (event.type) {
      case 'message_start': {
        const message = asObject(event.message);
        if (typeof message.model === 'string') this.#model = message.model;
        this.#inputTokens = readInputTokens(message.usage) ?? this.#inputTokens;
        break;
      }
      case 'content_block_start':
        this.#blocks[index] = { ...asObject(event.content_block) };
        break;
      case 'content_block_delta': {
        const block = this.#blocks[index];
        const delta = asObject(event.delta);
        if (!block) break;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          block.text = `${typeof block.text === 'string' ? block.text : ''}${delta.text}`;
          this.#onText?.(delta.text);
        } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          block.thinking = `${typeof block.thinking === 'string' ? block.thinking : ''}${delta.thinking}`;
        } else if (delta.type === 'signature_delta' && typeof delta.signature === 'string') {
          block.signature = delta.signature;
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          this.#partial.set(index, (this.#partial.get(index) ?? '') + delta.partial_json);
        }
        break;
      }
      case 'content_block_stop':
        this.#finishInput(index);
        break;
      case 'message_delta': {
        const delta = asObject(event.delta);
        if (typeof delta.stop_reason === 'string') this.#stopReason = delta.stop_reason;
        this.#inputTokens = readInputTokens(event.usage) ?? this.#inputTokens;
        break;
      }
    }
  }

  /** A tool's input is parsed strictly once its block ends, never by a tolerant parser. */
  #finishInput(index: number): void {
    const block = this.#blocks[index];
    if (!block || block.type !== 'tool_use' || !this.#partial.has(index)) return;
    const raw = this.#partial.get(index) ?? '';
    this.#partial.delete(index);
    try {
      block.input = raw === '' ? {} : (JSON.parse(raw) as unknown);
    } catch {
      block.input = {};
      this.#badInputs.set(String(block.id), raw);
    }
  }

  result(): AssembledReply {
    for (const index of [...this.#partial.keys()]) this.#finishInput(index);
    return {
      content: this.#blocks.filter(Boolean) as JsonObject[],
      stopReason: this.#stopReason,
      model: this.#model,
      inputTokens: this.#inputTokens,
      badInputs: this.#badInputs,
    };
  }
}

const BEFORE_FALLBACK = new Set(['thinking', 'redacted_thinking', 'tool_use']);

/**
 * The blocks to send back (spec 04, section 1.4). Before the last `fallback` block, thinking and
 * tool calls are left out, because the model that made them stopped; text stays. The `fallback`
 * markers themselves are left out. Everything else goes back exactly as it came.
 */
export function echoContent(content: readonly JsonObject[]): JsonObject[] {
  const boundary = content.map((b) => b.type).lastIndexOf('fallback');
  return content.filter(
    (block, i) =>
      block.type !== 'fallback' && (i > boundary || !BEFORE_FALLBACK.has(String(block.type))),
  );
}
