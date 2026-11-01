import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ModePanel, ModeTabList, ModeTabs, type Mode } from './ModeTabs.tsx';

function Shell({ start = 'storyboard' as Mode }) {
  const [mode, setMode] = useState<Mode>(start);
  return (
    <ModeTabs mode={mode} onModeChange={setMode}>
      <ModeTabList />
      <ModePanel mode="storyboard">Plan your film</ModePanel>
      <ModePanel mode="production">Build and code</ModePanel>
      <ModePanel mode="screening">Watch the rough cut</ModePanel>
    </ModeTabs>
  );
}

describe('ModeTabs', () => {
  it('is a tab list of the three modes, in order', () => {
    render(<Shell />);
    expect(screen.getByRole('tablist', { name: 'Modes' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Storyboard',
      'Production stage',
      'Screening room',
    ]);
  });

  it('shows the chosen mode’s panel', () => {
    render(<Shell start="production" />);
    expect(
      screen.getByRole('tab', { name: 'Production stage' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('Build and code');
  });

  it('moves between modes with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Storyboard' }));
    await user.keyboard('{ArrowRight}');
    expect(
      screen.getByRole('tab', { name: 'Production stage' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('Build and code');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tabpanel').textContent).toBe('Watch the rough cut');
  });
});
