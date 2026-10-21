/**
 * WP0.8 contract: the Prompter transport. `packages/prompter` builds each request in TypeScript
 * **without the key** and hands it to a transport. In the Tauri apps the transport is the native
 * layer (`apps/desktop`, WP15.2), which checks the request against the policy enforcement point,
 * adds the key from the OS secure store and streams the reply back. The browser version has no
 * transport: the Prompter is off (decision 0022).
 *
 * Owners: S7 (this file, `packages/prompter`) and S8 (the native side). A change here is a
 * `contract` pull request reviewed by both.
 */

export type Json =
  null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type JsonObject = { readonly [key: string]: Json };

/** The Prompter's modes (WP13.5) and the script check (WP24.3). The native layer picks the allowed model per mode. */
export const PROMPTER_MODES = [
  'explain',
  'showMeHow',
  'buildIt',
  'storyCoach',
  'scriptCheck',
] as const;
export type PrompterMode = (typeof PROMPTER_MODES)[number];

export interface PrompterRequest {
  /** Unique per request, so it can be cancelled and matched in logs. */
  readonly id: string;
  readonly mode: PrompterMode;
  /**
   * A Messages API request body (model, max_tokens, system, tools, messages, stream: true).
   * Never a key or an auth header: the native layer adds those, and refuses a body that has them.
   */
  readonly body: JsonObject & {
    readonly model: string;
    readonly max_tokens: number;
    readonly messages: readonly Json[];
  };
}

/**
 * Why a request couldn't be made or finished, one code per cause (WP15.2). The panel shows a
 * plain-words message chosen from the code (StoryStage 1 spec 01 §5, carried over).
 */
export const TRANSPORT_ERROR_CODES = [
  'prompter_off',
  'offline',
  'no_key',
  'key_revoked',
  'no_credit',
  'rate_limited',
  'overloaded',
  'refused_by_policy',
  'refused_by_allowlist',
  'cap_reached',
  'cancelled',
  'internal',
] as const;
export type TransportErrorCode = (typeof TRANSPORT_ERROR_CODES)[number];

export type PrompterEvent =
  /** One server-sent event from the Messages API stream, parsed (`message_start`, `content_block_delta`, …). */
  | { readonly type: 'event'; readonly event: JsonObject }
  | {
      readonly type: 'error';
      readonly code: TransportErrorCode;
      readonly retryAfterSeconds?: number;
    }
  /** The stream finished normally. After `end` or `error`, nothing else arrives. */
  | { readonly type: 'end' };

export type TransportStatus =
  { readonly available: true } | { readonly available: false; readonly reason: TransportErrorCode };

export interface PrompterTransport {
  /** Whether the Prompter can be used now (key present, policy allows it, online as far as known). */
  status(): Promise<TransportStatus>;
  /** Sends one request. Ends with exactly one `end` or `error`. Aborting gives `error: cancelled`. */
  send(request: PrompterRequest, signal?: AbortSignal): AsyncIterable<PrompterEvent>;
}

/**
 * The Tauri commands the native layer provides. `prompter_send` takes `{ request, channel }`
 * (a Tauri `Channel<PrompterEvent>`) and streams events on the channel; `prompter_cancel`
 * takes `{ id }`; `prompter_status` returns a `TransportStatus`. Nothing key-related is ever
 * returned to the webview.
 */
export const NATIVE_COMMANDS = {
  send: 'prompter_send',
  cancel: 'prompter_cancel',
  status: 'prompter_status',
} as const;

/** Anything that looks like an Anthropic API key, an auth header, or a key field. */
const SECRET_TEXT = /sk-ant-[A-Za-z0-9_-]{8,}/;
const SECRET_KEYS = new Set([
  'x-api-key',
  'authorization',
  'api_key',
  'apikey',
  'anthropic_api_key',
]);

/**
 * True if a value contains something that must never leave the webview (CLAUDE.md rule 1).
 * Transports refuse such a request before sending it; the native layer checks again.
 */
export function containsSecret(value: unknown): boolean {
  if (typeof value === 'string') return SECRET_TEXT.test(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (typeof value === 'object' && value !== null)
    return Object.entries(value).some(
      ([k, v]) => SECRET_KEYS.has(k.toLowerCase()) || containsSecret(v),
    );
  return false;
}

/** The browser version's transport: the Prompter is off. */
export const offTransport: PrompterTransport = {
  status: async () => ({ available: false, reason: 'prompter_off' }),
  async *send() {
    yield { type: 'error', code: 'prompter_off' };
  },
};

/**
 * A transport that replays scripted events, for unit tests. (Tests of the whole request loop
 * use `tools/fake-claude`, WP13.7.) It refuses requests containing a secret, like a real one.
 */
export function scriptedTransport(
  script: (request: PrompterRequest) => readonly PrompterEvent[],
): PrompterTransport & {
  readonly sent: PrompterRequest[];
} {
  const sent: PrompterRequest[] = [];
  return {
    sent,
    status: async () => ({ available: true }),
    async *send(request, signal) {
      if (containsSecret(request)) {
        yield { type: 'error', code: 'refused_by_policy' };
        return;
      }
      sent.push(request);
      for (const event of script(request)) {
        if (signal?.aborted) {
          yield { type: 'error', code: 'cancelled' };
          return;
        }
        await Promise.resolve();
        yield event;
        if (event.type !== 'event') return;
      }
    },
  };
}
