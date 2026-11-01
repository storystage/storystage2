import { offTransport } from '@storystage/prompter';
import { describe, expect, it } from 'vitest';
import fixture from '../../../apps/desktop/src-tauri/policy/fixtures/policy-in-force.json';
import { browserHost, tauriHost, VERSION_COMMAND } from './host.ts';
import { POLICY_COMMAND } from './policy.ts';

describe('the Tauri host', () => {
  it('asks the native layer for the policy and the version', async () => {
    const host = await tauriHost(async (command) => {
      if (command === POLICY_COMMAND) return fixture;
      if (command === VERSION_COMMAND) return '1.4.2';
      throw new Error(`Unexpected command: ${command}`);
    }, offTransport);
    expect(host.policy.prompter.level).toBe('planOnly');
    expect(host.version).toBe('1.4.2');
    expect(host.prompter).toBe(offTransport);
  });

  it('still starts if the native layer can’t answer, with the Prompter off', async () => {
    const host = await tauriHost(() => Promise.reject(new Error('no answer')), offTransport);
    expect(host.policy.source).toBe('unreadable');
    expect(host.policy.prompter.level).toBe('off');
    expect(host.version).toBeNull();
  });
});

describe('the browser host', () => {
  it('has no installed version', () => {
    expect(browserHost.version).toBeNull();
  });
});
