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

describe('speech models in the Tauri host', () => {
  const Channel = class {
    onmessage = () => {};
  };
  const withPolicy =
    (prompter: Record<string, unknown>, dictation = true) =>
    async (command: string): Promise<unknown> =>
      command === POLICY_COMMAND
        ? { ...fixture, prompter: { ...fixture.prompter, ...prompter }, speech: { dictation } }
        : '1.4.2';

  it('are there when dictation is allowed', async () => {
    const host = await tauriHost(answering('1.4.2'), native, Channel);
    expect(host.speech).not.toBeNull();
  });

  // Decision 0060: dictation doesn't depend on the Prompter.
  it.each([
    ['the Prompter is Off', { level: 'off' }],
    ['the Prompter has no voice input', { voiceInput: false }],
  ])('are still there when %s', async (_name, prompter) => {
    expect((await tauriHost(withPolicy(prompter), native, Channel)).speech).not.toBeNull();
  });

  it('are absent when the school turns dictation off', async () => {
    expect((await tauriHost(withPolicy({}, false), native, Channel)).speech).toBeNull();
  });

  it('are absent when the policy is unreadable', async () => {
    const host = await tauriHost(() => Promise.reject(new Error('no answer')), native, Channel);
    expect(host.speech).toBeNull();
  });

  it('are absent without Tauri’s Channel', async () => {
    expect((await tauriHost(answering('1.4.2'), native)).speech).toBeNull();
  });
});

describe('the browser host', () => {
  it('has no installed version', () => {
    expect(browserHost.version).toBeNull();
  });

  it('has no speech models', () => {
    expect(browserHost.speech).toBeNull();
  });
});
