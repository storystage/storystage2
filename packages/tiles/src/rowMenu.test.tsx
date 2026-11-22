import { applyEdits } from '@storystage/ast';
import { TestHost } from '@storystage/editor-contract/testing';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TileEditor } from './editor.tsx';
import { fixture, IDS } from './fixture.ts';

// A row's menu (spec 14, 3c.7): the shared statement menu, opened by right-click, a long press
// by touch or pen, or the Menu key and Shift+F10, so the commands work without a keyboard.

let editor: TileEditor | null = null;

function setup() {
  const host = new TestHost(fixture(), { apply: (p, edits) => applyEdits(p, edits) });
  const element = document.createElement('div');
  document.body.append(element);
  editor = new TileEditor();
  act(() => editor!.mount(element, host, { method: IDS.main, selection: [], focus: null }));
  return { host, user: userEvent.setup() };
}

afterEach(() => {
  vi.useRealTimers();
  if (editor) act(() => void editor!.unmount());
  editor = null;
  document.body.innerHTML = '';
});

const row = (id: string) => document.querySelector<HTMLElement>(`[data-key="${id}"]`)!;
const top = (host: TestHost) => host.program().types[0]!.methods[0]!.body.map((s) => s.id);
const items = () =>
  screen.getAllByRole('menuitem').map((i) => i.textContent?.replace(/\s+/g, ' ').trim());

describe('a row’s menu (spec 14, 3c.7)', () => {
  it('opens on a right-click with the shared menu’s items, named for its statement', () => {
    setup();
    fireEvent.contextMenu(row(IDS.say));
    expect(screen.getByRole('menu', { name: 'Menu for cat say' })).toBeTruthy();
    // Switch off first, the details it can take, then the moves, duplicate and delete. The first
    // statement can't move up.
    const all = items();
    expect(all[0]).toBe('Switch off');
    expect(all).toContain('Add detail: how long');
    expect(all).not.toContain('Move up');
    expect(all.slice(-3)).toEqual(['Move down', 'Duplicate', 'Delete']);
  });

  it('deletes from the menu as Delete does: one step, with the same label', async () => {
    const { host, user } = setup();
    fireEvent.contextMenu(row(IDS.say));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(top(host)).not.toContain(IDS.say);
    expect(host.announcements.at(-1)).toBe('Delete cat say Hello');
  });

  it('moves a statement down a place from the menu', async () => {
    const { host, user } = setup();
    const before = top(host);
    fireEvent.contextMenu(row(IDS.say));
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(top(host).slice(0, 2)).toEqual([before[1], before[0]]);
  });

  it('opens from the keyboard with Shift+F10', async () => {
    const { user } = setup();
    row(IDS.say).focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.getByRole('menu', { name: 'Menu for cat say' })).toBeTruthy();
  });

  it('opens on a long press by touch, held still, and not on one that moves', () => {
    vi.useFakeTimers();
    setup();
    const target = row(IDS.say);
    const at = { clientX: 20, clientY: 20, pointerType: 'touch', button: 0 };
    fireEvent.pointerDown(target, at);
    fireEvent.pointerMove(target, { ...at, clientY: 60 });
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.pointerUp(target, at);
    fireEvent.pointerDown(target, at);
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.getByRole('menu', { name: 'Menu for cat say' })).toBeTruthy();
  });

  it('lets a click open a pill’s menu as soon as the page opens, with no long press before it', () => {
    setup();
    // An event's time counts from when the page opened: a click 100 ms in.
    const click = new MouseEvent('click', { bubbles: true, button: 0 });
    Object.defineProperty(click, 'timeStamp', { value: 100 });
    const forward = document.querySelector<HTMLElement>(`[data-key="${IDS.move}"] [data-pill]`)!;
    act(() => void forward.dispatchEvent(click));
    expect(screen.getByRole('menu', { name: 'direction' })).toBeTruthy();
  });

  it('adds a detail from the menu through its cascade', async () => {
    const { host, user } = setup();
    fireEvent.contextMenu(row(IDS.say));
    await user.click(screen.getByRole('menuitem', { name: 'Add detail: how long' }));
    await screen.findByRole('menu', { name: 'how long' });
    await user.click(screen.getByRole('menuitemradio', { name: '2' }));
    expect(host.announcements.at(-1)).toBe('Add how long to cat say');
  });
});
