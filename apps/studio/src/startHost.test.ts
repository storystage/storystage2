import { browserHost, type Invoke } from '@storystage/host';
import { offTransport } from '@storystage/prompter';
import { describe, expect, it, vi } from 'vitest';
import { inTauri, startHost } from './startHost.ts';

// The host the studio starts on: the apps' native layer inside Tauri, the browser's otherwise.

class FakeChannel {
  onmessage: (message: unknown) => void = () => {};
}

describe('startHost', () => {
  it('starts on the browser version’s host outside an app, without loading Tauri', async () => {
    const load = vi.fn();
    expect(inTauri({})).toBe(false);
    expect(await startHost({ window: {}, load })).toBe(browserHost);
    expect(load).not.toHaveBeenCalled();
  });

  it('starts on the native layer inside an app, reading its version through Tauri', async () => {
    const commands: string[] = [];
    const invoke: Invoke = async (command) => {
      commands.push(command);
      if (command === 'app_version') return '1.2.3';
      throw new Error('not here');
    };
    const tauri = { __TAURI_INTERNALS__: {} };
    expect(inTauri(tauri)).toBe(true);
    const host = await startHost({
      window: tauri,
      load: async () => ({ invoke, Channel: FakeChannel }),
    });
    expect(host).not.toBe(browserHost);
    expect(host.version).toBe('1.2.3');
    expect(commands).toContain('app_version');
    // The Prompter's native transport isn't built yet, so it stays off.
    expect(host.prompter).toBe(offTransport);
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
