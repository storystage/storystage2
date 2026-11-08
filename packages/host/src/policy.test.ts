import { describe, expect, it } from 'vitest';
import fixture from '../../../apps/desktop/src-tauri/policy/fixtures/policy-in-force.json';
import { browserHost } from './host.ts';
import {
  BROWSER_POLICY,
  isPolicyInForce,
  POLICY_COMMAND,
  readPolicy,
  unreadablePolicy,
} from './policy.ts';

describe('the policy in force', () => {
  // The other half of this test is in Rust: `the_shared_fixture_matches`.
  it('matches the shape the native layer sends', () => {
    expect(isPolicyInForce(fixture)).toBe(true);
    expect(POLICY_COMMAND).toBe('policy_in_force');
  });

  it.each([
    ['nothing', null],
    ['a string', 'prompter.enabled=false'],
    ['an unknown source', { ...fixture, source: 'school' }],
    ['an unknown level', { ...fixture, prompter: { ...fixture.prompter, level: 'most' } }],
    ['a missing section', { ...fixture, study: undefined }],
    ['a set that is not a list', { ...fixture, set: 'prompter.enabled' }],
    ['a pin that is not text', { ...fixture, update: { ...fixture.update, pin: 1 } }],
  ])('rejects %s', (_name, value) => {
    expect(isPolicyInForce(value)).toBe(false);
  });

  it('turns the Prompter off in the browser version', async () => {
    expect(browserHost.policy).toBe(BROWSER_POLICY);
    expect(BROWSER_POLICY.prompter.level).toBe('off');
    expect(BROWSER_POLICY.prompter.voiceInput).toBe(false);
    expect(await browserHost.prompter.status()).toEqual({
      available: false,
      reason: 'prompter_off',
    });
    expect(isPolicyInForce(BROWSER_POLICY)).toBe(true);
  });

  it('fails closed when unreadable, as the native layer does', () => {
    const policy = unreadablePolicy('Line 1: there is no equals sign.');
    expect(isPolicyInForce(policy)).toBe(true);
    expect(policy).toMatchObject({
      source: 'unreadable',
      trusted: false,
      diagnostic: 'Line 1: there is no equals sign.',
      set: [],
      prompter: { level: 'off', voiceInput: false },
      backstage: { import: 'off', search: false },
      study: { enabled: false },
      update: { channel: 'off', pin: null },
    });
  });
});

describe('readPolicy', () => {
  it('asks the native layer and returns its answer', async () => {
    const commands: string[] = [];
    const policy = await readPolicy(async (command) => {
      commands.push(command);
      return fixture;
    });
    expect(commands).toEqual(['policy_in_force']);
    expect(policy.prompter.level).toBe('planOnly');
  });

  it('fails closed on an answer it can’t use', async () => {
    const policy = await readPolicy(async () => ({ prompter: { level: 'full' } }));
    expect(policy.source).toBe('unreadable');
    expect(policy.prompter.level).toBe('off');
  });

  it('fails closed if the native layer can’t answer', async () => {
    const policy = await readPolicy(() => Promise.reject(new Error('no such command')));
    expect(policy.source).toBe('unreadable');
    expect(policy.prompter.level).toBe('off');
  });
});
