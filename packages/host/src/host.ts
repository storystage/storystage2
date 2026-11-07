/**
 * Contract: the host interface (decision 0028, spec 00 sections 1 and 6). The build hands one to
 * the studio at start-up, so the browser build and the Tauri build differ only in what they
 * pass. The studio never asks which host it is in.
 *
 * Owners: S8 and S5. Files arrive here when the studio first needs them (WP8).
 */

import { offTransport, type PrompterTransport } from '@storystage/prompter';
import { BROWSER_POLICY, type PolicyInForce } from './policy.ts';

export interface HostInterface {
  /** The policy in force, read once at start-up. */
  readonly policy: PolicyInForce;
  /** The native layer in the Tauri apps. `offTransport` in the browser version: no Prompter. */
  readonly prompter: PrompterTransport;
}

/** The browser version's host (0022, 15.6): the Prompter has no way to reach anything. */
export const browserHost: HostInterface = { policy: BROWSER_POLICY, prompter: offTransport };
