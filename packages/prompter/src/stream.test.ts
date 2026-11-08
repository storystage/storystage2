import { describe, expect, it } from 'vitest';
import { ReplyAssembler, echoContent } from './stream.ts';
import { testReply, type TestBlock } from './testing.ts';
import type { JsonObject } from './transport.ts';

function assemble(blocks: readonly TestBlock[], options = {}, onText?: (t: string) => void) {
  const assembler = new ReplyAssembler(onText);
  for (const e of testReply(blocks, options)) if (e.type === 'event') assembler.add(e.event);
  return assembler.result();
}

describe('ReplyAssembler', () => {
  it('keeps thinking blocks exactly, empty text and all', () => {
    const reply = assemble([
      { type: 'thinking', signature: 'abc' },
      { type: 'text', text: 'Hello.' },
    ]);
    expect(reply.content).toEqual([
      { type: 'thinking', thinking: '', signature: 'abc' },
      { type: 'text', text: 'Hello.' },
    ]);
    expect(reply.stopReason).toBe('end_turn');
  });

  it('streams text to the panel as it arrives', () => {
    const parts: string[] = [];
    assemble([{ type: 'text', text: 'The cat walks.' }], {}, (t) => parts.push(t));
    expect(parts.length).toBe(2);
    expect(parts.join('')).toBe('The cat walks.');
  });

  it('parses a tool call only when its block ends', () => {
    const input = { frame: 'f2-3' };
    const reply = assemble([{ type: 'tool_use', id: 't1', name: 'code_frame', input }]);
    expect(reply.content).toEqual([{ type: 'tool_use', id: 't1', name: 'code_frame', input }]);
    expect(reply.stopReason).toBe('tool_use');
    expect(reply.badInputs.size).toBe(0);
  });

  it('marks input that is not valid JSON, rather than guessing', () => {
    const reply = assemble([
      { type: 'tool_use', id: 't1', name: 'explain', input: null, raw: '{"text": "half' },
    ]);
    expect(reply.badInputs.get('t1')).toBe('{"text": "half');
    expect(reply.content[0]).toMatchObject({ input: {} });
  });

  it('counts every input token, cached or not, for the conversation limit', () => {
    const assembler = new ReplyAssembler();
    assembler.add({
      type: 'message_start',
      message: {
        model: 'claude-opus-5-5',
        usage: {
          input_tokens: 10,
          cache_read_input_tokens: 90_000,
          cache_creation_input_tokens: 500,
        },
      },
    });
    expect(assembler.result().inputTokens).toBe(90_510);
  });

  it('reports the model that served the reply, and no stop reason if the stream ended early', () => {
    const reply = assemble([{ type: 'text', text: 'Hi' }], {
      model: 'claude-opus-5',
      stopReason: null,
    });
    expect(reply.model).toBe('claude-opus-5');
    expect(reply.stopReason).toBeNull();
  });
});

describe('echoContent (spec 04, section 1.4)', () => {
  const block = (type: string, extra: JsonObject = {}): JsonObject => ({ type, ...extra });

  it('sends a reply with no fallback back exactly', () => {
    const content = [
      block('thinking', { signature: 's' }),
      block('text', { text: 'a' }),
      block('tool_use', { id: 't' }),
    ];
    expect(echoContent(content)).toEqual(content);
  });

  it('drops thinking and tool calls before the last fallback, and the markers', () => {
    const content = [
      block('thinking'),
      block('text', { text: 'Let me ' }),
      block('tool_use', { id: 't0' }),
      block('fallback'),
      block('redacted_thinking'),
      block('fallback'),
      block('thinking', { signature: 'kept' }),
      block('text', { text: 'help.' }),
      block('tool_use', { id: 't1' }),
    ];
    expect(echoContent(content)).toEqual([
      block('text', { text: 'Let me ' }),
      block('thinking', { signature: 'kept' }),
      block('text', { text: 'help.' }),
      block('tool_use', { id: 't1' }),
    ]);
  });
});
