import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AiBadge, FRAME_STATUSES, StatusChip } from './StatusChip.tsx';

describe('StatusChip', () => {
  it.each([
    ['planned', 'Planned', 'edit_note'],
    ['staged', 'Staged', 'view_in_ar'],
    ['coded', 'Coded', 'extension'],
    ['rehearsed', 'Rehearsed', 'replay'],
    ['checked', 'Checked', 'check_circle'],
    ['lookAt', 'Look at', 'flag'],
  ] as const)('shows %s as its word and its icon, never colour alone', (status, word, icon) => {
    const { container } = render(<StatusChip status={status} />);
    expect(screen.getByText(word)).toBeTruthy();
    expect(container.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
  });

  it('covers every frame status', () => {
    expect(FRAME_STATUSES).toHaveLength(6);
  });
});

describe('AiBadge', () => {
  it('says AI', () => {
    render(<AiBadge />);
    expect(screen.getByText('AI')).toBeTruthy();
  });
});
