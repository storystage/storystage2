/**
 * Contract: speech models (spec 05 section 5, spec 06 section 1.4). The native layer keeps the
 * pinned whisper models and hands over checked bytes, so the webview never fetches one. The
 * browser version has no speech input, so its host has none of this.
 *
 * Owners: S8 (the native side) and S7 (`packages/speech`, its worker). A change here is a
 * `contract` pull request reviewed by both.
 */

/** The pinned models (spec 05 section 5.1). Nothing else can be loaded. */
export const SPEECH_MODEL_NAMES = ['tiny.en-q5_1', 'tiny.en'] as const;
export type SpeechModelName = (typeof SPEECH_MODEL_NAMES)[number];

/** One code per cause (spec 05 section 5.5). */
export const SPEECH_ERROR_CODES = [
  'refused_by_policy',
  'not_downloaded',
  'check_failed',
  'offline',
  'no_space',
  'cancelled',
  'internal',
] as const;
export type SpeechErrorCode = (typeof SPEECH_ERROR_CODES)[number];

export class SpeechModelError extends Error {
  readonly code: SpeechErrorCode;

  constructor(code: SpeechErrorCode) {
    super(`Speech model: ${code}`);
    this.name = 'SpeechModelError';
    this.code = code;
  }
}

export interface SpeechModelInfo {
  readonly name: SpeechModelName;
  readonly bytes: number;
  /** The bundled model is always there and can't be removed (decision 0057). */
  readonly bundled: boolean;
  /** Bundled, or downloaded and still on the device. */
  readonly ready: boolean;
}

export interface SpeechModels {
  list(): Promise<readonly SpeechModelInfo[]>;
  /** The checked bytes, for the worker. Rejects with a `SpeechModelError`. */
  load(name: SpeechModelName): Promise<ArrayBuffer>;
  /** Downloads and checks a model that isn't bundled. Only after the learner agrees (spec 06 1.4). */
  download(
    name: SpeechModelName,
    onProgress?: (received: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  /** Deletes a downloaded model. The bundled one stays. */
  remove(name: SpeechModelName): Promise<void>;
}

/** The Tauri commands (spec 05 section 5.5). None takes a path, and none returns anything else. */
export const SPEECH_COMMANDS = {
  list: 'speech_models',
  load: 'speech_model_load',
  download: 'speech_model_download',
  cancel: 'speech_model_cancel',
  remove: 'speech_model_remove',
} as const;

export type SpeechDownloadEvent =
  | { readonly type: 'progress'; readonly received: number; readonly total: number }
  | { readonly type: 'end' }
  | { readonly type: 'error'; readonly code: SpeechErrorCode };

/** Tauri's `invoke`: named arguments or a raw body, and headers. */
export type Invoke = (
  command: string,
  args?: Record<string, unknown> | Uint8Array,
  options?: { readonly headers: Record<string, string> },
) => Promise<unknown>;

/** Tauri's `Channel` class, passed in so this package has no Tauri in it. */
export type ChannelClass = new () => { onmessage: (message: unknown) => void };

const isOneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

/** A command that failed answers with its code as text. Anything else is `internal`. */
function asError(reason: unknown): SpeechModelError {
  if (reason instanceof SpeechModelError) return reason;
  return new SpeechModelError(isOneOf(SPEECH_ERROR_CODES, reason) ? reason : 'internal');
}

function isInfo(value: unknown): value is SpeechModelInfo {
  if (typeof value !== 'object' || value === null) return false;
  const { name, bytes, bundled, ready } = value as Record<string, unknown>;
  return (
    isOneOf(SPEECH_MODEL_NAMES, name) &&
    typeof bytes === 'number' &&
    typeof bundled === 'boolean' &&
    typeof ready === 'boolean'
  );
}

/** The Tauri apps' speech models, over the native commands. */
export function tauriSpeech(invoke: Invoke, Channel: ChannelClass): SpeechModels {
  const call = (command: string, args?: Record<string, unknown>) =>
    invoke(command, args).catch((reason: unknown) => {
      throw asError(reason);
    });

  return {
    async list() {
      const reply = await call(SPEECH_COMMANDS.list);
      if (!Array.isArray(reply) || !reply.every(isInfo)) throw new SpeechModelError('internal');
      return reply;
    },

    async load(name) {
      const reply = await call(SPEECH_COMMANDS.load, { name });
      if (!(reply instanceof ArrayBuffer)) throw new SpeechModelError('internal');
      return reply;
    },

    // From S5's and S7's reviews of #152: it always settles, once, and leaves nothing behind.
    download(name, onProgress, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new SpeechModelError('cancelled'));
        let settled = false;
        const settle = (error?: SpeechModelError) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', abort);
          if (error) reject(error);
          else resolve();
        };
        // Stop at once on Cancel, whatever the native side says next.
        const abort = () => {
          invoke(SPEECH_COMMANDS.cancel, { name }).catch(() => {});
          settle(new SpeechModelError('cancelled'));
        };
        const channel = new Channel();
        channel.onmessage = (message) => {
          const event = message as Partial<SpeechDownloadEvent> | null;
          if (event?.type === 'progress' && typeof event.received === 'number') {
            if (!settled) onProgress?.(event.received, event.total ?? 0);
          } else if (event?.type === 'end') settle();
          else if (event?.type === 'error') settle(asError(event.code));
          else settle(new SpeechModelError('internal'));
        };
        signal?.addEventListener('abort', abort, { once: true });
        call(SPEECH_COMMANDS.download, { name, channel }).catch((reason: unknown) =>
          settle(asError(reason)),
        );
      });
    },

    async remove(name) {
      await call(SPEECH_COMMANDS.remove, { name });
    },
  };
}
