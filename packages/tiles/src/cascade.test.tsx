import type { Expression } from '@storystage/ast';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DetailMenu, ValueMenu } from './cascade.ts';
import { fixture, IDS } from './fixture.ts';

// The cascade on its own, as the Blocks editor uses it: no TileEditor, just an anchor.

function anchor() {
  const button = document.createElement('button');
  button.textContent = 'forward';
  document.body.append(button);
  return button;
}

describe('@storystage/tiles/cascade', () => {
  it('gives a slot’s values, opening on the one there now, and hands back the choice', async () => {
    const onChoose = vi.fn<(value: Expression) => void>();
    const onClose = vi.fn();
    render(
      <ValueMenu
        program={fixture()}
        place={{ kind: 'value', node: IDS.move, slot: 'args', param: 'direction' }}
        label="direction"
        current="forward"
        anchor={anchor()}
        onChoose={onChoose}
        onAsk={() => undefined}
        onClose={onClose}
      />,
    );
    const menu = await screen.findByRole('menu', { name: 'direction' });
    expect(menu).toBeTruthy();
    expect(
      screen.getByRole('menuitemradio', { name: 'forward' }).getAttribute('aria-checked'),
    ).toBe('true');
    await userEvent.setup().click(screen.getByRole('menuitemradio', { name: 'backward' }));
    expect(onChoose).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'enum', value: 'backward' }),
    );
  });

  it('gives the details a block can still take', async () => {
    const onChoose = vi.fn<(detail: string) => void>();
    render(
      <DetailMenu
        program={fixture()}
        node={IDS.say}
        anchor={anchor()}
        onChoose={onChoose}
        onClose={() => undefined}
      />,
    );
    const items = await screen.findAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(0);
    await act(async () => {
      await userEvent.setup().click(items[0]!);
    });
    expect(onChoose).toHaveBeenCalledTimes(1);
  });
});
