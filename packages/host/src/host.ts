/**
 * Contract: the host interface (decision 0028, spec 00 sections 1 and 6). The build hands one to
 * the studio at start-up, so the browser build and the Tauri build differ only in what they
 * pass. The studio never asks which host it is in.
 *
 * Owners: S8 and S5, and S7 for `speech`. Files arrive here when the studio first needs them (WP8).
 */

import { offTransport, type PrompterTransport } from '@storystage/prompter';
import { BROWSER_POLICY, readPolicy, type PolicyInForce } from './policy.ts';
import { tauriSpeech, type ChannelClass, type Invoke, type SpeechModels } from './speech.ts';

export interface HostInterface {
  /** The policy in force, read once at start-up. */
  readonly policy: PolicyInForce;
  /** The native layer in the Tauri apps. `offTransport` in the browser version: no Prompter. */
  readonly prompter: PrompterTransport;
  /** The installed version, for About (spec 05 section 4.6). `null` in the browser version. */
  readonly version: string | null;
  /**
   * The speech models (spec 05 section 5). `null` in the browser version, and whenever the policy
   * in force doesn't allow dictation (`speech.dictation`, decision 0060), whatever the Prompter's level.
   */
  readonly speech: SpeechModels | null;
}

/** The browser version's host (0022, 15.6): the Prompter has no way to reach anything. */
export const browserHost: HostInterface = {
  policy: BROWSER_POLICY,
  prompter: offTransport,
  version: null,
  speech: null,
};

/** The Tauri command that returns the installed version. It takes no arguments. */
export const VERSION_COMMAND = 'app_version';

/** Three whole numbers, such as `1.4.2`: the versions the release workflow makes. */
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

async function readVersion(invoke: Invoke): Promise<string | null> {
  try {
    const reply = await invoke(VERSION_COMMAND);
    return typeof reply === 'string' && VERSION.test(reply) ? reply : null;
  } catch {
    return null;
  }
}

/**
 * The Tauri apps' host. `invoke` is Tauri's, and `prompter` is the native transport, both passed
 * in by the Tauri entry point so this package has no Tauri in it. If the policy can't be read,
 * the studio gets no way to reach the Prompter at all, as well as the native layer refusing.
 * `Channel` is Tauri's: without it there are no speech models.
 */
export async function tauriHost(
  invoke: Invoke,
  prompter: PrompterTransport,
  Channel?: ChannelClass,
): Promise<HostInterface> {
  const [policy, version] = await Promise.all([readPolicy(invoke), readVersion(invoke)]);
  const reachable = policy.source === 'unreadable' ? offTransport : prompter;
  const speech = policy.speech.dictation && Channel ? tauriSpeech(invoke, Channel) : null;
  return { policy, prompter: reachable, version, speech };
}
