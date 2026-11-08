import { exampleProduction, type Production } from '@storystage/production';
import { SKETCH_LIMIT } from '@storystage/sketches';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App.tsx';

const library = () => screen.getByRole('complementary', { name: 'Sketches' });
const sketchList = () => screen.getByRole('listbox', { name: /^Sketches on frame/ });
const sketches = () => within(sketchList()).getAllByRole('option');
const names = () => sketches().map((o) => o.getAttribute('aria-label'));
const undo = () => screen.getByRole('button', { name: /^Undo/ });
const tools = () => screen.getByRole('toolbar', { name: 'Sketch tools' });
const live = () => document.querySelector('[aria-live="polite"]')!.textContent;

/** The example with frame 1.1 holding `count` stand-ins. */
function withSketches(count: number): Production {
  const p = exampleProduction();
  const [first, ...rest] = p.frames;
  const sketchesOn = Array.from({ length: count }, (_, i) => ({
    ...first!.sketches[0]!,
    id: `k${i + 1}`,
    item: { standIn: 'fox' },
    layer: i,
  }));
  return { ...p, frames: [{ ...first!, sketches: sketchesOn }, ...rest] };
}

describe('the sketch library (10.6)', () => {
  it('offers the cast, the marks and the backdrops', () => {
    render(<App start={exampleProduction()} />);
    const lists = within(library()).getAllByRole('grid');
    expect(lists.map((l) => l.getAttribute('aria-label'))).toEqual([
      'Cast and props',
      'Marks',
      'Backdrops',
    ]);
    const cast = within(lists[0]!).getAllByRole('row');
    expect(cast.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Add penguin to frame 1.1',
      'Add fox to frame 1.1',
    ]);
    expect(within(lists[1]!).getAllByRole('row')).toHaveLength(5);
    expect(within(lists[2]!).getAllByRole('row')).toHaveLength(8);
  });

  it('puts a sketch in the middle of the frame, in front, as one undo step', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    expect(names()).toEqual(['penguin, in the middle']);
    await user.click(
      within(library()).getByRole('row', { name: 'Add Speech bubble to frame 1.1' }),
    );
    expect(names()).toEqual(['penguin, in the middle', 'Speech bubble, in the middle']);
    expect(sketches()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(undo().textContent).toBe('Undo: Add Speech bubble');
    expect(live()).toBe('Speech bubble added to frame 1.1.');
    await user.click(undo());
    expect(names()).toEqual(['penguin, in the middle']);
  });

  it('adds with Enter from the keyboard', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    within(library()).getByRole('row', { name: 'Add fox to frame 1.1' }).focus();
    await user.keyboard('{Enter}');
    expect(names()).toEqual(['penguin, in the middle', 'fox, in the middle']);
  });

  it(`says so when the frame holds ${SKETCH_LIMIT} sketches, and adds no more`, async () => {
    const user = userEvent.setup();
    render(<App start={withSketches(SKETCH_LIMIT)} />);
    expect(within(library()).getByText(/holds 30 sketches/)).toBeTruthy();
    const fox = within(library()).getByRole('row', { name: 'Add fox to frame 1.1' });
    expect(fox.getAttribute('aria-disabled')).toBe('true');
    await user.click(fox);
    expect(sketches()).toHaveLength(SKETCH_LIMIT);
  });
});

describe('the frame canvas (10.6)', () => {
  it('picks a sketch up with Enter, moves it with the arrow keys, puts it down: one step', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    const penguin = sketches()[0]!;
    expect(penguin.style.left).toBe('40%');
    penguin.focus();
    await user.keyboard('{Enter}');
    expect(live()).toMatch(/^Picked up penguin\./);
    await user.keyboard('{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}{ArrowLeft}{ArrowUp}');
    expect(sketches()[0]!.style.left).toBe('19%');
    expect(sketches()[0]!.style.top).toBe('59%');
    await user.keyboard('{Enter}');
    expect(live()).toBe('Put down penguin, on the left.');
    expect(names()).toEqual(['penguin, on the left']);
    expect(undo().textContent).toBe('Undo: Move penguin');
    await user.click(undo());
    expect(sketches()[0]!.style.left).toBe('40%');
  });

  it('only moves a sketch while it is picked up: the arrow keys choose between sketches', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(within(library()).getByRole('row', { name: 'Add fox to frame 1.1' }));
    sketches()[1]!.focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(sketches()[0]);
    expect(sketches()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(sketches()[0]!.style.left).toBe('40%');
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(sketches()[1]);
  });

  it('resizes with + and − while picked up', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    sketches()[0]!.focus();
    await user.keyboard('{Enter}++{Enter}');
    expect(sketches()[0]!.style.height).toBe('36.3%');
    expect(undo().textContent).toBe('Undo: Make penguin bigger');
    sketches()[0]!.focus();
    await user.keyboard('{Enter}-{Escape}');
    expect(sketches()[0]!.style.height).toBe('33%');
  });

  it('flips, layers, resizes and removes the chosen sketch from its toolbar', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(within(library()).getByRole('row', { name: 'Add fox to frame 1.1' }));
    const bar = () => within(tools());
    expect(bar().getByRole('button', { name: 'Bring forward' }).hasAttribute('disabled')).toBe(
      true,
    );
    await user.click(bar().getByRole('button', { name: 'Flip' }));
    expect(names()[1]).toBe('fox, in the middle, facing the other way');
    expect(undo().textContent).toBe('Undo: Flip fox');
    await user.click(bar().getByRole('button', { name: 'Send back' }));
    expect(names()).toEqual(['fox, in the middle, facing the other way', 'penguin, in the middle']);
    expect(undo().textContent).toBe('Undo: Send fox back');
    await user.click(bar().getByRole('button', { name: 'Bigger' }));
    expect(undo().textContent).toBe('Undo: Make fox bigger');
    await user.click(bar().getByRole('button', { name: 'Remove' }));
    expect(names()).toEqual(['penguin, in the middle']);
    expect(undo().textContent).toBe('Undo: Remove fox');
    expect(live()).toBe('fox removed.');
  });

  it('removes the chosen sketch with Delete, and says what to do on an empty frame', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    sketches()[0]!.focus();
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('listbox', { name: /^Sketches on frame/ })).toBeNull();
    expect(screen.getByText(/^Drag sketches here/)).toBeTruthy();
    expect(screen.queryByRole('toolbar', { name: 'Sketch tools' })).toBeNull();
    await user.click(undo());
    expect(names()).toEqual(['penguin, in the middle']);
  });

  it('keeps each frame’s sketches to itself', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(screen.getByRole('button', { name: 'Add a frame' }));
    expect(screen.getByText(/^Drag sketches here/)).toBeTruthy();
    expect(within(library()).getByRole('row', { name: 'Add fox to frame 1.2' })).toBeTruthy();
  });
});
