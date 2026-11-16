import { describe, expect, it } from 'vitest';
import {
  KEY_COMMANDS,
  KEY_OUTCOMES,
  KEY_OUTCOME_WORDS,
  PrompterSetup,
  SETUP_FAILED_WORDS,
  tauriKey,
  type KeyOutcome,
  type PrompterKey,
} from './setup.ts';
import { containsSecret } from './transport.ts';

/**
 * A native layer that answers `add` with each outcome in turn. An outcome given as a promise
 * keeps the dialog open until it settles.
 */
function fakeKey(
  outcomes: (KeyOutcome | Error | Promise<KeyOutcome>)[] = ['saved'],
  stored = false,
) {
  const calls: string[] = [];
  const key: PrompterKey = {
    async add() {
      calls.push('add');
      const next = await (outcomes.shift() ?? 'cancelled');
      if (next instanceof Error) throw next;
      if (next === 'saved') stored = true;
      return next;
    },
    async status() {
      calls.push('status');
      return stored ? 'present' : 'absent';
    },
    async remove() {
      calls.push('remove');
      stored = false;
    },
  };
  return { key, calls };
}

/** Walks an adult to page 10c. */
async function toKeyPage(setup: PrompterSetup) {
  await setup.open();
  setup.adult();
  setup.setAdultAccount(true);
  setup.next();
}

describe('tauriKey (spec 05, section 1.3)', () => {
  it('calls the three commands with nothing, and passes on their words', async () => {
    const sent: [string, unknown][] = [];
    const replies: Record<string, unknown> = {
      [KEY_COMMANDS.add]: 'notAccepted',
      [KEY_COMMANDS.status]: 'absent',
      [KEY_COMMANDS.remove]: null,
    };
    const key = tauriKey(async (command, args) => {
      sent.push([command, args]);
      return replies[command];
    });
    expect(await key.add()).toBe('notAccepted');
    expect(await key.status()).toBe('absent');
    await key.remove();
    expect(sent).toEqual([
      ['key_add', undefined],
      ['key_status', undefined],
      ['key_remove', undefined],
    ]);
  });

  it('never takes an unexpected reply as success', async () => {
    const key = tauriKey(async () => 'ok');
    await expect(key.add()).rejects.toThrow();
    await expect(key.status()).rejects.toThrow();
  });
});

describe('PrompterSetup (spec 04, section 4.4)', () => {
  it('walks an adult from 10a to 10d, and only then can finish', async () => {
    const { key } = fakeKey(['saved']);
    const setup = new PrompterSetup(key);
    await setup.open();
    expect(setup.state.page).toBe('who');
    setup.adult();
    expect(setup.state.page).toBe('about');
    setup.next();
    expect(setup.state.page).toBe('about'); // not until the account box is ticked
    setup.setAdultAccount(true);
    setup.next();
    expect(setup.state.page).toBe('key');
    setup.finish();
    expect(setup.state.page).toBe('key'); // no key, no finishing
    expect(await setup.addKey()).toBe('saved');
    expect(setup.state).toMatchObject({
      page: 'ready',
      keyStored: true,
      words: 'Key works. Checked just now.',
    });
    setup.finish();
    expect(setup.state).toMatchObject({ page: 'done', ended: 'finished' });
  });

  it('lets a learner skip to the app, with the Prompter off', async () => {
    const { key, calls } = fakeKey();
    const setup = new PrompterSetup(key);
    await setup.open();
    setup.learner();
    expect(setup.state).toMatchObject({ page: 'done', ended: 'learner', keyStored: false });
    expect(calls).not.toContain('add');
  });

  it("stays on 10c with spec 05's words for each outcome but saved", async () => {
    for (const outcome of KEY_OUTCOMES.filter((o) => o !== 'saved')) {
      const setup = new PrompterSetup(fakeKey([outcome]).key);
      await toKeyPage(setup);
      expect(await setup.addKey()).toBe(outcome);
      expect(setup.state).toMatchObject({
        page: 'key',
        busy: false,
        keyStored: false,
        words: KEY_OUTCOME_WORDS[outcome],
      });
    }
    expect(KEY_OUTCOME_WORDS.cancelled).toBeNull();
  });

  it('can try again after a wrong paste', async () => {
    const setup = new PrompterSetup(fakeKey(['notAccepted', 'saved']).key);
    await toKeyPage(setup);
    await setup.addKey();
    expect(setup.state.words).toBe("That key wasn't accepted.");
    await setup.addKey();
    expect(setup.state.page).toBe('ready');
  });

  it("opens the dialog once, however often Add key is pressed while it's open", async () => {
    let close: (outcome: KeyOutcome) => void = () => {};
    const dialog = new Promise<KeyOutcome>((resolve) => (close = resolve));
    const { key, calls } = fakeKey([dialog]);
    const setup = new PrompterSetup(key);
    await toKeyPage(setup);
    const first = setup.addKey();
    expect(setup.state.busy).toBe(true);
    expect(await setup.addKey()).toBeNull();
    setup.back();
    expect(setup.state.page).toBe('key');
    close('saved');
    expect(await first).toBe('saved');
    expect(setup.state.page).toBe('ready');
    expect(calls.filter((c) => c === 'add')).toHaveLength(1);
  });

  it('says so, and stays, when a command fails', async () => {
    const setup = new PrompterSetup(fakeKey([new Error('no native layer')]).key);
    await toKeyPage(setup);
    expect(await setup.addKey()).toBeNull();
    expect(setup.state).toMatchObject({ page: 'key', busy: false, words: SETUP_FAILED_WORDS });
  });

  it('starts on 10d when a key is stored, where Remove key starts again with the Prompter off', async () => {
    const { key, calls } = fakeKey([], true);
    const setup = new PrompterSetup(key);
    await setup.open();
    expect(setup.state).toMatchObject({ page: 'ready', keyStored: true });
    await setup.removeKey();
    expect(calls).toContain('remove');
    expect(setup.state).toMatchObject({ page: 'who', keyStored: false, ended: null });
  });

  it('goes back a page, but never past 10a', async () => {
    const setup = new PrompterSetup(fakeKey().key);
    await toKeyPage(setup);
    setup.back();
    expect(setup.state.page).toBe('about');
    setup.back();
    setup.back();
    expect(setup.state.page).toBe('who');
  });

  it('tells its listeners, and holds nothing that looks like a key', async () => {
    const setup = new PrompterSetup(fakeKey(['saved']).key);
    const pages: string[] = [];
    const stop = setup.subscribe((s) => pages.push(s.page));
    await toKeyPage(setup);
    await setup.addKey();
    stop();
    setup.finish();
    expect(pages.at(-1)).toBe('ready');
    expect(containsSecret(setup.state)).toBe(false);
  });
});
