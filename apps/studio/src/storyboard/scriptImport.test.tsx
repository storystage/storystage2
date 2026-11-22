import { FileError, browserHost, type FilePicker, type HostInterface } from '@storystage/host';
import { memoryFilePicker } from '@storystage/host/testing';
import { exampleProduction } from '@storystage/production';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { newProduction, setLogline, setSynopsis } from './edits.ts';

const hostWith = (picker: FilePicker): HostInterface => ({ ...browserHost, picker });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const isDisabled = (el: HTMLElement) =>
  el.hasAttribute('disabled') || el.hasAttribute('data-disabled');
const scriptFile = () => screen.getByLabelText('Script file') as HTMLInputElement;
const ready = () =>
  setSynopsis(setLogline(newProduction(), 'A penguin finds home.'), 'Pip is lost, then found.');
const cards = () =>
  within(screen.getByRole('grid', { name: 'Scenes' }))
    .getAllByRole('row')
    .map((r) => r.textContent);

const SCRIPT = `EXT. ICE FIELD - DAY

Pip waddles across the ice.

PIP
Where is everyone?

INT. CAVE - NIGHT

The wind howls.
`;

describe('Import a script (10.4; 07-ux 6.6)', () => {
  it('makes the scenes and their lines, opens scene 1, and undoes in one step', async () => {
    const user = userEvent.setup();
    render(<App start={ready()} host={hostWith(memoryFilePicker())} />);
    await user.upload(scriptFile(), new File([SCRIPT], 'Pip.fountain'));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(cards()[0]).toContain('EXT. ICE FIELD - DAY');
    expect(cards()[1]).toContain('INT. CAVE - NIGHT');
    expect(screen.getByText('Imported 2 scenes and 3 lines. Scene 1 is open.')).toBeTruthy();
    const pane = screen.getByRole('complementary', { name: 'Script' });
    expect(pane.textContent).toContain('Where is everyone?');
    // Offered only while there are no scenes.
    expect(screen.queryByRole('button', { name: 'Import a script' })).toBeNull();
    expect(button(/^Undo/).textContent).toBe('Undo: Import the script');
    await user.click(button(/^Undo/));
    expect(screen.queryByRole('grid', { name: 'Scenes' })).toBeNull();
    expect(button('Import a script')).toBeTruthy();
  });

  it('waits for the logline and synopsis, as Add a scene does', () => {
    render(<App start={newProduction()} host={hostWith(memoryFilePicker())} />);
    expect(isDisabled(button('Import a script'))).toBe(true);
  });

  it('says why a script over the limits isn’t opened, and imports nothing', async () => {
    const user = userEvent.setup();
    render(<App start={ready()} host={hostWith(memoryFilePicker())} />);
    const many = Array.from({ length: 51 }, (_, i) => `INT. ROOM ${i + 1}`).join('\n\n');
    await user.upload(scriptFile(), new File([many], 'Long.fountain'));
    expect(
      await screen.findAllByText('That script has more than 50 scenes, so it can’t be opened.'),
    ).toBeTruthy();
    await user.upload(scriptFile(), new File(['x'.repeat(512 * 1024 + 1)], 'Huge.txt'));
    expect(
      await screen.findAllByText(
        'That script is too long to open: a script can be 512 KB at most.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('grid', { name: 'Scenes' })).toBeNull();
    expect(isDisabled(button(/^Undo/))).toBe(true);
  });
});

describe('Export the script (10.4)', () => {
  it('saves the script as a Fountain file named for the film', async () => {
    const user = userEvent.setup();
    const picker = memoryFilePicker();
    render(<App start={exampleProduction()} host={hostWith(picker)} />);
    await user.click(button('Export the script'));
    await waitFor(() => expect(picker.saved).toHaveLength(1));
    const [saved] = picker.saved;
    expect(saved!.name).toMatch(/\.fountain$/);
    expect(new TextDecoder().decode(saved!.bytes)).toContain('Logline: A penguin lost in a forest');
    expect(
      screen.getAllByText(
        'The script is saved as a Fountain file, which other script writers can open.',
      ),
    ).toHaveLength(2);
  });

  it('says nothing when the learner closes the picker, and why when it fails', async () => {
    const user = userEvent.setup();
    let failure: FileError = new FileError('cancelled');
    const picker: FilePicker = {
      ...memoryFilePicker(),
      saveCopy: () => Promise.reject(failure),
    };
    render(<App start={exampleProduction()} host={hostWith(picker)} />);
    await user.click(button('Export the script'));
    expect(screen.queryAllByText(/The script/)).toEqual([]);
    failure = new FileError('full');
    await user.click(button('Export the script'));
    expect(await screen.findAllByText('There isn’t room to save the script there.')).toBeTruthy();
  });

  it('waits for a scene', () => {
    render(<App start={ready()} host={hostWith(memoryFilePicker())} />);
    expect(isDisabled(button('Export the script'))).toBe(true);
  });
});
