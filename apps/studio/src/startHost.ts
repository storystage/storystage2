/**
 * Which host the studio starts on (spec 05; decision 0003): the Tauri apps' native layer when the
 * studio runs inside one, and the browser version's otherwise. Inside an app, Tauri's own API is
 * loaded here, only there, and `tauriHost` reads the policy, the version, the picker, the shipped
 * Backstage and speech from it. The Prompter reaches Claude through the native layer
 * (`tauriTransport`, over S8's `prompter_send`), with the same `invoke` and `Channel` as speech;
 * the browser version's host keeps it off.
 */
import {
  browserHost,
  tauriHost,
  type ChannelClass,
  type HostInterface,
  type Invoke,
} from '@storystage/host';
import { tauriTransport } from '@storystage/prompter';

/** What `@tauri-apps/api/core` gives the studio. */
export interface TauriCore {
  readonly invoke: Invoke;
  readonly Channel: ChannelClass;
}

/** Whether the page runs inside a Tauri app: Tauri 2 puts its internals on the window. */
export const inTauri = (window: object = globalThis): boolean => '__TAURI_INTERNALS__' in window;

const loadTauri = async (): Promise<TauriCore> => {
  const core = await import('@tauri-apps/api/core');
  return { invoke: core.invoke as Invoke, Channel: core.Channel as unknown as ChannelClass };
};

/**
 * The host to start the studio on. Inside an app that can't read its native layer, the browser
 * version's host keeps the studio working, and the problem is logged for whoever looks into it.
 */
export async function startHost(
  options: { window?: object; load?: () => Promise<TauriCore> } = {},
): Promise<HostInterface> {
  if (!inTauri(options.window)) return browserHost;
  try {
    const { invoke, Channel } = await (options.load ?? loadTauri)();
    return await tauriHost(invoke, tauriTransport(invoke, Channel), Channel);
  } catch (e) {
    console.error(
      'StoryStage could not reach the app’s native layer; it runs as the browser version.',
      e,
    );
    return browserHost;
  }
}
