import { describe, expect, it } from 'vitest';
import {
  containsSecret,
  offTransport,
  scriptedTransport,
  type PrompterEvent,
  type PrompterRequest,
  type PrompterTransport,
} from './transport.ts';

// Built at run time so no key-shaped text sits in the repository (CLAUDE.md rule 1).
const FAKE_KEY = ['sk', 'ant', 'api03', 'x'.repeat(16)].join('-');

const request: PrompterRequest = {
  id: 'r1',
  mode: 'explain',
  body: {
    model: 'claude-opus-5-5',
    max_tokens: 1000,
    stream: true,
    messages: [{ role: 'user', content: 'What does this block do?' }],
  },
};

async function collect(t: PrompterTransport, r: PrompterRequest, signal?: AbortSignal) {
  const out: PrompterEvent[] = [];
  for await (const e of t.send(r, signal)) out.push(e);
  return out;
}

describe('containsSecret', () => {
  it('finds a key anywhere in a request, and key-shaped fields', () => {
    expect(containsSecret(request)).toBe(false);
    const leaked = {
      ...request,
      body: { ...request.body, messages: [{ role: 'user', content: `my key is ${FAKE_KEY}` }] },
    };
    expect(containsSecret(leaked)).toBe(true);
    expect(containsSecret({ headers: { 'X-Api-Key': 'anything' } })).toBe(true);
    expect(containsSecret({ api_key: '' })).toBe(true);
  });

  it('leaves ordinary text alone', () => {
    expect(containsSecret('Ask the sk-ant- question later')).toBe(false);
    expect(containsSecret({ text: 'key frame', count: 3, ok: null })).toBe(false);
  });
});

describe('offTransport (browser version)', () => {
  it('says the Prompter is off, and ends every request with that error', async () => {
    expect(await offTransport.status()).toEqual({ available: false, reason: 'prompter_off' });
    expect(await collect(offTransport, request)).toEqual([{ type: 'error', code: 'prompter_off' }]);
  });
});

describe('scriptedTransport', () => {
  const reply: PrompterEvent[] = [
    { type: 'event', event: { type: 'message_start' } },
    {
      type: 'event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'It moves the cat.' },
      },
    },
    { type: 'end' },
  ];

  it('streams the script in order and stops after end', async () => {
    const t = scriptedTransport(() => [...reply, { type: 'event', event: { type: 'never' } }]);
    expect(await collect(t, request)).toEqual(reply);
    expect(t.sent).toEqual([request]);
  });

  it('cancels when aborted', async () => {
    const t = scriptedTransport(() => reply);
    const abort = new AbortController();
    abort.abort();
    expect(await collect(t, request, abort.signal)).toEqual([{ type: 'error', code: 'cancelled' }]);
  });

  it('refuses a request with a key in it, and never records it', async () => {
    const t = scriptedTransport(() => reply);
    const leaked = { ...request, body: { ...request.body, system: FAKE_KEY } };
    expect(await collect(t, leaked)).toEqual([{ type: 'error', code: 'refused_by_policy' }]);
    expect(t.sent).toEqual([]);
  });
});
