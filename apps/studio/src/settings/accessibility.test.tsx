import { exampleProduction } from '@storystage/production';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { appearanceSetting } from './appearance.ts';

// Settings › Accessibility (07-ux 2.2 and 4; decisions 0035, 0037): the theme and the text size.

/** A device that prefers light or dark, and can change its mind. */
function device(light: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: light,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.stubGlobal('matchMedia', () => query);
  return {
    prefer(nextLight: boolean) {
      query.matches = nextLight;
      for (const l of [...listeners]) l();
    },
  };
}

const root = () => document.querySelector('.ss-root') as HTMLElement;

beforeEach(() => {
  window.localStorage.clear();
  appearanceSetting.reload();
});
afterEach(() => {
  window.localStorage.clear();
  appearanceSetting.reload();
  vi.unstubAllGlobals();
});

describe('Settings › Accessibility', () => {
  it('is Dark at 100% until changed', () => {
    device(true);
    render(<App start={exampleProduction()} />);
    expect(root().dataset.theme).toBe('dark');
    expect(root().style.getPropertyValue('--ss-text-size')).toBe('1');
  });

  it('changes the theme and the text size at once, and keeps them on this device', async () => {
    const user = userEvent.setup();
    device(false);
    render(<App start={exampleProduction()} />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(root().dataset.theme).toBe('light');
    await user.click(screen.getByRole('radio', { name: '150%' }));
    expect(root().style.getPropertyValue('--ss-text-size')).toBe('1.5');
    expect(JSON.parse(window.localStorage.getItem('storystage.appearance')!)).toEqual({
      theme: 'light',
      textSize: 1.5,
    });
  });

  it('matches the device, following it as it changes', async () => {
    const user = userEvent.setup();
    const d = device(true);
    render(<App start={exampleProduction()} />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('radio', { name: 'Match this device' }));
    expect(root().dataset.theme).toBe('light');
    act(() => d.prefer(false));
    expect(root().dataset.theme).toBe('dark');
  });

  it('starts as it was left', () => {
    device(false);
    window.localStorage.setItem(
      'storystage.appearance',
      JSON.stringify({ theme: 'light', textSize: 1.25 }),
    );
    appearanceSetting.reload();
    render(<App start={exampleProduction()} />);
    expect(root().dataset.theme).toBe('light');
    expect(root().style.getPropertyValue('--ss-text-size')).toBe('1.25');
  });
});
