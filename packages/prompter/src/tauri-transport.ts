/**
 * The Tauri apps' transport (`docs/spec/04-prompter.md` section 1.1, WP13.2): requests go to S8's
 * `prompter_send`, which checks them against the gate, adds the key and streams the reply back on
 * a Tauri `Channel`. The key never comes near this code (CLAUDE.md rule 1).
 */
import type { Invoke } from './setup.ts';
import {
  NATIVE_COMMANDS,
  TRANSPORT_ERROR_CODES,
  containsSecret,
  type PrompterEvent,
  type PrompterTransport,
  type TransportErrorCode,
  type TransportStatus,
} from './transport.ts';

/** Tauri's `Channel` class, passed in so this package has no Tauri in it. */
export type ChannelClass = new () => { onmessage: (message: unknown) => void };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isCode = (v: unknown): v is TransportErrorCode =>
  (TRANSPORT_ERROR_CODES as readonly unknown[]).includes(v);

/** The event as the contract has it, or `internal` for anything else. */
function asEvent(message: unknown): PrompterEvent {
  if (isObject(message)) {
    if (message.type === 'end') return { type: 'end' };
    if (message.type === 'event' && isObject(message.event))
      return { type: 'event', event: message.event as never };
    if (message.type === 'error' && isCode(message.code))
      return typeof message.retryAfterSeconds === 'number'
        ? { type: 'error', code: message.code, retryAfterSeconds: message.retryAfterSeconds }
        : { type: 'error', code: message.code };
  }
  return { type: 'error', code: 'internal' };
}

function asStatus(reply: unknown): TransportStatus {
  if (isObject(reply) && reply.available === true) return { available: true };
  if (isObject(reply) && reply.available === false && isCode(reply.reason))
    return { available: false, reason: reply.reason };
  return { available: false, reason: 'internal' };
}

export function tauriTransport(invoke: Invoke, Channel: ChannelClass): PrompterTransport {
  return {
    async status() {
      try {
        return asStatus(await invoke(NATIVE_COMMANDS.status));
      } catch {
        return { available: false, reason: 'internal' };
      }
    },

    async *send(request, signal) {
      // Checked here as well as in the native layer: such a request is never even handed over.
      if (containsSecret(request)) {
        yield { type: 'error', code: 'refused_by_policy' };
        return;
      }
      if (signal?.aborted) {
        yield { type: 'error', code: 'cancelled' };
        return;
      }

      const waiting: PrompterEvent[] = [];
      let wake: (() => void) | null = null;
      const push = (event: PrompterEvent) => {
        waiting.push(event);
        wake?.();
      };
      const channel = new Channel();
      channel.onmessage = (message) => push(asEvent(message));
      const stop = () => {
        invoke(NATIVE_COMMANDS.cancel, { id: request.id }).catch(() => {});
        push({ type: 'error', code: 'cancelled' });
      };
      signal?.addEventListener('abort', stop, { once: true });
      // The command's own reply carries nothing: the reply streams on the channel, and its last
      // messages can arrive after the command returns. Only a failed command ends it here.
      invoke(NATIVE_COMMANDS.send, { request, channel }).catch(() =>
        push({ type: 'error', code: 'internal' }),
      );

      let finished = false;
      try {
        for (;;) {
          if (waiting.length === 0)
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          wake = null;
          const event = waiting.shift()!;
          finished = event.type !== 'event';
          yield event;
          if (finished) return;
        }
      } finally {
        signal?.removeEventListener('abort', stop);
        channel.onmessage = () => {};
        // Whoever was reading stopped before the end: the native layer needn't carry on.
        if (!finished) invoke(NATIVE_COMMANDS.cancel, { id: request.id }).catch(() => {});
      }
    },
  };
}
