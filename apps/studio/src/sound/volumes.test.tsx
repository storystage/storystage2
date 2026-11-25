import { exampleProduction, mixOf, withMix, type Production } from '@storystage/production';
import { ThemeRoot } from '@storystage/ui';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useStudio, type Studio } from '../studio.ts';
import { Volumes } from './Volumes.tsx';

// The tracks' volumes, for the whole film (07-ux 7.7; `withMix`).

function open(start: Production = exampleProduction(), readOnly = false) {
  let studio: Studio | null = null;
  function Harness() {
    const s = useStudio(start);
    studio = s;
    return (
      <ThemeRoot>
        <Volumes studio={s} readOnly={readOnly} />
        <button type="button">Elsewhere</button>
      </ThemeRoot>
    );
  }
  render(<Harness />);
  return () => studio!;
}

const slider = (track: string) => screen.getByRole('slider', { name: track });
const percent = (track: string) =>
  screen.getByRole('textbox', { name: `${track} as a percentage` });

describe('Volumes', () => {
  it('shows each track’s volume, 100%, 70% and 90% until changed, for the whole film', () => {
    open();
    expect(screen.getByRole('region', { name: 'Volumes' })).toBeTruthy();
    expect(screen.getByText('For the whole film')).toBeTruthy();
    expect(slider('Speech').getAttribute('aria-valuetext')).toBe('100%');
    expect(slider('Music').getAttribute('aria-valuetext')).toBe('70%');
    expect(slider('Sound FX').getAttribute('aria-valuetext')).toBe('90%');
    expect((percent('Music') as HTMLInputElement).value).toBe('70%');
    expect(screen.getByText('Music is quieter under speech in an exported film.')).toBeTruthy();
  });

  it('shows the film’s own mix', () => {
    open(withMix(exampleProduction(), { speech: 0.5, music: 0.25, effects: 1 }));
    expect(slider('Speech').getAttribute('aria-valuetext')).toBe('50%');
    expect(slider('Music').getAttribute('aria-valuetext')).toBe('25%');
  });

  it('makes a run of arrow keys on one slider one undo step, named where it stopped', async () => {
    const user = userEvent.setup();
    const studio = open();
    slider('Music').focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(mixOf(studio().production).music).toBeCloseTo(0.67);
    expect(studio().undoLabel).toBe('Set Music to 67%');
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(studio().undoLabel).toBe('Set Music to 67%');
    act(() => studio().undo());
    expect(studio().undoLabel).toBeNull();
  });

  it('takes a percentage typed, as one step', async () => {
    const user = userEvent.setup();
    const studio = open();
    await user.tripleClick(percent('Speech'));
    await user.keyboard('60{Enter}');
    expect(mixOf(studio().production)).toEqual({ speech: 0.6, music: 0.7, effects: 0.9 });
    expect(studio().undoLabel).toBe('Set Speech to 60%');
  });

  it('keeps a typed volume from 0% to 100%', async () => {
    const user = userEvent.setup();
    const studio = open();
    await user.tripleClick(percent('Sound FX'));
    await user.keyboard('250{Enter}');
    expect(mixOf(studio().production).effects).toBe(1);
  });

  it('changes nothing in a film that can’t be changed', () => {
    open(exampleProduction(), true);
    expect(slider('Music')).toHaveProperty('disabled', true);
    expect(percent('Music')).toHaveProperty('disabled', true);
  });
});
