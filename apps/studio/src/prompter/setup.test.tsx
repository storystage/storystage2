import type { KeyOutcome, KeyStatus, PrompterKey } from '@storystage/prompter';
import { ThemeRoot } from '@storystage/ui';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PrompterCard } from './PrompterCard.tsx';
import { SetupWizard } from './SetupWizard.tsx';

// The set-up wizard as the studio draws it (WP13.6; spec 05 section 1; spec 04 section 4.4), on
// S7's `PrompterSetup` with a fake native layer. The key itself never reaches the studio.

/** A native layer whose `key_add` gives `outcomes` in turn. */
function fakeKeys(stored: KeyStatus = 'absent', outcomes: KeyOutcome[] = ['saved']) {
  let status = stored;
  const keys = {
    add: vi.fn(async () => {
      const outcome = outcomes.shift() ?? 'saved';
      if (outcome === 'saved') status = 'present';
      return outcome;
    }),
    status: vi.fn(async () => status),
    remove: vi.fn(async () => {
      status = 'absent';
    }),
  } satisfies PrompterKey;
  return keys;
}

function open(keys: PrompterKey) {
  const onClose = vi.fn<(how: 'finished' | 'learner' | 'skipped') => void>();
  const onAnnounce = vi.fn<(text: string) => void>();
  render(
    <ThemeRoot>
      <SetupWizard keys={keys} isOpen onClose={onClose} onAnnounce={onAnnounce} />
    </ThemeRoot>,
  );
  return { onClose, onAnnounce, user: userEvent.setup() };
}

const wizard = () => screen.getByRole('dialog', { name: 'Set up the Prompter' });
const heading = () => within(wizard()).getByRole('heading', { level: 3 });

async function toKeyPage(keys: PrompterKey) {
  const opened = open(keys);
  const { user } = opened;
  await waitFor(() => expect(heading().textContent).toBe('Who is setting up the Prompter?'));
  await user.click(screen.getByRole('radio', { name: /I’m the adult who owns the Claude key/ }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(screen.getByRole('checkbox', { name: /I’m the responsible adult/ }));
  await user.click(screen.getByRole('button', { name: 'I agree, continue' }));
  expect(heading().textContent).toBe('Add your Claude key');
  return opened;
}

describe('the set-up wizard (screens 10a to 10d)', () => {
  it('lets a learner skip it, with the Prompter left off', async () => {
    const keys = fakeKeys();
    const { onClose, user } = open(keys);
    await waitFor(() => expect(heading().textContent).toBe('Who is setting up the Prompter?'));
    expect(within(wizard()).getByText('Step 1 of 4')).toBeTruthy();
    // Nothing chosen yet: Next waits.
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('radio', { name: /I’m a learner/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onClose).toHaveBeenCalledWith('learner');
    expect(keys.add).not.toHaveBeenCalled();
  });

  it('says what the Prompter sends, and carries on only once the adult agrees', async () => {
    const { user } = open(fakeKeys());
    await waitFor(() => expect(heading().textContent).toBe('Who is setting up the Prompter?'));
    await user.click(screen.getByRole('radio', { name: /I’m the adult/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(heading().textContent).toMatch(/^Meet the Prompter/);
    const page = wizard();
    expect(within(page).getByText(/is sent to Claude/)).toBeTruthy();
    expect(within(page).getByText(/are never sent/)).toBeTruthy();
    expect(within(page).getByText(/The Claude account must belong to an adult/)).toBeTruthy();
    expect(within(page).getByText(/not one that pupils share/)).toBeTruthy();
    const agree = screen.getByRole('button', { name: 'I agree, continue' });
    expect(agree.hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /I’m the responsible adult/ }));
    expect(agree.hasAttribute('disabled')).toBe(false);
    // Back goes to 10a.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(heading().textContent).toBe('Who is setting up the Prompter?');
  });

  it('adds the key in the system’s dialog, never a field of its own, then finishes', async () => {
    const keys = fakeKeys('absent', ['notAccepted', 'saved']);
    const { onClose, onAnnounce, user } = await toKeyPage(keys);
    // No key field anywhere in the studio (decision 0056).
    expect(within(wizard()).queryByRole('textbox')).toBeNull();
    expect(within(wizard()).getByText(/spend limit/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Add key' }));
    // An outcome other than saved stays on 10c, in spec 05's words.
    expect(await within(wizard()).findByText("That key wasn't accepted.")).toBeTruthy();
    expect(heading().textContent).toBe('Add your Claude key');

    await user.click(screen.getByRole('button', { name: 'Add key' }));
    await waitFor(() => expect(heading().textContent).toBe('You’re ready'));
    expect(within(wizard()).getByText('Key works. Checked just now.')).toBeTruthy();
    expect(within(wizard()).getByText('In this device’s secure store')).toBeTruthy();
    expect(onAnnounce).toHaveBeenCalledWith('Key added. The Prompter is ready.');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledWith('finished');
  });

  it('opens Add key’s dialog once, however often it’s pressed', async () => {
    const keys = fakeKeys();
    let answer: (outcome: KeyOutcome) => void = () => {};
    keys.add.mockImplementation(() => new Promise<KeyOutcome>((resolve) => (answer = resolve)));
    const { user } = await toKeyPage(keys);
    await user.click(screen.getByRole('button', { name: 'Add key' }));
    const adding = screen.getByRole('button', { name: 'Adding the key…' });
    expect(adding.hasAttribute('disabled')).toBe(true);
    expect(within(wizard()).getByText(/Paste the key into the box that opened/)).toBeTruthy();
    await user.click(adding);
    expect(keys.add).toHaveBeenCalledOnce();
    await act(async () => answer('cancelled'));
    // Cancelled says nothing, and Add key is back.
    expect(screen.getByRole('button', { name: 'Add key' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/Paste the key into the box that opened/)).toBeNull();
  });

  it('says so when the native layer fails, and stays where it is', async () => {
    const keys = fakeKeys();
    keys.add.mockRejectedValueOnce(new Error('no native layer'));
    const { user } = await toKeyPage(keys);
    await user.click(screen.getByRole('button', { name: 'Add key' }));
    expect(await within(wizard()).findByText("That didn't work. Try again.")).toBeTruthy();
    expect(heading().textContent).toBe('Add your Claude key');
  });

  it('opens on 10d with a key already stored, where Remove key starts again', async () => {
    const keys = fakeKeys('present');
    const { onAnnounce, user } = open(keys);
    await waitFor(() => expect(heading().textContent).toBe('You’re ready'));
    await user.click(screen.getByRole('button', { name: 'Remove key' }));
    await waitFor(() => expect(heading().textContent).toBe('Who is setting up the Prompter?'));
    expect(keys.remove).toHaveBeenCalledOnce();
    expect(onAnnounce).toHaveBeenCalledWith('Key removed. The Prompter is off.');
  });

  it('can be left part-way, using StoryStage without the Prompter', async () => {
    const { onClose, user } = await toKeyPage(fakeKeys());
    await user.click(screen.getByRole('button', { name: /^Skip/ }));
    expect(onClose).toHaveBeenCalledWith('skipped');
  });
});

describe('Settings › The Prompter', () => {
  function card(keys: PrompterKey, off = false) {
    const onSetUp = vi.fn();
    const onRemoved = vi.fn();
    render(
      <ThemeRoot>
        <PrompterCard keys={keys} off={off} onSetUp={onSetUp} changed={0} onRemoved={onRemoved} />
      </ThemeRoot>,
    );
    return { onSetUp, onRemoved, user: userEvent.setup() };
  }

  it('says whether this device has a key, and offers Set up…', async () => {
    const { onSetUp, user } = card(fakeKeys('absent'));
    expect(await screen.findByText(/Not set up on this device/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove key' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Set up…' }));
    expect(onSetUp).toHaveBeenCalledOnce();
  });

  it('removes a stored key, which switches the Prompter off', async () => {
    const keys = fakeKeys('present');
    const { onRemoved, user } = card(keys);
    expect(await screen.findByText(/a Claude key is in its secure store/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove key' }));
    expect(await screen.findByText(/Not set up on this device/)).toBeTruthy();
    expect(keys.remove).toHaveBeenCalledOnce();
    expect(onRemoved).toHaveBeenCalledOnce();
  });

  it('says when the school has switched the Prompter off', async () => {
    card(fakeKeys('absent'), true);
    expect(await screen.findByText(/switched off by your school/)).toBeTruthy();
  });
});
