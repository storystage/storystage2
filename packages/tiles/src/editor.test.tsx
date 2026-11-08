import { applyEdits, validateProgram } from '@storystage/ast';
import { TestHost } from '@storystage/editor-contract/testing';
import { checkProgram } from '@storystage/story-api/program-check';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TileEditor } from './editor.tsx';
import { fixture, IDS } from './fixture.ts';

let editor: TileEditor | null = null;

function mountEditor(view?: Parameters<TileEditor['mount']>[2]) {
  const host = new TestHost(fixture(), { apply: (p, edits) => applyEdits(p, edits) });
  const element = document.createElement('div');
  document.body.append(element);
  editor = new TileEditor();
  act(() => editor!.mount(element, host, view));
  return { host, element, editor };
}

afterEach(() => {
  if (editor) act(() => void editor!.unmount());
  editor = null;
  document.body.innerHTML = '';
});

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
/** A row by its words; a row that can take a detail also ends "add detail", as it shows. */
const item = (name: string) =>
  screen.getByRole('treeitem', { name: new RegExp(`^${escape(name)}( add detail)?$`) });
/** The words a pill is described by: what it's for. */
const describedBy = (el: Element | null) =>
  document.getElementById(el?.getAttribute('aria-describedby') ?? '')?.textContent;
/** The pill in a row showing `text`. */
const pill = (row: HTMLElement, text: string) =>
  within(row).getByText(text, { selector: '.tl-pill' });
const visible = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('the fixture', () => {
  it('is a valid program for S2 and the Story API', () => {
    expect(validateProgram(fixture())).toEqual([]);
    expect(checkProgram(fixture())).toEqual([]);
  });
});

describe('drawing (spec 14, 3b, 3f)', () => {
  it('opens the first method, named as a tree by its declaration', () => {
    mountEditor();
    expect(screen.getByRole('tree', { name: 'Scene1.myFirstMethod' })).toBeTruthy();
  });

  it('names each statement by the words it shows, details too', () => {
    mountEditor();
    for (const name of [
      'cat say Hello',
      'do together',
      'cat move forward 1 how long 2',
      'count up to 2',
      'cat say Hop',
      'if cat is touching chair',
      'cat say Ouch',
      'Now the cat looks around',
    ])
      expect(item(name)).toBeTruthy();
  });

  it('includes what a row shows in its name, for speech control (WCAG 2.5.3)', () => {
    mountEditor();
    for (const row of screen.getAllByRole('treeitem')) {
      const name = row.getAttribute('aria-label') ?? visible(row);
      const own = visible(row)
        .replace(/ ?\(switched off\)$/, '')
        .replace(/ ▾$/, '');
      expect(name, own).toContain(own.split(' drop statement here')[0]);
    }
  });

  it('greys a switched-off statement and says so', () => {
    mountEditor();
    expect(item('cat turn left 0.25 (switched off)').className).toContain('tl-off');
  });

  it('nests a container’s statements a level down', () => {
    mountEditor();
    expect(item('do together').getAttribute('aria-level')).toBe('1');
    expect(item('do together').getAttribute('aria-expanded')).toBe('true');
    const move = item('cat move forward 1 how long 2');
    expect(move.getAttribute('aria-level')).toBe('2');
    expect(move.getAttribute('aria-posinset')).toBe('1');
    expect(move.getAttribute('aria-setsize')).toBe('2');
  });

  it('names a container by its own row, not its statements', () => {
    mountEditor();
    expect(item('count up to 2').textContent).not.toContain('Hop');
  });

  it('shows an empty list as a place to drop a statement', () => {
    mountEditor();
    expect(item('drop statement here, in if').textContent).toBe('drop statement here');
  });

  it('names each value pill by its value and describes what it is for', () => {
    mountEditor();
    const move = item('cat move forward 1 how long 2');
    expect(describedBy(pill(move, '1'))).toBe('amount');
    expect(describedBy(pill(move, 'forward'))).toBe('direction');
    expect(describedBy(pill(move, '2'))).toBe('how long');
  });

  it('draws a question in a value as a question tile', () => {
    mountEditor();
    const condition = pill(item('if cat is touching chair'), 'cat is touching chair');
    expect(condition.className).toContain('tl-pill-question');
    expect(describedBy(condition)).toBe('condition');
  });
});

describe('the keyboard (spec 14, 3d)', () => {
  it('gives one row the tab stop, the first by default', () => {
    mountEditor();
    const stops = [...screen.getByRole('tree').querySelectorAll('[tabindex="0"]')];
    expect(stops.map((e) => e.getAttribute('data-key'))).toEqual([IDS.say]);
  });

  it('moves between rows with the arrows, Home and End', async () => {
    const user = userEvent.setup();
    mountEditor();
    item('cat say Hello').focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item('do together'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item('cat move forward 1 how long 2'));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(item('Now the cat looks around'));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(item('cat say Hello'));
  });

  it('moves into a row’s pills and back out', async () => {
    const user = userEvent.setup();
    mountEditor({ method: IDS.main, selection: [], focus: IDS.move });
    item('cat move forward 1 how long 2').focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement?.textContent).toBe('forward');
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement?.textContent).toBe('1');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(document.activeElement).toBe(item('cat move forward 1 how long 2'));
  });

  it('keeps the tab stop where the learner is', async () => {
    const user = userEvent.setup();
    mountEditor();
    item('cat say Hello').focus();
    await user.keyboard('{ArrowDown}');
    expect(item('do together').tabIndex).toBe(0);
    expect(item('cat say Hello').tabIndex).toBe(-1);
  });
});

describe('the contract (spec 14, 1)', () => {
  it('redraws when the program changes, whatever changed it', () => {
    const { host } = mountEditor();
    const edit = {
      kind: 'setArgument',
      node: IDS.move,
      slot: 'args',
      param: 'amount',
      value: { id: 'twotwo', kind: 'number', value: 2 },
      label: 'Change 1 to 2 in cat move',
    } as const;
    act(() => void host.apply([edit as never], edit.label, 'blocks'));
    expect(item('cat move forward 2 how long 2')).toBeTruthy();
  });

  it('opens where the other editor left off, and hands back where the learner was', () => {
    const { editor: e } = mountEditor({ method: IDS.main, selection: [], focus: IDS.count });
    expect(item('count up to 2').tabIndex).toBe(0);
    expect(e.selection()).toEqual([IDS.count]);
    let view: ReturnType<TileEditor['unmount']> | null = null;
    act(() => void (view = e.unmount()));
    editor = null;
    expect(view).toEqual({ method: IDS.main, selection: [IDS.count], focus: IDS.count });
  });

  it('moves focus to a block when asked', () => {
    const { editor: e } = mountEditor();
    act(() => e.focus(IDS.ouch));
    expect(document.activeElement).toBe(item('cat say Ouch'));
  });

  it('shows highlights of each kind, and clears them', () => {
    const { editor: e } = mountEditor();
    act(() => e.highlight([IDS.say], 'rehearse'));
    act(() => e.highlight([IDS.say], 'prompter'));
    expect(item('cat say Hello').className).toContain('tl-hl-rehearse');
    expect(item('cat say Hello').className).toContain('tl-hl-prompter');
    act(() => e.highlight([], 'rehearse'));
    expect(item('cat say Hello').className).not.toContain('tl-hl-rehearse');
  });

  it('highlights a container’s whole box', () => {
    const { editor: e } = mountEditor();
    act(() => e.highlight([IDS.count], 'error'));
    expect(item('count up to 2').closest('li')?.className).toContain('tl-hl-error');
  });

  it('is called Tiles', () => {
    const { editor: e } = mountEditor();
    expect(e.displayName).toBe('Tiles');
  });
});
