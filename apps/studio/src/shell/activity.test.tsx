import type { ExportJobState } from '@storystage/screening';
import { ThemeRoot } from '@storystage/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { exportActivity } from '../App.tsx';
import { Shell } from './Shell.tsx';

// An export as a badge on the Screening room's tab (S2's #317): "64%" wherever the learner is,
// heard with the tab's name, and taking no width from the header.

describe('exportActivity', () => {
  it('says how far an export has got, and when it needs the learner', () => {
    const running = {
      kind: 'running',
      step: 'frames',
      fraction: 0.647,
      secondsLeft: 30,
    } as ExportJobState;
    expect(exportActivity(running)).toEqual({ label: 'exporting 64%', short: '64%' });
    expect(exportActivity({ kind: 'unsaved', name: 'Kite' })).toEqual({
      label: 'the exported film isn’t saved yet',
      short: 'Save',
    });
    expect(exportActivity({ kind: 'failed', words: 'No room.' })?.label).toBe('the export stopped');
    expect(exportActivity({ kind: 'refused', reasons: [] })?.label).toBe('the export stopped');
  });

  it('says nothing before an export starts, or once it’s saved', () => {
    expect(exportActivity({ kind: 'idle' })).toBeNull();
    expect(exportActivity({ kind: 'done', name: 'Kite', capped: false })).toBeNull();
  });
});

describe('a badge on a mode’s tab', () => {
  const panels = { storyboard: 'Plan', production: 'Build', screening: 'Watch' };

  it('shows on the tab and is heard with its name', () => {
    render(
      <ThemeRoot>
        <Shell panels={panels} badges={{ screening: { text: '64%', spoken: 'exporting 64%' } }} />
      </ThemeRoot>,
    );
    const tab = screen.getByRole('tab', { name: /Screening room\s*,\s*exporting 64%/ });
    expect(tab.querySelector('.ss-mode-tab-badge')?.textContent).toBe('64%');
  });

  it('isn’t there without one', () => {
    render(
      <ThemeRoot>
        <Shell panels={panels} />
      </ThemeRoot>,
    );
    expect(document.querySelector('.ss-mode-tab-badge')).toBeNull();
  });
});
