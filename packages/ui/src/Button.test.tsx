import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button.tsx';

describe('Button', () => {
  it('is a button named by its label, with its icon hidden from screen readers', () => {
    render(<Button icon="play_arrow">Rehearse</Button>);
    const button = screen.getByRole('button', { name: 'Rehearse' });
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is pressed with Enter and with Space', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Build these steps</Button>);
    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('shows the focus ring for keyboard focus, not for a click', async () => {
    const user = userEvent.setup();
    render(<Button>Keep it</Button>);
    const button = screen.getByRole('button', { name: 'Keep it' });
    await user.click(button);
    expect(button.hasAttribute('data-focus-visible')).toBe(false);
    await user.tab();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(button);
    expect(button.hasAttribute('data-focus-visible')).toBe(true);
  });

  it('keeps its label when unavailable, and does nothing when pressed', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <Button isDisabled onPress={onPress} icon="play_arrow">
        Rehearse
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Rehearse' });
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.hasAttribute('data-disabled')).toBe(true);
  });

  it('marks its variant and size for the styles', () => {
    render(
      <Button variant="stop" icon="stop" size="key">
        Stop
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Stop' });
    expect(button.dataset.variant).toBe('stop');
    expect(button.dataset.size).toBe('key');
    expect(button.querySelector('[data-icon="stop"]')).not.toBeNull();
  });
});
