import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Shell, type ShellProps } from './Shell.tsx';

const PANELS: ShellProps['panels'] = {
  storyboard: <p>Plan your film</p>,
  production: <p>Build and code</p>,
  screening: <p>Watch the rough cut</p>,
};

function renderShell(props: Partial<ShellProps> = {}) {
  return render(
    <Shell panels={PANELS} learn={<p>Guided films</p>} settings={<p>Class set-up</p>} {...props} />,
  );
}

describe('Shell', () => {
  it('has a header, the three modes as tabs, and the working area', () => {
    renderShell();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Storyboard',
      'Production stage',
      'Screening room',
    ]);
    const main = screen.getByRole('main');
    expect(main.textContent).toContain('Plan your film');
  });

  it('names the open mode with a heading', () => {
    renderShell({ initialMode: 'screening' });
    expect(screen.getByRole('heading', { level: 1, name: 'Screening room' })).toBeTruthy();
    expect(screen.getByRole('main').textContent).toContain('Watch the rough cut');
  });

  it('shows the production’s title and sub-line when there is one', () => {
    renderShell({ title: 'The Owl and the Key', subtitle: 'Scene 2 · Frame 2.3' });
    const banner = screen.getByRole('banner');
    expect(banner.textContent).toContain('The Owl and the Key');
    expect(banner.textContent).toContain('Scene 2 · Frame 2.3');
  });

  it('changes mode with the arrow keys', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Storyboard' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('main').textContent).toContain('Build and code');
  });

  it('opens Settings over the current mode and goes back to it', async () => {
    const user = userEvent.setup();
    renderShell({ initialMode: 'production' });
    const settings = screen.getByRole('button', { name: 'Settings' });
    await user.click(settings);
    expect(settings.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Settings' }).textContent).toContain('Class set-up');
    // The mode underneath is hidden, so the keyboard can't reach it.
    expect(screen.getByText('Build and code').closest('[hidden]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to Production stage' }));
    expect(settings.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Build and code').closest('[hidden]')).toBeNull();
  });

  it('opens one of Learn and Settings at a time, and choosing a mode closes them', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Learn' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('button', { name: 'Learn' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('region', { name: 'Settings' }).textContent).toContain('Class set-up');
    await user.click(screen.getByRole('tab', { name: 'Screening room' }));
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('main').textContent).toContain('Watch the rough cut');
  });

  it('has the note for narrow windows ready (decision 0033)', () => {
    renderShell();
    expect(screen.getByRole('note').textContent).toBe(
      'Turn your iPad sideways, or make the window wider.',
    );
  });
});
