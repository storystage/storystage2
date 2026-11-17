/**
 * A scripted Prompter for the browser tests and for looking at the panel in development only
 * (WP13c). `startHost` loads this behind `import.meta.env.DEV`, so a release build has no way to
 * reach it. A test puts the replies on the window before the page loads:
 *
 *     window.__storystagePrompter = { level: 'full', replies: [testReply([...]), …] };
 *
 * Each request takes the next reply, built with `@storystage/prompter/testing`'s `testReply`.
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
  }
}

/** The script a test has put on the window, if any. */
export const devScript = (): DevPrompter | undefined => globalThis.window?.__storystagePrompter;

/** The browser version's host with the scripted Prompter in it. */
export function devPrompterHost(script: DevPrompter): HostInterface {
  let next = 0;
  const transport = scriptedTransport(
    () => script.replies[next++] ?? [{ type: 'error', code: 'internal' }],
  );
  return {
    ...browserHost,
    policy: {
      ...browserHost.policy,
      prompter: { ...browserHost.policy.prompter, level: script.level ?? 'full' },
    },
    prompter: transport,
  };
}
