import { describe, expect, it } from 'vitest';
import { tauriTransport } from './tauri-transport.ts';
import type { PrompterEvent, PrompterRequest } from './transport.ts';

/** Tauri's Channel, as far as the transport uses it. */
class FakeChannel {
  onmessage: (message: unknown) => void = () => {};
}

const request: PrompterRequest = {
  id: 'r1',
  mode: 'explain',
  body: { model: 'claude-opus-5-5', max_tokens: 16000, messages: [] },
};

/**
 * A native layer: `prompter_send` replays `messages` on the channel, one at a time, after the
 * command itself has returned, as Tauri may deliver them.
 */
function native(messages: unknown[] = [], options: { fail?: string; hold?: boolean } = {}) {
  const calls: [string, unknown][] = [];
  let channel: FakeChannel | null = null;
  const deliver = async (from = 0) => {
    for (const m of messages.slice(from)) {
      await new Promise((r) => setTimeout(r, 0));
      channel?.onmessage(m);
    }
  };
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    calls.push([command, args]);
    if (command === options.fail) throw new Error('no such command');
    if (command === 'prompter_send') {
      channel = args!.channel as FakeChannel;
      if (!options.hold) void deliver();
      return null;
    }
    if (command === 'prompter_status') return { available: true };
    return null;
  };
  return { invoke, calls, deliver };
}

async function collect(stream: AsyncIterable<PrompterEvent>, take = Infinity) {
  const out: PrompterEvent[] = [];
  for await (const event of stream) {
    out.push(event);
    if (out.length >= take) break;
  }
  return out;
}

const delta = { type: 'event', event: { type: 'content_block_delta' } };

describe('tauriTransport (spec 04, section 1.1)', () => {
  it("streams the native layer's events in order, ending at end, even after the command returns", async () => {
    const n = native([delta, delta, { type: 'end' }, delta]);
    const events = await collect(tauriTransport(n.invoke, FakeChannel).send(request));
    expect(events).toEqual([delta, delta, { type: 'end' }]);
    expect(n.calls[0]![0]).toBe('prompter_send');
    expect((n.calls[0]![1] as { request: unknown }).request).toBe(request);
  });

  it('passes on an error with its retry time, and ends there', async () => {
    const n = native([{ type: 'error', code: 'rate_limited', retryAfterSeconds: 20 }, delta]);
    expect(await collect(tauriTransport(n.invoke, FakeChannel).send(request))).toEqual([
      { type: 'error', code: 'rate_limited', retryAfterSeconds: 20 },
    ]);
  });

  it('ends as internal on anything that is not an event, or a command that fails', async () => {
    const odd = native([{ type: 'error', code: 'something_new' }]);
    expect(await collect(tauriTransport(odd.invoke, FakeChannel).send(request))).toEqual([
      { type: 'error', code: 'internal' },
    ]);
    const failed = native([], { fail: 'prompter_send' });
    expect(await collect(tauriTransport(failed.invoke, FakeChannel).send(request))).toEqual([
      { type: 'error', code: 'internal' },
    ]);
  });

  it('never hands over a request with anything like a key in it', async () => {
    const n = native([{ type: 'end' }]);
    const leaky = { ...request, body: { ...request.body, api_key: 'x' } } as PrompterRequest;
    expect(await collect(tauriTransport(n.invoke, FakeChannel).send(leaky))).toEqual([
      { type: 'error', code: 'refused_by_policy' },
    ]);
    expect(n.calls).toEqual([]);
  });

  it('stops: cancels the request by its id, and ends at once with cancelled', async () => {
    const n = native([delta, { type: 'end' }], { hold: true });
    const stop = new AbortController();
    const stream = tauriTransport(n.invoke, FakeChannel).send(request, stop.signal);
    const reading = collect(stream);
    await new Promise((r) => setTimeout(r, 0));
    stop.abort();
    expect(await reading).toEqual([{ type: 'error', code: 'cancelled' }]);
    expect(n.calls).toContainEqual(['prompter_cancel', { id: 'r1' }]);
  });

  it('cancels the native request when whoever reads it stops early', async () => {
    const n = native([delta, delta, { type: 'end' }]);
    await collect(tauriTransport(n.invoke, FakeChannel).send(request), 1);
    expect(n.calls).toContainEqual(['prompter_cancel', { id: 'r1' }]);
  });

  it("gives the native layer's status, and an unreadable one as internal", async () => {
    expect(await tauriTransport(native().invoke, FakeChannel).status()).toEqual({
      available: true,
    });
    const off = tauriTransport(async () => ({ available: false, reason: 'no_key' }), FakeChannel);
    expect(await off.status()).toEqual({ available: false, reason: 'no_key' });
    const odd = tauriTransport(async () => 'yes', FakeChannel);
    expect(await odd.status()).toEqual({ available: false, reason: 'internal' });
    const missing = tauriTransport(native([], { fail: 'prompter_status' }).invoke, FakeChannel);
    expect(await missing.status()).toEqual({ available: false, reason: 'internal' });
  });
});
