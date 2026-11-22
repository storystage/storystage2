import { browserHost, type HostInterface, type SpeechModels } from '@storystage/host';
import { exampleProduction } from '@storystage/production';
import { DictationError, type Dictation, type DictationState } from '@storystage/speech';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { Takes } from './takes.ts';
import { talkToTypeSetting } from './talkToType.tsx';

// Talk to type in the studio (spec 06 sections 1.1, 1.5 and 1.7) on a fake of S7's Dictation.

function fakeDictation() {
  let state: DictationState = { phase: 'idle', level: 0 };
  const listeners = new Set<(s: DictationState) => void>();
  const set = (next: DictationState) => {
    state = next;
    for (const l of [...listeners]) l(state);
  };
  let reply: string | DictationError = 'the words';
  const dictation: Dictation = {
    state: {
      get: () => state,
      subscribe: (l) => {
        listeners.add(l);
        return () => void listeners.delete(l);
      },
    },
    start: vi.fn(async () => set({ phase: 'listening', level: 0.4 })),
    stop: vi.fn(async () => {
      set({ phase: 'working', level: 0 });
      set({ phase: 'idle', level: 0 });
      if (reply instanceof DictationError) throw reply;
      return { text: reply };
    }),
    cancel: vi.fn(() => set({ phase: 'idle', level: 0 })),
  };
  return {
    dictation,
    set,
    reply: (r: string | DictationError) => void (reply = r),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Takes: one take at a time across the studio', () => {
  it('starts a take for a field, then puts its words in as a step of their own', async () => {
    const { dictation } = fakeDictation();
    const order: string[] = [];
    const takes = new Takes(dictation, () => order.push('seal'));
    const insert = vi.fn((w: string) => order.push(`insert ${w}`));
    await takes.toggle('logline', insert);
    expect(takes.forField('logline')).toMatchObject({ phase: 'listening', level: 0.4 });
    expect(takes.forField('synopsis').phase).toBe('idle');
    await takes.toggle('logline', insert);
    expect(order).toEqual(['seal', 'insert the words', 'seal']);
    expect(takes.state).toMatchObject({ field: null, phase: 'idle' });
  });

  it('cancels the take going when another field’s mic is tapped', async () => {
    const { dictation } = fakeDictation();
    const takes = new Takes(dictation, () => {});
    await takes.toggle('logline', () => {});
    await takes.toggle('synopsis', () => {});
    expect(dictation.cancel).toHaveBeenCalledOnce();
    expect(takes.state.field).toBe('synopsis');
  });

  it('collects the words of a take that stopped by itself', async () => {
    const { dictation, set } = fakeDictation();
    const takes = new Takes(dictation, () => {});
    const insert = vi.fn();
    await takes.toggle('logline', insert);
    set({ phase: 'working', level: 0 });
    await settle();
    expect(dictation.stop).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith('the words');
  });

  it('says what went wrong at the field it was for, and nothing for a cancelled take', async () => {
    const { dictation, reply } = fakeDictation();
    const takes = new Takes(dictation, () => {});
    reply(new DictationError('nothing_heard'));
    await takes.toggle('logline', () => {});
    await takes.toggle('logline', () => {});
    expect(takes.forField('logline').problem).toBe(
      "I didn't catch that. Try again, a little closer.",
    );
    expect(takes.forField('synopsis').problem).toBeNull();
    reply(new DictationError('cancelled'));
    await takes.toggle('logline', () => {});
    await takes.toggle('logline', () => {});
    expect(takes.forField('logline').problem).toBeNull();
  });

  it('says so when the microphone can’t be opened', async () => {
    const { dictation } = fakeDictation();
    vi.mocked(dictation.start).mockRejectedValueOnce(new DictationError('permission_denied'));
    const takes = new Takes(dictation, () => {});
    await takes.toggle('logline', () => {});
    expect(takes.forField('logline')).toMatchObject({
      phase: 'idle',
      problem: "StoryStage can't use the microphone. You can let it in your device's settings.",
    });
  });
});

describe('Talk to type in the studio', () => {
  const speechHost: HostInterface = { ...browserHost, speech: {} as SpeechModels };
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('crossOriginIsolated', true);
  });
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('offers no mic, and no setting, where the host doesn’t allow dictation', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    expect(screen.queryByRole('button', { name: 'Say it: Logline' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByRole('switch', { name: /Talk to type/ })).toBeNull();
  });

  it('is off until the learner turns it on in Settings', async () => {
    const user = userEvent.setup();
    const { dictation } = fakeDictation();
    render(
      <App start={exampleProduction()} host={speechHost} makeDictation={async () => dictation} />,
    );
    expect(screen.queryByRole('button', { name: 'Say it: Logline' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const toggle = screen.getByRole('switch', { name: /Talk to type/ });
    expect(screen.getByText(/stays on this device and is never sent anywhere/)).toBeTruthy();
    await user.click(toggle);
    expect(talkToTypeSetting.get()).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('button', { name: 'Say it: Logline' })).toBeTruthy();
  });

  it('puts the words said into the logline as one undo step', async () => {
    const user = userEvent.setup();
    talkToTypeSetting.set(true);
    const { dictation, reply } = fakeDictation();
    const p = exampleProduction();
    render(<App start={p} host={speechHost} makeDictation={async () => dictation} />);
    const field = screen.getByRole('textbox', { name: 'Logline' }) as HTMLInputElement;
    await user.clear(field);
    await user.type(field, 'A penguin');
    await user.tab();
    const mic = await screen.findByRole('button', { name: 'Say it: Logline' });
    await user.click(mic);
    expect(screen.getByRole('button', { name: 'Stop listening: Logline' })).toBeTruthy();
    expect(field.closest('.ss-field')?.querySelector('[role=status]')?.textContent).toMatch(
      /^Listening…/,
    );
    reply('drifts away on the ice.');
    await user.click(screen.getByRole('button', { name: 'Stop listening: Logline' }));
    await waitFor(() => expect(field.value).toBe('A penguin drifts away on the ice.'));
    // The typing and the words are two steps: Undo takes away only the words.
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^Undo/ }));
    });
    expect(field.value).toBe('A penguin');
  });
});
