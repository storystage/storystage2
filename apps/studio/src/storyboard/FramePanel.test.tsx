import { exampleProduction } from '@storystage/production';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App.tsx';

const frameList = () => screen.getByRole('grid', { name: /^Frames in scene/ });
const frameNumbers = () =>
  within(frameList())
    .getAllByRole('row')
    .map((r) => r.querySelector('.sb-frame-number')!.textContent);
const undo = () => screen.getByRole('button', { name: /^Undo/ });
const canvasTitle = () => screen.getByRole('figure').querySelector('figcaption')!.textContent;

describe('frames (10.6)', () => {
  it('shows the current scene’s frames, the first one current', () => {
    render(<App start={exampleProduction()} />);
    expect(frameNumbers()).toEqual(['1.1']);
    expect(canvasTitle()).toContain('Frame 1.1');
  });

  it('adds a frame after the current one, makes it current, as one undo step', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(screen.getByRole('button', { name: 'Add a frame' }));
    expect(frameNumbers()).toEqual(['1.1', '1.2']);
    expect(canvasTitle()).toContain('Frame 1.2');
    expect(canvasTitle()).toContain('Medium');
    expect(canvasTitle()).toContain('3 s');
    expect(undo().textContent).toBe('Undo: Add frame 1.2');
    await user.click(undo());
    expect(frameNumbers()).toEqual(['1.1']);
  });

  it('follows the chosen scene', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    const scenes = within(screen.getByRole('grid', { name: 'Scenes' })).getAllByRole('row');
    await user.click(scenes[1]!);
    expect(screen.getByRole('grid', { name: 'Frames in scene 2' })).toBeTruthy();
    expect(canvasTitle()).toContain('Frame 2.1');
  });

  it('sets the shot, with the other three under More shots', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(screen.getByRole('radio', { name: 'Close-up' }));
    expect(canvasTitle()).toContain('Close-up');
    expect(undo().textContent).toBe('Undo: Change frame 1.1 to Close-up');
    expect(screen.queryByRole('radio', { name: 'Two shot' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More shots' }));
    await user.click(screen.getByRole('radio', { name: 'Two shot' }));
    expect(canvasTitle()).toContain('Two shot');
  });

  it('shows More shots open when the frame’s shot is one of them', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    const scenes = within(screen.getByRole('grid', { name: 'Scenes' })).getAllByRole('row');
    await user.click(scenes[1]!);
    expect((screen.getByRole('radio', { name: 'Two shot' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('steps the length in whole seconds: buttons for touch, arrow keys in the field', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    const start = exampleProduction().frames[0]!.lengthSeconds;
    // React Aria keeps the stepper buttons out of the Tab order and the accessibility tree: keyboard
    // and screen-reader users change the number with the arrow keys in the field.
    await user.click(screen.getByLabelText('Longer'));
    expect(canvasTitle()).toContain(`${start + 1} s`);
    await user.click(screen.getByLabelText('Shorter'));
    await user.click(screen.getByLabelText('Shorter'));
    expect(canvasTitle()).toContain(`${start - 1} s`);
    const field = screen.getByRole('textbox', { name: 'Length' });
    await user.click(field);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(canvasTitle()).toContain(`${start + 1} s`);
    await user.tab();
    expect(undo().textContent).toBe(`Undo: Make frame 1.1 ${start + 1} s`);
  });

  it('writes the caption, as one step for the typing', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    const caption = screen.getByRole('textbox', { name: 'Caption' });
    await user.clear(caption);
    await user.type(caption, 'Pip slides');
    await user.tab();
    expect(undo().textContent).toBe('Undo: Write frame 1.1’s caption');
  });

  it('deletes an empty frame straight away', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(screen.getByRole('button', { name: 'Add a frame' }));
    await user.click(screen.getByRole('button', { name: 'Delete frame' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(frameNumbers()).toEqual(['1.1']);
  });

  it('asks first when a frame has sketches or pinned lines', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(screen.getByRole('button', { name: 'Delete frame' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete frame 1.1?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(frameNumbers()).toEqual(['1.1']);
    await user.click(screen.getByRole('button', { name: 'Delete frame' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete frame' }),
    );
    expect(screen.getByText('No frames yet. Add one to start drawing this scene.')).toBeTruthy();
  });

  it('gives each frame a move handle', () => {
    render(<App start={exampleProduction()} />);
    expect(screen.getByRole('button', { name: 'Move frame 1.1' })).toBeTruthy();
  });
});
