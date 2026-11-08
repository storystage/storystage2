import { exampleProduction } from '@storystage/production';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { PrintStoryboard } from './PrintStoryboard.tsx';

afterEach(() => {
  delete (window as { print?: unknown }).print;
});

describe('the storyboard print layout (10.7)', () => {
  it('has the title, logline and synopsis, then each scene with its frames', () => {
    const p = exampleProduction();
    render(<PrintStoryboard production={p} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(p.manifest.title);
    expect(screen.getByText(p.storyboard.logline)).toBeTruthy();
    expect(screen.getByText(p.storyboard.synopsis)).toBeTruthy();
    const scenes = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(scenes).toEqual([
      'Scene 1 · Ice shelf, morningBeginning',
      'Scene 2 · Forest, nightMiddle',
      'Scene 3 · Ice shelf, eveningEnd',
    ]);
    const first = within(screen.getByRole('list', { name: 'Frames in scene 1' })).getAllByRole(
      'listitem',
    )[0]!;
    expect(first.textContent).toContain('Frame 1.1');
    expect(first.textContent).toContain('Wide');
    expect(first.textContent).toContain('3 s');
    expect(first.textContent).toContain('Pip at the edge of the ice');
    // Line 1 is pinned to frame 1.1.
    expect(first.textContent).toContain('Pip slides to the edge of the ice.');
    expect(first.querySelectorAll('.sb-print-sketch')).toHaveLength(1);
    expect(first.querySelector('.sb-print-marks')).toBeTruthy();
  });

  it('opens the device’s print dialog, and puts the layout away when it closes', async () => {
    // happy-dom has no print dialog: a stand-in records the call.
    const print = vi.fn();
    window.print = print;
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    expect(document.querySelector('.sb-print-root')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Print storyboard' }));
    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelector('.sb-print-root .sb-print')).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue('--sb-print-title')).toBe(
      '"The Lost Penguin"',
    );
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(document.querySelector('.sb-print-root')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--sb-print-title')).toBe('');
  });
});
