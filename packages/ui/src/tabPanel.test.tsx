import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Tab, TabList, Tabs, type Key } from 'react-aria-components';
import { describe, expect, it } from 'vitest';
import { useTabPanel } from './tabPanel.ts';

function Example() {
  const [open, setOpen] = useState<Key>('a');
  const { tabRef, panelRef } = useTabPanel();
  return (
    <>
      <Tabs selectedKey={open} onSelectionChange={setOpen}>
        <TabList aria-label="Methods">
          {['a', 'b'].map((id) => (
            <Tab key={id} id={id} {...(id === open ? { ref: tabRef } : {})}>
              Method {id}
            </Tab>
          ))}
        </TabList>
      </Tabs>
      <div key={String(open)} ref={panelRef} role="tabpanel">
        <button type="button">Code of {String(open)}</button>
      </div>
    </>
  );
}

describe('useTabPanel', () => {
  it('names the panel by the selected tab, as its aria-controls says, and follows the choice', async () => {
    render(<Example />);
    const check = (name: string) => {
      const tab = screen.getByRole('tab', { name });
      const panel = screen.getByRole('tabpanel', { name });
      expect(panel.id).not.toBe('');
      expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    };
    check('Method a');
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Method b' }));
    check('Method b');
    // No tab stop of the panel's own: the code has one.
    expect(screen.getByRole('tabpanel').hasAttribute('tabindex')).toBe(false);
  });
});
