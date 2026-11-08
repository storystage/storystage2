/**
 * A `PrompterTransport` over HTTP, for tests against the fake server. It does what the native
 * layer will do (WP15.2): send the body, add the beta header, and turn each HTTP status into one
 * error code (spec 04, section 7). It adds no key and makes no retries.
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

export function httpTransport(baseUrl: string): PrompterTransport {
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
            ...(request.betas?.length ? { 'anthropic-beta': request.betas.join(',') } : {}),
          },
          body: JSON.stringify(request.body),
          ...(signal ? { signal } : {}),
        });
        if (!response.ok || !response.body) {
          const retryAfter = Number(response.headers.get('retry-after'));
          await response.body?.cancel();
          yield {
            type: 'error',
            code: codeForStatus(response.status),
            ...(retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
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
