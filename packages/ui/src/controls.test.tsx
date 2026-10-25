import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox, NeutralNote, RadioCards, Toggle } from './Choice.tsx';
import { Dialog } from './Dialog.tsx';
import { Segmented } from './Segmented.tsx';
import { TextField } from './TextField.tsx';

const SHOTS = [
  { id: 'wide', label: 'Wide' },
  { id: 'medium', label: 'Medium' },
  { id: 'closeUp', label: 'Close-up' },
] as const;
type Shot = (typeof SHOTS)[number]['id'];

describe('Segmented', () => {
  function Shots() {
    const [shot, setShot] = useState<Shot>('medium');
    return <Segmented label="Shot" options={SHOTS} value={shot} onChange={setShot} />;
  }

  const checked = (name: string) =>
    (screen.getByRole('radio', { name }) as HTMLInputElement).checked;

  it('is a named group with exactly one choice', () => {
    render(<Shots />);
    expect(screen.getByRole('radiogroup', { name: 'Shot' })).toBeTruthy();
    expect(SHOTS.filter((s) => checked(s.label)).map((s) => s.label)).toEqual(['Medium']);
  });

  it('changes the choice with a click, and never to none', async () => {
    const user = userEvent.setup();
    render(<Shots />);
    await user.click(screen.getByRole('radio', { name: 'Wide' }));
    expect(checked('Wide')).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'Wide' }));
    expect(checked('Wide')).toBe(true);
  });

  it('lands on the chosen segment, and the arrow keys choose the next', async () => {
    const user = userEvent.setup();
    render(<Shots />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Medium' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Close-up' }));
    expect(checked('Close-up')).toBe(true);
  });
});

describe('Toggle', () => {
  it('is a switch named by its label, turned with Space', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Toggle isSelected={false} onChange={onChange}>
        Lock for pupils
      </Toggle>,
    );
    const toggle = screen.getByRole('switch', { name: 'Lock for pupils' });
    await user.tab();
    expect(document.activeElement).toBe(toggle);
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Checkbox', () => {
  it('is a check box named by its label', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Checkbox isSelected={false} onChange={onChange}>
        Don’t explain this again
      </Checkbox>,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Don’t explain this again' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('RadioCards', () => {
  const LEVELS = [
    { value: 'off', label: 'Off', description: 'Not available to pupils' },
    { value: 'explain', label: 'Explain only', description: 'Answers questions, changes nothing' },
    { value: 'plan', label: 'Plan only', description: 'Suggests plans; pupils build them' },
    { value: 'full', label: 'Full', description: 'Plans and builds when asked' },
  ] as const;

  it('is a labelled radio group; each option is named by its label and description', () => {
    render(<RadioCards label="The Prompter" options={LEVELS} value="plan" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'The Prompter' })).toBeTruthy();
    const plan = screen.getByRole('radio', { name: 'Plan only Suggests plans; pupils build them' });
    expect((plan as HTMLInputElement).checked).toBe(true);
  });

  it('chooses with the arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RadioCards label="The Prompter" options={LEVELS} value="plan" onChange={onChange} />);
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenCalledWith('full');
  });
});

describe('TextField', () => {
  it('is a labelled text box with a mic button named for it', async () => {
    const user = userEvent.setup();
    const onSpeak = vi.fn();
    render(<TextField label="Logline" onSpeak={onSpeak} />);
    expect(screen.getByRole('textbox', { name: 'Logline' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Say it: Logline' }));
    expect(onSpeak).toHaveBeenCalledOnce();
  });

  it('offers no mic where speaking must not be offered, such as the key field', () => {
    render(<TextField label="Claude key" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('takes typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextField label="Type or say a line" hideLabel onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: 'Type or say a line' }), 'Hello');
    expect(onChange).toHaveBeenLastCalledWith('Hello');
  });
});

describe('Dialog', () => {
  function WithDialog({ dismissable = true }) {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Dialog
          isOpen={open}
          onOpenChange={setOpen}
          title="Export film"
          isDismissable={dismissable}
        >
          <p>Settings are locked while exporting.</p>
        </Dialog>
        <span data-testid="state">{open ? 'open' : 'closed'}</span>
      </>
    );
  }

  it('is a dialog named by its title', () => {
    render(<WithDialog />);
    expect(screen.getByRole('dialog', { name: 'Export film' })).toBeTruthy();
  });

  it('closes with its Close button and with Escape', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<WithDialog />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('state').textContent).toBe('closed');
    unmount();
    render(<WithDialog />);
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('state').textContent).toBe('closed');
  });

  it('stays open on Escape when it must be finished', async () => {
    const user = userEvent.setup();
    render(<WithDialog dismissable={false} />);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Export film' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});

describe('NeutralNote', () => {
  it('is a note, not an alert', () => {
    render(<NeutralNote>The Prompter is switched off by your school.</NeutralNote>);
    expect(screen.getByRole('note').textContent).toContain('switched off by your school');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
