import { applyEdits, indexProgram, type NodeId } from '@storystage/ast';
import { TestHost } from '@storystage/editor-contract/testing';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TileEditor } from './editor.tsx';
import { fixture, IDS } from './fixture.ts';

let editor: TileEditor | null = null;

function setup(focus: NodeId = IDS.say) {
  const host = new TestHost(fixture(), { apply: (p, edits) => applyEdits(p, edits) });
  const element = document.createElement('div');
  document.body.append(element);
  editor = new TileEditor();
  act(() => editor!.mount(element, host, { method: IDS.main, selection: [], focus }));
  return { host, editor, user: userEvent.setup() };
}

afterEach(() => {
  if (editor) act(() => void editor!.unmount());
  editor = null;
  document.body.innerHTML = '';
});

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
const item = (name: string) =>
  screen.getByRole('treeitem', { name: new RegExp(`^${escape(name)}( add detail)?$`) });
const queryItem = (name: string) =>
  screen.queryByRole('treeitem', { name: new RegExp(`^${escape(name)}( add detail)?$`) });
const pill = (row: HTMLElement, text: string) =>
  within(row).getByText(text, { selector: '.tl-pill' });
/** The statements of `myFirstMethod`, as the host now holds them. */
const body = (host: TestHost) => host.program().types[0]!.methods[0]!.body.map((s) => s.id);
const last = (host: TestHost) => host.announcements.at(-1);
/** A menu choice: a `menuitemradio` where the menu marks the value there now, else a `menuitem`. */
async function option(name: string) {
  await screen.findByRole('menu');
  return screen.queryByRole('menuitem', { name }) ?? screen.getByRole('menuitemradio', { name });
}

describe('deleting, switching off, duplicating (spec 14, 3d)', () => {
  it('deletes a statement with Delete, as one undoable step', async () => {
    const { host, user } = setup();
    item('cat say Hello').focus();
    await user.keyboard('{Delete}');
    expect(queryItem('cat say Hello')).toBeNull();
    expect(last(host)).toBe('Delete cat say Hello');
    act(() => host.undo());
    expect(item('cat say Hello')).toBeTruthy();
  });

  it('moves focus to the next statement after a delete', async () => {
    const { user } = setup();
    item('cat say Hello').focus();
    await user.keyboard('{Delete}');
    expect(document.activeElement).toBe(item('do together'));
  });

  it('switches a statement off and on with Ctrl+/', async () => {
    const { host, user } = setup();
    item('cat say Hello').focus();
    await user.keyboard('{Control>}/{/Control}');
    expect(item('cat say Hello (switched off)')).toBeTruthy();
    expect(last(host)).toBe('Switch off cat say Hello');
    await user.keyboard('{Control>}/{/Control}');
    expect(item('cat say Hello')).toBeTruthy();
  });

  it('duplicates with Ctrl+D, below the original', async () => {
    const { host, user } = setup();
    item('cat say Hello').focus();
    await user.keyboard('{Control>}d{/Control}');
    expect(screen.getAllByRole('treeitem', { name: /^cat say Hello/ })).toHaveLength(2);
    expect(body(host)).toHaveLength(6);
    expect(last(host)).toBe('Make cat say Hello');
  });

  it('copies and pastes with new ids', async () => {
    const { host, user } = setup(IDS.ouch);
    item('cat say Ouch').focus();
    await user.keyboard('{Control>}c{/Control}');
    expect(last(host)).toBe('Copied cat say Ouch');
    item('drop statement here, in if').focus();
    await user.keyboard('{Control>}v{/Control}');
    const ids = [...indexProgram(host.program()).keys()];
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getAllByRole('treeitem', { name: /^cat say Ouch/ })).toHaveLength(2);
  });

  it('moves a statement down within its list with Alt+↓, and says when it can’t', async () => {
    const { host, user } = setup();
    item('cat say Hello').focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(body(host).slice(0, 2)).toEqual([IDS.together, IDS.say]);
    await user.keyboard('{Alt>}{ArrowUp}{ArrowUp}{/Alt}');
    expect(last(host)).toBe('That’s already at the top.');
  });
});

describe('moving by keyboard: pick up, move, put down (spec 14, 3d)', () => {
  it('picks up with Space, moves with the arrows and puts down with Space', async () => {
    const { host, user } = setup();
    item('cat say Hello').focus();
    await user.keyboard(' ');
    expect(last(host)).toMatch(/^Moving cat say Hello/);
    expect(item('cat say Hello').className).toContain('tl-lifted');
    await user.keyboard('{ArrowDown}');
    expect(last(host)).toBe('Drops at 1 of 3 in do together');
    await user.keyboard('{ArrowUp}');
    expect(last(host)).toBe('Drops at 1 of 6 in Scene1.myFirstMethod');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    expect(last(host)).toBe('Move cat say Hello into do together');
    const together = host.program().types[0]!.methods[0]!.body.find((s) => s.id === IDS.together)!;
    expect((together as unknown as { body: { id: string }[] }).body[0]!.id).toBe(IDS.say);
    expect(document.activeElement).toBe(item('cat say Hello'));
  });

  it('puts it back where it was with Escape', async () => {
    const { host, user } = setup();
    item('cat say Hello').focus();
    await user.keyboard(' {ArrowDown}{Escape}');
    expect(last(host)).toBe('Left where it was');
    expect(body(host)[0]).toBe(IDS.say);
    expect(item('cat say Hello').className).not.toContain('tl-lifted');
  });

  it('never stops anywhere the statement can’t go, such as inside itself', async () => {
    const { host, user } = setup(IDS.together);
    item('do together').focus();
    await user.keyboard(' ');
    for (let i = 0; i < 4; i++) await user.keyboard('{ArrowDown}');
    expect(host.announcements.filter((a) => a.includes('in do together'))).toEqual([]);
  });
});

describe('values (spec 14, 3e)', () => {
  it('opens the menu of values that fit with Enter, and changes the value', async () => {
    const { host, user } = setup(IDS.move);
    const move = item('cat move forward 1 how long 2');
    move.focus();
    await user.keyboard('{ArrowRight}{Enter}');
    const menu = await screen.findByRole('menu', { name: 'direction' });
    expect(
      within(menu).getByRole('menuitemradio', { name: 'forward' }).getAttribute('aria-checked'),
    ).toBe('true');
    await user.click(await option('backward'));
    expect(item('cat move backward 1 how long 2')).toBeTruthy();
    expect(last(host)).toBe('Change forward to backward in cat move');
  });

  it('opens it with a click too', async () => {
    const { user } = setup(IDS.move);
    await user.click(pill(item('cat move forward 1 how long 2'), '1'));
    expect(await screen.findByRole('menu', { name: 'amount' })).toBeTruthy();
  });

  it('closes with Escape and changes nothing', async () => {
    const { host, user } = setup(IDS.move);
    await user.click(pill(item('cat move forward 1 how long 2'), '1'));
    await screen.findByRole('menu', { name: 'amount' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(host.changes).toHaveLength(0);
  });

  it('takes a typed number, and refuses one that isn’t', async () => {
    const { host, user } = setup(IDS.move);
    await user.click(pill(item('cat move forward 1 how long 2'), '1'));
    await user.click(await option('Other number…'));
    const field = await screen.findByRole('textbox', { name: 'amount' });
    await user.type(field, 'far{Enter}');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'That isn’t a number. Type digits, like 2 or 0.5.',
    );
    await user.clear(field);
    await user.type(field, '2.5{Enter}');
    expect(item('cat move forward 2.5 how long 2')).toBeTruthy();
    expect(last(host)).toBe('Change 1 to 2.5 in cat move');
  });

  it('adds a detail, then asks for its value', async () => {
    const { host, user } = setup(IDS.say);
    await user.click(within(item('cat say Hello')).getByRole('button', { name: 'add detail' }));
    await user.click(await option('how long'));
    await user.click(await option('2'));
    expect(item('cat say Hello how long 2')).toBeTruthy();
    expect(last(host)).toBe('Add how long to cat say');
  });

  it('takes a detail back out from its own menu', async () => {
    const { host, user } = setup(IDS.move);
    await user.click(pill(item('cat move forward 1 how long 2'), '2'));
    await user.click(await option('Take how long out'));
    expect(item('cat move forward 1')).toBeTruthy();
    expect(last(host)).toBe('Take how long out of cat move');
  });
});

describe('the contract’s commands (spec 14, 1)', () => {
  it('run on the statement in focus', () => {
    const { host, editor: e } = setup(IDS.ouch);
    act(() => void e.command('toggleEnabled'));
    expect(item('cat say Ouch (switched off)')).toBeTruthy();
    act(() => void e.command('delete'));
    expect(queryItem('cat say Ouch (switched off)')).toBeNull();
    expect(body(host)).toHaveLength(5);
  });

  it('say why when there’s nothing to paste', () => {
    const { host, editor: e } = setup();
    act(() => void e.command('paste'));
    expect(last(host)).toBe('Copy a block first, then paste it.');
  });
});
