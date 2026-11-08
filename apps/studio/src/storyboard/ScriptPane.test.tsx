import { exampleProduction } from '@storystage/production';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App.tsx';

const pane = () => screen.getByRole('complementary', { name: 'Script' });
const lineList = () => within(pane()).getByRole('grid', { name: /^Lines in scene/ });
const rows = () => within(lineList()).getAllByRole('row');
const lineTexts = () =>
  rows().map(
    (r) =>
      r.querySelector('.sb-line-speaker')!.textContent +
      ': ' +
      r.querySelector('.sb-line-text')!.textContent,
  );
const undo = () => screen.getByRole('button', { name: /^Undo/ });
const newLine = () => within(pane()).getByRole('textbox', { name: 'New line' });

describe('the script pane (10.4)', () => {
  it('shows the current scene’s lines in order, with their pins', () => {
    render(<App start={exampleProduction()} />);
    expect(within(pane()).getByText('Scene 1')).toBeTruthy();
    expect(lineTexts()).toEqual([
      'Action: Pip slides to the edge of the ice.',
      'PIP: Oh no, the ice is moving!',
    ]);
    expect(
      within(pane()).getByRole('button', { name: 'Pin line 1, now on frame 1.1' }),
    ).toBeTruthy();
    expect(within(pane()).getByRole('button', { name: 'Pin line 2' })).toBeTruthy();
    // Line 1 is pinned to the current frame, so it is highlighted and shows under the frame.
    expect(rows()[0]!.hasAttribute('data-current')).toBe(true);
    const under = screen.getByRole('list', { name: 'Lines pinned to frame 1.1' });
    expect(under.textContent).toContain('Pip slides to the edge of the ice.');
  });

  it('adds action with Enter, then dialogue said by whoever is named, each one step', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.type(newLine(), 'The ice cracks.{Enter}');
    expect(lineTexts().at(-1)).toBe('Action: The ice cracks.');
    expect(undo().textContent).toBe('Undo: Add line 3');
    expect((newLine() as HTMLInputElement).value).toBe('');
    const who = within(pane()).getByRole('combobox', { name: 'Who says it' });
    await user.clear(who);
    await user.type(who, 'Fox');
    await user.tab();
    await user.type(newLine(), 'Hold on!{Enter}');
    expect(lineTexts().at(-1)).toBe('Fox: Hold on!');
    await user.click(undo());
    expect(rows()).toHaveLength(3);
  });

  it('offers the scene’s cast and the script’s speakers as who says it', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(within(pane()).getAllByRole('button', { name: /^Show who can say it/ })[0]!);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Action', 'penguin', 'PIP', 'FOX']);
  });

  it('opens the chosen line to rewrite it, change who says it, or delete it', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(rows()[1]!);
    const text = within(pane()).getByRole('textbox', { name: 'Line 2' });
    await user.clear(text);
    await user.type(text, 'The ice!');
    await user.tab();
    expect(lineTexts()[1]).toBe('PIP: The ice!');
    expect(undo().textContent).toBe('Undo: Write line 2');
    const who = within(pane()).getByRole('combobox', { name: 'Who says line 2' });
    await user.clear(who);
    await user.type(who, 'Action');
    await user.tab();
    expect(lineTexts()[1]).toBe('Action: The ice!');
    expect(undo().textContent).toBe('Undo: Change who says line 2');
    await user.click(within(pane()).getByRole('button', { name: 'Delete line' }));
    expect(rows()).toHaveLength(1);
    expect(undo().textContent).toBe('Undo: Delete line 2');
    await user.click(undo());
    expect(rows()).toHaveLength(2);
  });

  it('pins a line to the current frame or another of the scene’s frames, and unpins it', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(screen.getByRole('button', { name: 'Add a frame' }));
    // Frame 1.2 is now current.
    await user.click(within(pane()).getByRole('button', { name: 'Pin line 2' }));
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent);
    expect(items).toEqual(['Pin to frame 1.2, this frame', 'Pin to frame 1.1']);
    await user.click(screen.getByRole('menuitem', { name: 'Pin to frame 1.2, this frame' }));
    expect(undo().textContent).toBe('Undo: Pin line 2 to frame 1.2');
    expect(rows()[1]!.hasAttribute('data-current')).toBe(true);
    expect(screen.getByRole('list', { name: 'Lines pinned to frame 1.2' }).textContent).toContain(
      'PIP: Oh no, the ice is moving!',
    );
    await user.click(within(pane()).getByRole('button', { name: 'Pin line 2, now on frame 1.2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Unpin' }));
    expect(undo().textContent).toBe('Undo: Unpin line 2');
    expect(screen.queryByRole('list', { name: 'Lines pinned to frame 1.2' })).toBeNull();
  });

  it('follows the chosen scene', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    const scenes = within(screen.getByRole('grid', { name: 'Scenes' })).getAllByRole('row');
    await user.click(scenes[1]!);
    expect(within(pane()).getByText('Scene 2')).toBeTruthy();
    expect(lineTexts()).toEqual(["FOX: Don't be scared. I'm lost too."]);
  });
});
