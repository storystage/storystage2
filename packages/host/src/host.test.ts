import { offTransport, scriptedTransport } from '@storystage/prompter';
import { describe, expect, it } from 'vitest';
import fixture from '../../../apps/desktop/src-tauri/policy/fixtures/policy-in-force.json';
import { browserHost, tauriHost, VERSION_COMMAND } from './host.ts';
import { POLICY_COMMAND } from './policy.ts';

const native = scriptedTransport(() => [{ type: 'end' }]);

const answering =
  (version: unknown) =>
  async (command: string): Promise<unknown> => {
    if (command === POLICY_COMMAND) return fixture;
    if (command === VERSION_COMMAND) return version;
    throw new Error(`Unexpected command: ${command}`);
  };

describe('the Tauri host', () => {
  it('asks the native layer for the policy and the version', async () => {
    const host = await tauriHost(answering('1.4.2'), native);
    expect(host.policy.prompter.level).toBe('planOnly');
    expect(host.version).toBe('1.4.2');
    expect(host.prompter).toBe(native);
  });

  it('still starts if the native layer can’t answer, with the Prompter off', async () => {
    const host = await tauriHost(() => Promise.reject(new Error('no answer')), native);
    expect(host.policy.source).toBe('unreadable');
    expect(host.policy.prompter.level).toBe('off');
    expect(host.version).toBeNull();
  });

  // S5's review of #100: defence in depth, as well as the native layer refusing.
  it('gives the studio no way to reach the Prompter when the policy is unreadable', async () => {
    const broken = async (command: string): Promise<unknown> =>
      command === POLICY_COMMAND ? { prompter: { level: 'full' } } : '1.4.2';
    const host = await tauriHost(broken, native);
    expect(host.policy.source).toBe('unreadable');
    expect(host.prompter).toBe(offTransport);
  });

  it.each([['1.4.2-beta'], ['v1.4.2'], ['x'.repeat(500)], [7], [null]])(
    'shows no version for %s',
    async (reply) => {
      expect((await tauriHost(answering(reply), native)).version).toBeNull();
    },
  );
});

describe('the browser host', () => {
  it('has no installed version', () => {
    expect(browserHost.version).toBeNull();
  });
});
