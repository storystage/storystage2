import { applyEdits, type NodeId } from '@storystage/ast';
import { TestHost } from '@storystage/editor-contract/testing';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TileEditor } from './editor.tsx';
import { fixture, IDS } from './fixture.ts';

let editor: TileEditor | null = null;

function setup(focus: NodeId | null = null) {
  const host = new TestHost(fixture(), { apply: (p, edits) => applyEdits(p, edits) });
  const element = document.createElement('div');
  document.body.append(element);
  editor = new TileEditor();
  act(() => editor!.mount(element, host, { method: IDS.main, selection: [], focus }));
  return { host, user: userEvent.setup() };
}

afterEach(() => {
  if (editor) act(() => void editor!.unmount());
  editor = null;
  document.body.innerHTML = '';
});

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
const item = (name: string) =>
  screen.getByRole('treeitem', { name: new RegExp(`^${escape(name)}( add detail)?$`) });
const body = (host: TestHost) => host.program().types[0]!.methods[0]!.body;
const last = (host: TestHost) => host.announcements.at(-1);
/** A palette block, by its words. */
const block = (words: string) => screen.getByRole('option', { name: words });
/**
 * The menu now open. happy-dom never moves focus onto its first choice, as a browser does a
 * frame later, so these tests click; the keyboard path is in `e2e/tiles.e2e.ts`.
 */
async function menu(name: string) {
  return screen.findByRole('menu', { name });
}
/** A menu choice, `menuitemradio` where the menu marks one, else `menuitem`. */
async function choice(name: string) {
  await screen.findByRole('menu');
  return screen.queryByRole('menuitem', { name }) ?? screen.getByRole('menuitemradio', { name });
}
async function chooseObject(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: /Blocks for/ }));
  await user.click(await screen.findByRole('option', { name }));
}

describe('the methods panel (spec 14, 3a and 2.1)', () => {
  it('offers the scene and its objects, and the chosen one’s blocks', async () => {
    const { user } = setup();
    expect(screen.getByRole('button', { name: /Blocks for/ }).textContent).toContain('the scene');
    await user.click(screen.getByRole('button', { name: /Blocks for/ }));
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(['the scene', 'camera', 'cat', 'chair']));
    await user.click(screen.getByRole('option', { name: 'cat' }));
    expect(block('cat move ??? ???')).toBeTruthy();
    expect(screen.getByText('say, think')).toBeTruthy();
  });

  it('shows questions on their own tab', async () => {
    const { user } = setup();
    await chooseObject(user, 'cat');
    await user.click(screen.getByRole('tab', { name: 'Questions' }));
    expect(block('cat is touching ???')).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'cat say ???' })).toBeNull();
  });
});

describe('putting in a block (spec 14, 2.3)', () => {
  it('asks for each value in turn, then puts the block in as one step', async () => {
    const { host, user } = setup();
    await chooseObject(user, 'cat');
    await user.click(block('cat move ??? ???'));
    const direction = await menu('direction');
    // An empty value opens on the cascade's suggestion.
    expect(
      within(direction)
        .getByRole('menuitemradio', { name: 'forward' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(host.changes).toHaveLength(0);
    await user.click(await choice('forward'));
    expect(
      within(await menu('amount'))
        .getByRole('menuitemradio', { name: '1' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    await user.click(await choice('1'));
    expect(host.changes).toHaveLength(1);
    expect(last(host)).toBe('Make cat move forward 1');
    expect(body(host).at(-1)).toMatchObject({ kind: 'call', callee: { name: 'move' } });
  });

  it('changes nothing if Escape is pressed part way', async () => {
    const { host, user } = setup();
    await chooseObject(user, 'cat');
    await user.click(block('cat move ??? ???'));
    await menu('direction');
    await user.click(await choice('forward'));
    await menu('amount');
    await user.keyboard('{Escape}');
    expect(host.changes).toHaveLength(0);
    expect(last(host)).toBe('Nothing added');
    expect(screen.queryByRole('treeitem', { name: /cat move forward \?\?\?/ })).toBeNull();
  });

  it('puts a block in after the statement in focus', async () => {
    const { host, user } = setup(IDS.say);
    await chooseObject(user, 'cat');
    await user.click(block('cat say ???'));
    await user.click(await choice('Other words…'));
    await user.type(await screen.findByRole('textbox', { name: 'words' }), 'Bye{Enter}');
    expect(body(host)[1]).toMatchObject({ kind: 'call', args: { text: { value: 'Bye' } } });
    expect(last(host)).toBe('Make cat say Bye');
  });

  it('puts a block with nothing to ask straight in', async () => {
    const { host, user } = setup();
    await chooseObject(user, 'cat');
    await user.click(block('cat straighten out joints'));
    expect(host.changes).toHaveLength(1);
    expect(last(host)).toBe('Make cat straighten out joints');
  });
});

describe('the control bar (spec 14, 3a)', () => {
  it('puts in a container with nothing to ask', async () => {
    const { host, user } = setup(IDS.note);
    await user.click(screen.getByRole('button', { name: 'do together' }));
    expect(last(host)).toBe('Add do together');
    expect(body(host).at(-1)!.kind).toBe('doTogether');
  });

  it('asks for a count first', async () => {
    const { host, user } = setup(IDS.note);
    await user.click(screen.getByRole('button', { name: 'count' }));
    await menu('how many times');
    await user.click(await choice('3'));
    expect(last(host)).toBe('Add count up to 3');
  });

  it('is one toolbar: the arrows move along it, and Tab leaves it', async () => {
    const { user } = setup();
    const bar = screen.getByRole('toolbar', { name: 'Control blocks' });
    const buttons = within(bar).getAllByRole('button');
    buttons[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(buttons[1]);
    await user.tab();
    expect(bar.contains(document.activeElement)).toBe(false);
  });
});

describe('the variable and set tiles (spec 14, 2.3)', () => {
  /** Makes a variable `name` holding a whole number, starting as 2, after the note. */
  async function makeVariable(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(screen.getByRole('button', { name: 'variable' }));
    const dialog = await screen.findByRole('dialog', { name: 'A new variable' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Its name' }), name);
    await user.click(within(dialog).getByRole('radio', { name: 'a whole number' }));
    await user.click(within(dialog).getByRole('button', { name: 'Use it' }));
    await screen.findByRole('menu');
    await user.click(await choice('2'));
  }

  it('asks a variable’s name and what it holds, then what it starts as', async () => {
    const { host, user } = setup(IDS.note);
    await makeVariable(user, 'steps');
    expect(body(host).at(-1)).toMatchObject({
      kind: 'local',
      name: 'steps',
      type: { kind: 'story', name: 'WholeNumber' },
      value: { kind: 'wholeNumber', value: 2 },
    });
    expect(host.changes).toHaveLength(1);
    expect(last(host)).toMatch(/steps/);
  });

  it('says what’s wrong with a name, and puts nothing in until it’s right', async () => {
    const { host, user } = setup(IDS.note);
    await makeVariable(user, 'steps');
    await user.click(screen.getByRole('button', { name: 'variable' }));
    const dialog = await screen.findByRole('dialog', { name: 'A new variable' });
    const field = within(dialog).getByRole('textbox', { name: 'Its name' });
    const use = within(dialog).getByRole('button', { name: 'Use it' });
    await user.click(use);
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Give it a name.');
    await user.type(field, '2nd');
    await user.click(use);
    expect(within(dialog).getByRole('alert').textContent).toMatch(/^A name starts with a letter/);
    await user.clear(field);
    await user.type(field, 'steps');
    await user.click(use);
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'steps is already used here. Choose another name.',
    );
    expect(host.changes).toHaveLength(1);
  });

  it('sets a variable chosen from those above it, asking for its new value', async () => {
    const { host, user } = setup(IDS.note);
    await makeVariable(user, 'steps');
    await user.click(screen.getByRole('button', { name: 'set' }));
    await menu('Which variable to set');
    await user.click(await choice('steps'));
    await screen.findByRole('menu');
    await user.click(await choice('3'));
    const set = body(host).at(-1)!;
    expect(set).toMatchObject({ kind: 'assign', value: { kind: 'wholeNumber', value: 3 } });
    expect(host.changes).toHaveLength(2);
  });

  it('says so when there’s no variable to set, and changes nothing', async () => {
    const { host, user } = setup(IDS.note);
    await user.click(screen.getByRole('button', { name: 'set' }));
    expect(last(host)).toMatch(/^There’s no variable here to set/);
    expect(host.changes).toHaveLength(0);
  });

  it('puts in nothing if the question is closed with Escape', async () => {
    const { host, user } = setup(IDS.note);
    await user.click(screen.getByRole('button', { name: 'variable' }));
    await screen.findByRole('dialog', { name: 'A new variable' });
    await user.keyboard('{Escape}');
    expect(last(host)).toBe('Nothing added');
    expect(host.changes).toHaveLength(0);
  });
});

describe('questions (spec 14, 2.1)', () => {
  it('go into the value in focus, then ask for their own values', async () => {
    const { host, user } = setup(IDS.move);
    item('cat move forward 1 how long 2').focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(document.activeElement?.textContent).toBe('1');
    await chooseObject(user, 'cat');
    await user.click(screen.getByRole('tab', { name: 'Questions' }));
    await user.click(block('cat distance to ???'));
    await menu('the other one');
    await user.click(await choice('chair'));
    expect(last(host)).toBe('Change 1 to cat distance to chair in cat move');
  });

  it('say where to go first when no value is in focus', async () => {
    const { host, user } = setup();
    await chooseObject(user, 'cat');
    await user.click(screen.getByRole('tab', { name: 'Questions' }));
    await user.click(block('cat is touching ???'));
    expect(last(host)).toMatch(/^Choose where a question goes first/);
  });
});

describe('events and method tabs (spec 14, 3a)', () => {
  it('adds an event handler as a new tab, opened, with its values to fill', async () => {
    const { host, user } = setup();
    await user.click(screen.getByRole('button', { name: 'add event' }));
    await user.click(await screen.findByRole('menuitem', { name: 'every ??? seconds' }));
    expect(last(host)).toBe('Add every ??? seconds');
    expect(
      screen.getByRole('tab', { name: 'every ??? seconds' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(host.program().types[0]!.listeners).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '???, seconds' }));
    await user.click(await choice('2'));
    expect(screen.getByRole('tab', { name: 'every 2 seconds' })).toBeTruthy();
  });

  it('switches between methods', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'add event' }));
    await user.click(await screen.findByRole('menuitem', { name: 'when the scene starts' }));
    expect(screen.getByRole('tree', { name: 'when the scene starts' })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Scene1.myFirstMethod' }));
    expect(screen.getByRole('tree', { name: 'Scene1.myFirstMethod' })).toBeTruthy();
  });
});
