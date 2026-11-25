import { ThemeRoot } from '@storystage/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewStep } from '@storystage/stage';
import { VIEW_STEPS, ViewPad } from './ViewPad.tsx';

// The scene view's buttons for moving the view (the owner, 24 Nov 2026, through S2): slide, circle
// round, tilt and zoom, each named in plain words, repeating while held.

/** A quick rhythm, so a hold repeats within the test: first after 60 ms, then every 15 ms. */
const QUICK = { first: 60, every: 15 };
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

function open(props: { isDisabled?: boolean } = {}) {
  const onMove = vi.fn<(step: ViewStep) => void>();
  const onMoveEnd = vi.fn();
  const pad = (more: { isDisabled?: boolean }) => (
    <ThemeRoot>
      <ViewPad onMove={onMove} onMoveEnd={onMoveEnd} repeat={QUICK} {...props} {...more} />
    </ThemeRoot>
  );
  const { rerender } = render(pad({}));
  return { onMove, onMoveEnd, disable: () => rerender(pad({ isDisabled: true })) };
}

const pad = () => screen.getByRole('toolbar', { name: 'Move the view' });

describe('ViewPad', () => {
  it('names every button in plain words, in four groups', () => {
    open();
    const names = within(pad())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      'Slide left',
      'Slide up',
      'Slide down',
      'Slide right',
      'Circle round to the left',
      'Circle round to the right',
      'Rise and look down',
      'Drop and look up',
      'Zoom in',
      'Zoom out',
    ]);
    for (const group of ['Slide', 'Circle round', 'Tilt', 'Zoom'])
      expect(within(pad()).getByRole('group', { name: group })).toBeTruthy();
    expect(VIEW_STEPS).toHaveLength(10);
  });

  it('moves once for a click, and says when the move ends', async () => {
    const user = userEvent.setup();
    const { onMove, onMoveEnd } = open();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(onMove.mock.calls).toEqual([['zoomIn']]);
    expect(onMoveEnd).toHaveBeenCalledTimes(1);
  });

  it('repeats while held, as a held key does, and stops when let go', async () => {
    const user = userEvent.setup();
    const { onMove, onMoveEnd } = open();
    const circle = screen.getByRole('button', { name: 'Circle round to the left' });
    await user.pointer({ keys: '[MouseLeft>]', target: circle });
    expect(onMove).toHaveBeenCalledTimes(1);
    await wait(200);
    expect(onMove.mock.calls.length).toBeGreaterThan(3);
    expect(onMove.mock.calls.every(([s]) => s === 'circleLeft')).toBe(true);
    expect(onMoveEnd).not.toHaveBeenCalled();
    await user.pointer({ keys: '[/MouseLeft]', target: circle });
    const held = onMove.mock.calls.length;
    await wait(100);
    expect(onMove).toHaveBeenCalledTimes(held);
    expect(onMoveEnd).toHaveBeenCalledTimes(1);
  });

  it('repeats while Space is held on a button, from the keyboard', async () => {
    const user = userEvent.setup();
    const { onMove, onMoveEnd } = open();
    screen.getByRole('button', { name: 'Rise and look down' }).focus();
    await user.keyboard('[Space>]');
    await wait(200);
    expect(onMove.mock.calls.length).toBeGreaterThan(3);
    expect(onMove.mock.calls.every(([s]) => s === 'riseAndLookDown')).toBe(true);
    await user.keyboard('[/Space]');
    expect(onMoveEnd).toHaveBeenCalledTimes(1);
  });

  it('shows each button’s words as a tooltip, as keyboard focus reaches it', async () => {
    const user = userEvent.setup();
    open();
    await user.tab();
    await user.keyboard('{ArrowRight}');
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toBe(document.activeElement?.getAttribute('aria-label'));
  });

  it('ends a hold when the buttons turn off in the middle of it, as a run starts', async () => {
    const user = userEvent.setup();
    const { onMove, onMoveEnd, disable } = open();
    await user.pointer({
      keys: '[MouseLeft>]',
      target: screen.getByRole('button', { name: 'Zoom in' }),
    });
    await wait(150);
    disable();
    const moves = onMove.mock.calls.length;
    expect(onMoveEnd).toHaveBeenCalledTimes(1);
    await wait(150);
    expect(onMove).toHaveBeenCalledTimes(moves);
  });

  it('moves between its buttons by the arrow keys, as a toolbar', async () => {
    const user = userEvent.setup();
    open();
    await user.tab();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Slide left');
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Slide up');
  });

  it('switches every button off while the view can’t move', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onMove } = open({ isDisabled: true });
    const zoom = screen.getByRole('button', { name: 'Zoom out' });
    expect(zoom).toHaveProperty('disabled', true);
    await user.click(zoom);
    expect(onMove).not.toHaveBeenCalled();
  });
});
