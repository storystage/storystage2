import type { SoundClip } from '@storystage/production';
import { ThemeRoot } from '@storystage/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SoundPlayer } from './player.ts';
import { TrimDialog } from './TrimDialog.tsx';

// The trim dialog, once, on import (07-ux 7.7).

const CLIP: SoundClip = {
  id: 'sn1',
  file: 'sn1.mp3',
  label: 'Rain',
  length: 12,
  bytes: 3,
  trim: { start: 0, end: 12 },
  licence: 'not-sure' as const,
  credit: 'A sound, source not checked',
};

function open(overrides: { player?: SoundPlayer } = {}) {
  const onAdd = vi.fn();
  const onCancel = vi.fn();
  const player: SoundPlayer = overrides.player ?? { play: vi.fn(), stop: vi.fn() };
  render(
    <ThemeRoot>
      <TrimDialog
        clip={CLIP}
        bytes={new Uint8Array([1, 2, 3])}
        peaks={new Float32Array([0.2, 0.8, 0.5])}
        player={player}
        onAdd={onAdd}
        onCancel={onCancel}
      />
    </ThemeRoot>,
  );
  return { onAdd, onCancel, player };
}

const start = () => screen.getByRole('slider', { name: 'Start' });
const end = () => screen.getByRole('slider', { name: 'End' });

describe('TrimDialog', () => {
  it('is titled, named from the file, and says a sound is trimmed once', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Trim your sound' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveProperty('value', 'Rain');
    expect(
      screen.getByText('You can trim a sound once. To trim it another way, import it again.'),
    ).toBeTruthy();
    expect(start().getAttribute('aria-valuetext')).toBe('Start, 0 seconds');
    expect(end().getAttribute('aria-valuetext')).toBe('End, 12 seconds');
    expect(screen.getByText('12 seconds kept')).toBeTruthy();
  });

  it("moves a handle by the keys, never past the other's tenth of a second", async () => {
    const user = userEvent.setup();
    open();
    start().focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(start().getAttribute('aria-valuenow')).toBe('0.2');
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(start().getAttribute('aria-valuenow')).toBe('1.2');
    await user.keyboard('{PageUp}');
    expect(start().getAttribute('aria-valuenow')).toBe('11.2');
    await user.keyboard('{End}');
    expect(start().getAttribute('aria-valuenow')).toBe('11.9');
    expect(screen.getByText('0.1 seconds kept')).toBeTruthy();
    await user.keyboard('{Home}');
    expect(start().getAttribute('aria-valuenow')).toBe('0');
    end().focus();
    await user.keyboard('{ArrowLeft}{PageDown}');
    expect(end().getAttribute('aria-valuenow')).toBe('1.9');
    expect(end().getAttribute('aria-valuetext')).toBe('End, 1.9 seconds');
    await user.keyboard('{Home}');
    expect(end().getAttribute('aria-valuenow')).toBe('0.1');
    expect(screen.getByText('0.1 seconds kept')).toBeTruthy();
  });

  it('takes a typed time, kept to where it can go', async () => {
    const user = userEvent.setup();
    open();
    const typedStart = screen.getByRole('textbox', { name: 'Start' });
    await user.clear(typedStart);
    await user.type(typedStart, '2.4{Enter}');
    expect(start().getAttribute('aria-valuetext')).toBe('Start, 2.4 seconds');
    const typedEnd = screen.getByRole('textbox', { name: 'End' });
    await user.clear(typedEnd);
    await user.type(typedEnd, '1{Tab}');
    expect(end().getAttribute('aria-valuenow')).toBe('2.5');
    expect(typedEnd).toHaveProperty('value', '2.5');
    expect(screen.getByText('0.1 seconds kept')).toBeTruthy();
  });

  it('plays only the part kept, and only when asked', async () => {
    const user = userEvent.setup();
    const { player } = open();
    expect(player.play).not.toHaveBeenCalled();
    start().focus();
    await user.keyboard('{Shift>}{ArrowRight}{ArrowRight}{/Shift}');
    await user.click(screen.getByRole('button', { name: 'Play this part' }));
    expect(player.play).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      'mp3',
      2,
      12,
      expect.any(Function),
    );
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(player.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play this part' })).toBeTruthy();
  });

  it('adds the sound with its name and the part kept', async () => {
    const user = userEvent.setup();
    const { onAdd, player } = open();
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, '  Heavy rain ');
    end().focus();
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    await user.click(screen.getByRole('button', { name: 'Add sound' }));
    expect(onAdd).toHaveBeenCalledWith({
      ...CLIP,
      label: 'Heavy rain',
      trim: { start: 0, end: 11 },
      licence: 'not-sure' as const,
      credit: 'A sound, source not checked',
    });
    expect(player.stop).toHaveBeenCalled();
  });

  it("keeps the file's name when the name is left empty", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.click(screen.getByRole('button', { name: 'Add sound' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ label: 'Rain' }));
  });

  it('adds nothing on Cancel or Esc', async () => {
    const user = userEvent.setup();
    const { onAdd, onCancel } = open();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('hides the waveform from screen readers', () => {
    open();
    const wave = document.querySelector('.sd-wave');
    expect(wave?.getAttribute('aria-hidden')).toBe('true');
  });
});
