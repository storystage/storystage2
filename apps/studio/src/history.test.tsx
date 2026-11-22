import { Dialog, ThemeRoot } from '@storystage/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { Menu, MenuItem, MenuTrigger, Button as AriaButton, Popover } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import { useHistory } from './history.tsx';
import type { Studio } from './studio.ts';

// The Undo keys (07-ux 6.8 and 7.5) belong to the tab, with nothing over it.

function setUp(over: 'nothing' | 'dialog' | 'menu') {
  const undo = vi.fn();
  function View() {
    useHistory({ undoLabel: 'Add owl', redoLabel: null, undo } as unknown as Studio, () => {});
    return (
      <ThemeRoot>
        <button type="button">Stage</button>
        <Dialog isOpen={over === 'dialog'} onOpenChange={() => {}} title="Delete?">
          <p>Words</p>
        </Dialog>
        <MenuTrigger isOpen={over === 'menu'}>
          <AriaButton>More</AriaButton>
          <Popover>
            <Menu aria-label="More">
              <MenuItem>Pin</MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </ThemeRoot>
    );
  }
  render(<View />);
  return undo;
}
const ctrlZ = (target: Element) => fireEvent.keyDown(target, { key: 'z', ctrlKey: true });

describe('the Undo keys', () => {
  it('undo from the tab', () => {
    const undo = setUp('nothing');
    ctrlZ(screen.getByRole('button', { name: 'Stage' }));
    expect(undo).toHaveBeenCalledOnce();
  });

  it('do nothing from a dialog, nor from the page while one is open', () => {
    const undo = setUp('dialog');
    ctrlZ(screen.getByRole('dialog'));
    ctrlZ(document.body);
    expect(undo).not.toHaveBeenCalled();
  });

  it('do nothing from a menu', () => {
    const undo = setUp('menu');
    ctrlZ(screen.getByRole('menuitem', { name: 'Pin' }));
    expect(undo).not.toHaveBeenCalled();
  });
});
