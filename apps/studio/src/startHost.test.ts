import { browserHost, POLICY_COMMAND, type Invoke } from '@storystage/host';
import { NATIVE_COMMANDS, offTransport } from '@storystage/prompter';
import { describe, expect, it, vi } from 'vitest';
import policyInForce from '../../desktop/src-tauri/policy/fixtures/policy-in-force.json';
import { inTauri, startHost } from './startHost.ts';

// The host the studio starts on: the apps' native layer inside Tauri, the browser's otherwise.

class FakeChannel {
  onmessage: (message: unknown) => void = () => {};
}

/** A Tauri app's native layer, answering what it's given and logging what it's asked. */
function fakeApp(answers: Record<string, unknown>) {
  const commands: string[] = [];
  const invoke: Invoke = async (command) => {
    commands.push(command);
    if (command in answers) return answers[command];
    throw new Error('not here');
  };
  const window = { __TAURI_INTERNALS__: {} };
  return { commands, window, load: async () => ({ invoke, Channel: FakeChannel }) };
}

describe('startHost', () => {
  it('starts on the browser version’s host outside an app, without loading Tauri', async () => {
    const load = vi.fn();
    expect(inTauri({})).toBe(false);
    expect(await startHost({ window: {}, load })).toBe(browserHost);
    expect(load).not.toHaveBeenCalled();
  });

  it('starts on the native layer inside an app, reading its version through Tauri', async () => {
    const app = fakeApp({ app_version: '1.2.3' });
    expect(inTauri(app.window)).toBe(true);
    const host = await startHost(app);
    expect(host).not.toBe(browserHost);
    expect(host.version).toBe('1.2.3');
    expect(app.commands).toContain('app_version');
    // No policy could be read, so the studio has no way to the Prompter.
    expect(host.prompter).toBe(offTransport);
  });

  it('gives the Prompter the native layer’s transport when the app’s policy is read', async () => {
    const app = fakeApp({
      app_version: '1.2.3',
      [POLICY_COMMAND]: policyInForce,
      [NATIVE_COMMANDS.status]: { available: true },
    });
    const host = await startHost(app);
    expect(host.policy.source).not.toBe('unreadable');
    expect(host.prompter).not.toBe(offTransport);
    // Asked of the app's own `prompter_status`, through the same `invoke` as the rest.
    expect(await host.prompter.status()).toEqual({ available: true });
    expect(app.commands).toContain(NATIVE_COMMANDS.status);
  });

  it('keeps the studio working as the browser version when the native layer can’t be loaded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const host = await startHost({
      window: { __TAURI_INTERNALS__: {} },
      load: async () => {
        throw new Error('no Tauri');
      },
    });
    expect(host).toBe(browserHost);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
