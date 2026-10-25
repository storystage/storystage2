import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FrameStrip, type SceneFrames } from './FrameStrip.tsx';

const SCENES: SceneFrames[] = [
  {
    id: 's1',
    title: 'Scene 1',
    frames: [
      { id: 'f11', number: '1.1', status: 'checked' },
      { id: 'f12', number: '1.2', status: 'rehearsed' },
    ],
  },
  {
    id: 's2',
    title: 'Scene 2',
    frames: [
      { id: 'f21', number: '2.1', status: 'coded' },
      { id: 'f22', number: '2.2', status: 'planned' },
    ],
  },
];

function Strip({ onFrameChange = () => {} }: { onFrameChange?: (id: string) => void }) {
  const [current, setCurrent] = useState('f21');
  return (
    <FrameStrip
      scenes={SCENES}
      currentFrame={current}
      onFrameChange={(id) => {
        setCurrent(id);
        onFrameChange(id);
      }}
    />
  );
}

describe('FrameStrip', () => {
  it('lists every frame, named by its number and status', () => {
    render(<Strip />);
    expect(screen.getByRole('listbox', { name: 'Frames' })).toBeTruthy();
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual([
      'Frame 1.1, Checked',
      'Frame 1.2, Rehearsed',
      'Frame 2.1, Coded',
      'Frame 2.2, Planned',
    ]);
  });

  it('groups the frames by scene', () => {
    render(<Strip />);
    expect(screen.getByRole('group', { name: 'Scene 2' })).toBeTruthy();
  });

  it('marks the current frame', () => {
    render(<Strip />);
    const current = screen.getByRole('option', { name: 'Frame 2.1, Coded' });
    expect(current.getAttribute('aria-selected')).toBe('true');
  });

  it('chooses a frame with a click', async () => {
    const user = userEvent.setup();
    const onFrameChange = vi.fn();
    render(<Strip onFrameChange={onFrameChange} />);
    await user.click(screen.getByRole('option', { name: 'Frame 1.2, Rehearsed' }));
    expect(onFrameChange).toHaveBeenCalledWith('f12');
  });

  it('moves between frames with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Strip />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Frame 2.1, Coded' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Frame 2.2, Planned' }));
  });
});
