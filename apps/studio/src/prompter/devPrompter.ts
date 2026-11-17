/**
 * The browser tests' host, in development only: a scripted Prompter (WP13c), and study mode on
 * (WP7.13). `startHost` loads this behind `import.meta.env.DEV`, so a release build has no way to
 * reach it. A test puts what it wants on the window before the page loads:
 *
 *     window.__storystagePrompter = { level: 'full', replies: [testReply([...]), …] };
 *     window.__storystageStudy = true;
 *
 * Each Prompter request takes the next reply, built with `@storystage/prompter/testing`'s
 * `testReply`. Study mode on is a policy from a trusted source with `study.enabled`, as a school's
 * would be (spec 14 section 6.1); the browser version's own policy never has it.
 */
import { browserHost, type HostInterface, type PrompterLevel } from '@storystage/host';
import { scriptedTransport, type PrompterEvent } from '@storystage/prompter';

export interface DevPrompter {
  /** The class's level. Full by default. */
  readonly level?: PrompterLevel;
  /** One reply for each request, in order. A request after the last is told there's no more. */
  readonly replies: readonly (readonly PrompterEvent[])[];
}

declare global {
  interface Window {
    __storystagePrompter?: DevPrompter;
    __storystageStudy?: boolean;
  }
}

/** Whether a test has asked for anything here. */
export const devAsked = (): boolean =>
  globalThis.window?.__storystagePrompter !== undefined ||
  globalThis.window?.__storystageStudy === true;

/** The browser version's host with the scripted Prompter in it. */
export function devPrompterHost(script: DevPrompter, host = browserHost): HostInterface {
  let next = 0;
  const transport = scriptedTransport(
    () => script.replies[next++] ?? [{ type: 'error', code: 'internal' }],
  );
  return {
    ...host,
    policy: {
      ...host.policy,
      prompter: { ...host.policy.prompter, level: script.level ?? 'full' },
    },
    prompter: transport,
  };
}

/** The browser version's host with what the test put on the window. */
export function devHost(): HostInterface {
  const script = globalThis.window?.__storystagePrompter;
  const host = script ? devPrompterHost(script) : browserHost;
  if (globalThis.window?.__storystageStudy !== true) return host;
  return { ...host, policy: { ...host.policy, trusted: true, study: { enabled: true } } };
}
