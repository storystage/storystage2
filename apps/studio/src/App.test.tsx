import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { newProduction } from './storyboard/edits.ts';

describe('App', () => {
  it('opens on the Storyboard, in the dark theme', () => {
    const { container } = render(<App start={newProduction()} />);
    expect(screen.getByRole('tab', { name: 'Storyboard' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect((container.firstElementChild as HTMLElement).dataset.theme).toBe('dark');
  });
});
