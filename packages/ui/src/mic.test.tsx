import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TextField, insertWords, type FieldSpeech } from './TextField.tsx';

// Talk to type on a field (spec 06 sections 1.5 and 1.7): the mic shows the take, and the words
// go in at the caret as the field's own change.

describe('insertWords', () => {
  it('puts the words at the caret, with a space where the text runs on', () => {
    expect(insertWords('The fox', 'and the penguin', 7, 7)).toEqual({
      value: 'The fox and the penguin',
      caret: 23,
    });
    expect(insertWords('fox', 'The', 0, 0)).toEqual({ value: 'The fox', caret: 4 });
    expect(insertWords('', '  Hello there. ', 0, 0)).toEqual({ value: 'Hello there.', caret: 12 });
  });

  it('replaces the selection', () => {
    expect(insertWords('The red fox', 'brown', 4, 7).value).toBe('The brown fox');
  });

  it('keeps to the field’s limit', () => {
    expect(insertWords('Kite', 'flies high over the hill', 4, 4, 12)).toEqual({
      value: 'Kite flies h',
      caret: 12,
    });
    expect(insertWords('Full', 'more', 4, 4, 4).value).toBe('Full');
  });

  it('leaves the field alone when nothing was heard', () => {
    expect(insertWords('Kite', '   ', 4, 4)).toEqual({ value: 'Kite', caret: 4 });
  });
});

/** A take the test drives: what the field asked for, and a way to answer. */
function fakeSpeech(over: Partial<FieldSpeech> = {}) {
  let insert: ((words: string) => void) | null = null;
  const speech: FieldSpeech = {
    phase: 'idle',
    level: 0,
    problem: null,
    toggle: vi.fn((i: (words: string) => void) => void (insert = i)),
    cancel: vi.fn(),
    ...over,
  };
  return { speech, say: (words: string) => insert?.(words) };
}

function Logline({ speech, start = '' }: { speech: FieldSpeech; start?: string }) {
  const [value, setValue] = useState(start);
  return (
    <TextField label="Logline" value={value} onChange={setValue} maxLength={40} speech={speech} />
  );
}

describe('the mic on a field', () => {
  it('starts a take, and puts the words in at the caret, back in the field', async () => {
    const user = userEvent.setup();
    const { speech, say } = fakeSpeech();
    render(<Logline speech={speech} start="A kite" />);
    const field = screen.getByRole('textbox', { name: 'Logline' }) as HTMLInputElement;
    await user.click(field);
    field.setSelectionRange(6, 6);
    await user.click(screen.getByRole('button', { name: 'Say it: Logline' }));
    expect(speech.toggle).toHaveBeenCalledOnce();
    say('flies over the hill.');
    await screen.findByDisplayValue('A kite flies over the hill.');
    // Focus goes back to the field in an effect after the words are in: wait for it.
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field.selectionStart).toBe(27);
  });

  it('shows the microphone is on, and Esc cancels the take', async () => {
    const user = userEvent.setup();
    const { speech } = fakeSpeech({ phase: 'listening', level: 0.6 });
    render(<Logline speech={speech} />);
    const mic = screen.getByRole('button', { name: 'Stop listening: Logline' });
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/^Listening…/)).toBeTruthy();
    expect(document.querySelector('.ss-mic-level')).toBeTruthy();
    mic.focus();
    await user.keyboard('{Escape}');
    expect(speech.cancel).toHaveBeenCalledOnce();
  });

  it('says it’s working out the words, and a tap then does nothing', async () => {
    const user = userEvent.setup();
    const { speech } = fakeSpeech({ phase: 'working' });
    render(<Logline speech={speech} />);
    expect(screen.getByText('Working out the words…')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Say it: Logline' }));
    expect(speech.toggle).not.toHaveBeenCalled();
  });

  it('says what went wrong, in plain words', () => {
    const { speech } = fakeSpeech({ problem: 'I didn’t catch that. Try again, a little closer.' });
    render(<Logline speech={speech} />);
    expect(screen.getByText('I didn’t catch that. Try again, a little closer.')).toBeTruthy();
  });
});
