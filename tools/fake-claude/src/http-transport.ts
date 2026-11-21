/**
 * A `PrompterTransport` over HTTP: to the fake server in tests, or the live API in a live
 * evaluation run (`eval/live.ts`). It does what the native
 * layer will do (WP15.2): send the body, add the beta header, and turn each HTTP status into one
 * error code (spec 04, section 7). It makes no retries, and adds a key only when given one.
 */
import {
  containsSecret,
  type JsonObject,
  type PrompterEvent,
  type PrompterTransport,
  type TransportErrorCode,
} from '@storystage/prompter';

export function codeForStatus(status: number): TransportErrorCode {
  if (status === 401 || status === 403) return 'key_revoked';
  if (status === 402) return 'no_credit';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'overloaded';
  return 'internal';
}

/** Splits a server-sent stream into events, keeping any unfinished one for the next chunk. */
export function splitEvents(buffer: string): { events: JsonObject[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const events = parts.flatMap((part) => {
    const data = part.split('\n').find((line) => line.startsWith('data: '));
    return data ? [JSON.parse(data.slice('data: '.length)) as JsonObject] : [];
  });
  return { events, rest };
}

/**
 * `headers` are added to each request: a live run passes the key and the API version here
 * (`eval/live.ts`). The fake server needs none.
 */
export function httpTransport(
  baseUrl: string,
  headers: Readonly<Record<string, string>> = {},
): PrompterTransport {
  return {
    status: async () => ({ available: true }),
    async *send(request, signal): AsyncGenerator<PrompterEvent> {
      if (containsSecret(request)) {
        yield { type: 'error', code: 'refused_by_policy' };
        return;
      }
      try {
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...headers,
            ...(request.betas?.length ? { 'anthropic-beta': request.betas.join(',') } : {}),
          },
          body: JSON.stringify(request.body),
          ...(signal ? { signal } : {}),
        });
        if (!response.ok || !response.body) {
          const retryAfter = Number(response.headers.get('retry-after'));
          // The API's error body says what was wrong; it holds no key, which goes only in a header.
          const text = await response.text().catch(() => '');
          let message = '';
          try {
            message = String(
              (JSON.parse(text) as { error?: { message?: unknown } }).error?.message ?? '',
            );
          } catch {
            message = '';
          }
          yield {
            type: 'error',
            code: codeForStatus(response.status),
            ...(retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
            ...(message
              ? { detail: { status: response.status, message: message.slice(0, 500) } }
              : {}),
          };
          return;
        }
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk, { stream: true });
          const { events, rest } = splitEvents(buffer);
          buffer = rest;
          for (const event of events) yield { type: 'event', event };
        }
        yield { type: 'end' };
      } catch {
        yield { type: 'error', code: signal?.aborted ? 'cancelled' : 'offline' };
      }
    },
  };
}
